// Durable job worker for the Instagram DM pipeline. Jobs live in the store with leases and bounded retry, so a
// crash, restart or Cloud Run CPU throttle after the webhook's 200 never loses work: an expired lease simply
// becomes runnable again. Triggered by the private internal endpoint (Cloud Scheduler / Cloud Tasks / VM cron)
// or by the optional in-process poller.
import crypto from 'node:crypto';
import type { DmAnalysisBasis, DmNote, IngestKind, Memory, MemoryAnalysis, MemoryMedia } from '../../src/types/neophi.js';
import { suggestCategoryForMemory } from '../analysis.js';
import { buildEmbeddingText, type GeminiService } from '../gemini.js';
import { guardAnalysis } from '../guard.js';
import type { MediaStorage } from '../storage.js';
import type { NeophiStore } from '../store.js';
import type { InstagramConfig } from './config.js';
import { logEvent } from './log.js';
import type { Resolved, VideoResolver } from './resolvers.js';
import { fetchAuthorizedMedia, lookupGraphAttachment, type FetchLike, type MediaFetchResult } from './media.js';
import { createReplier, REPLY_TEXT, type Replier, type ReplyKind } from './reply.js';
import {
  MEDIA_RETRY_DELAYS_MS,
  memoryIdForEvent,
  type InstagramEventRecord,
  type InstagramJob,
  type JobSettlement,
  type ShareFinalizeInput,
} from './model.js';

export interface WorkerDeps {
  store: NeophiStore;
  storage: MediaStorage;
  gemini: GeminiService;
  config: InstagramConfig;
  /** Fallback video getters for a Reel whose DM carried only a page link. None unless configured. */
  resolvers?: VideoResolver[];
  /** Status DMs to the person. Built from the config (off unless switched on) when not given. */
  replier?: Replier | null;
  fetchImpl?: FetchLike;
  now?: () => number;
}

export interface WorkerRunSummary {
  leased: number;
  done: number;
  retried: number;
  dead: number;
  /** Settlements refused because another worker took over the lease. */
  lostLease: number;
}

class RetryLater extends Error {
  constructor(readonly outcome: string, readonly delayMs?: number) {
    super(outcome);
  }
}

type JobResult = { outcome: string };

const ORPHAN_NOTE_AFTER_MS = 2 * 60 * 1000;
/** Outcomes where trying the sources again later could work (a size or type problem never will). */
const RETRY_OUTCOMES = new Set(['no_link', 'html', 'expired', 'forbidden', 'timeout', 'error']);
const ORDER: Record<string, number> = { share: 0, note: 1, analyze: 2 };

export function backoffMs(attempts: number): number {
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

function textIngest(memory: Memory): IngestKind {
  return memory.caption || memory.url ? 'link_metadata' : 'unsupported';
}

function titleFor(caption: string | null, share: InstagramEventRecord['share']): string {
  if (caption && caption.trim()) return caption.trim().slice(0, 72);
  if (share?.attachmentKind === 'ig_reel') return 'Instagram Reel';
  if (share?.attachmentKind === 'ig_post') return 'Instagram post';
  return 'Instagram share';
}

export function buildDmMemory(event: InstagramEventRecord, nowMs: number): Memory {
  const share = event.share;
  const capturedAt = new Date(event.timestampMs).toISOString();
  const nowIso = new Date(nowMs).toISOString();
  const caption = share?.caption ?? null;
  return {
    id: memoryIdForEvent(event.id),
    createdAt: capturedAt,
    updatedAt: nowIso,
    title: titleFor(caption, share),
    platform: 'instagram',
    url: share?.permalink ?? null,
    caption,
    note: null,
    chip: null,
    ingest: share?.unsupported || (!caption && !share?.permalink) ? 'unsupported' : 'link_metadata',
    media: null,
    privateNoAI: false,
    analysis: null,
    analysisStatus: 'pending',
    categoryId: null,
    categoryWhy: null,
    categoryByAI: false,
    projectIds: [],
    remindAt: null,
    doneAt: null,
    snoozedUntil: null,
    lastOpenedAt: null,
    ledger: [
      {
        at: nowIso,
        who: 'you',
        text: share?.simulated ? 'Simulated Instagram share (try without Instagram)' : 'Shared by Instagram DM',
        undoable: false,
      },
    ],
    sample: false,
    dm: {
      channel: 'instagram_dm',
      shareMessageId: event.messageId,
      attachmentKind: share?.attachmentKind ?? 'other',
      capturedAt,
      mediaOutcome: 'pending',
      analysisGeneration: 0,
      primaryNoteId: null,
      ...(share?.simulated ? { simulated: true } : {}),
    },
    dmNotes: [],
  };
}

export function createInstagramWorker(deps: WorkerDeps) {
  const now = deps.now ?? (() => Date.now());
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const cfg = deps.config;

  const resolvers = deps.resolvers ?? [];
  const replier = deps.replier === undefined ? createReplier(cfg, fetchImpl) : deps.replier;
  const reply = async (recipientId: string | null | undefined, kind: ReplyKind) => {
    if (replier && recipientId) await replier.send(recipientId, REPLY_TEXT[kind], kind);
  };

  type MediaSource = { messageId: string; mediaUrl: string | null; permalink: string | null };

  async function fetchMedia(event: MediaSource, allowResolvers: boolean): Promise<{ result: MediaFetchResult | null; via: string; permalink: string | null }> {
    const opts = { fetchImpl, allowedHosts: cfg.mediaHosts, maxBytes: cfg.maxMediaBytes, timeoutMs: cfg.mediaTimeoutMs };
    const direct = event.mediaUrl ? await fetchAuthorizedMedia(event.mediaUrl, opts) : null;
    if (direct?.ok || (direct && direct.retryable)) return { result: direct, via: 'attachment', permalink: null };

    // The webhook attachment gave a web page, an expired link or nothing: try the documented Graph message
    // attachment fields once, only with the connected account's scoped token.
    const graph = await lookupGraphAttachment(event.messageId, cfg, fetchImpl);
    for (const url of graph.mediaUrls) {
      const viaGraph = await fetchAuthorizedMedia(url, opts);
      if (viaGraph.ok) return { result: viaGraph, via: 'graph', permalink: graph.permalink };
    }
    const permalink = event.permalink ?? graph.permalink;
    // Meta gave no file. Try the other services in order, with the public link only; the first real video wins.
    if (allowResolvers && permalink) {
      for (const resolver of resolvers) {
        let found: Resolved;
        try {
          found = await resolver.resolve(permalink, fetchImpl);
        } catch {
          logEvent('instagram_video_resolver', { resolver: resolver.name, outcome: 'error' });
          continue;
        }
        const viaResolver = { ...opts, allowedHosts: [...opts.allowedHosts, ...found.hosts] };
        let got: MediaFetchResult | null = null;
        for (const url of found.urls.slice(0, 3)) {
          const r = await fetchAuthorizedMedia(url, viaResolver);
          if (r.ok) {
            got = r;
            break;
          }
        }
        logEvent('instagram_video_resolver', { resolver: resolver.name, outcome: got ? 'video' : found.urls.length ? 'unusable' : 'none' });
        if (got) return { result: got, via: `resolver_${resolver.name}`, permalink };
      }
    }
    return { result: direct, via: graph.status === 'ok' ? 'graph_no_media' : 'attachment', permalink: graph.permalink };
  }

  async function handleShare(event: InstagramEventRecord, job: InstagramJob, final: boolean): Promise<JobResult> {
    const reserved = await deps.store.reserveInstagramShare(event.id, event.uid, buildDmMemory(event, now()));
    if (reserved.state === 'deleted' || !reserved.memory) {
      await deps.store.clearInstagramEventPayload(event.id);
      return { outcome: 'share_deleted' };
    }
    const memory = reserved.memory;

    // Text typed in the same message as the share is its note, keyed by the share's delivery ID.
    if (event.share?.text) {
      const note: DmNote = {
        deliveryId: event.messageId,
        text: event.share.text,
        sentAt: new Date(event.timestampMs).toISOString(),
        attachedAt: new Date(now()).toISOString(),
      };
      await deps.store.attachInstagramNote(event.uid, memory.id, note, now());
    }

    if (memory.dm?.mediaOutcome !== 'pending') {
      await deps.store.clearInstagramEventPayload(event.id);
      return { outcome: 'already_final' };
    }

    let input: ShareFinalizeInput;
    let stored: { gcsPath: string; thumbPath: string | null } | null = null;
    let via = 'none';
    // A save with AI off never has its link sent to another service.
    const canResolve = !memory.privateNoAI && resolvers.length > 0 && Boolean(event.share?.permalink);
    if (!event.share?.mediaUrl && !cfg.accessToken && !canResolve) {
      input = { media: null, ingest: memory.ingest, mediaOutcome: 'no_link' };
    } else {
      const fetched = await fetchMedia(
        { messageId: event.messageId, mediaUrl: event.share?.mediaUrl ?? null, permalink: event.share?.permalink ?? null },
        canResolve
      );
      via = fetched.via;
      const r = fetched.result;
      if (r && !r.ok && r.retryable && !final) throw new RetryLater(`media_${r.outcome}`);
      if (r?.ok) {
        const put = await deps.storage.putMedia(event.uid, memory.id, r.buffer, r.mime);
        stored = put;
        const media: MemoryMedia = { kind: put.kind, mime: put.mime, gcsPath: put.gcsPath, thumbPath: put.thumbPath };
        input = {
          media,
          ingest: 'full_media',
          mediaOutcome: 'stored',
          mediaMime: r.mime,
          mediaBytes: r.bytes,
          permalink: fetched.permalink,
        };
      } else {
        const readable = !event.share?.unsupported && Boolean(memory.caption || memory.url || fetched.permalink);
        const outcome = r ? r.outcome : 'no_link';
        // Nothing gave the video now, but something could later: a Reel link plus a source that may work another time.
        const couldLater = RETRY_OUTCOMES.has(outcome) && !memory.privateNoAI && !event.share?.unsupported && Boolean(memory.url ?? fetched.permalink) && (resolvers.length > 0 || Boolean(cfg.accessToken));
        input = {
          media: null,
          ingest: readable ? 'link_metadata' : 'unsupported',
          mediaOutcome: outcome,
          permalink: fetched.permalink,
          ...(couldLater ? { retryMedia: true } : {}),
        };
      }
    }

    const fin = await deps.store.finalizeInstagramShare(event.uid, memory.id, input, now());
    if (!fin.ok && stored) {
      // The memory was deleted while we were downloading: do not leave its media behind.
      await deps.storage.deleteMedia(stored.gcsPath, stored.thumbPath);
    }
    await deps.store.clearInstagramEventPayload(event.id);
    if (fin.ok && input.retryMedia && !event.share?.simulated) await reply(event.senderId, 'video_missing');
    logEvent('instagram_share_processed', {
      job: job.id.slice(0, 18),
      media: input.mediaOutcome,
      via,
      mime: input.mediaMime ?? null,
      bytes: input.mediaBytes ?? null,
      ingest: input.ingest,
      kept: fin.ok,
    });
    return { outcome: fin.ok ? `share_${input.mediaOutcome}` : 'share_deleted' };
  }

  async function handleNote(event: InstagramEventRecord, job: InstagramJob, final: boolean): Promise<JobResult> {
    const text = event.noteText;
    if (!text) return { outcome: 'note_empty' };
    const share = await deps.store.findPrecedingInstagramShare(
      event.recipientId,
      event.senderId,
      event.timestampMs,
      cfg.noteWindowMs
    );
    const waitedLongEnough = now() - event.receivedAtMs > ORPHAN_NOTE_AFTER_MS;
    if (!share || share.uid !== event.uid) {
      if (!final && !waitedLongEnough) throw new RetryLater('note_waiting_for_share', 30_000);
      await deps.store.clearInstagramEventPayload(event.id);
      return { outcome: 'note_orphan' };
    }
    if (share.shareState === 'deleted') {
      // The most recent preceding share was deleted: drop the note rather than attach it to an older share.
      await deps.store.clearInstagramEventPayload(event.id);
      return { outcome: 'note_share_deleted' };
    }
    if (share.shareState !== 'active' || !share.memoryId) {
      if (!final) throw new RetryLater('note_waiting_for_share', 15_000);
      await deps.store.clearInstagramEventPayload(event.id);
      return { outcome: 'note_share_not_ready' };
    }
    const note: DmNote = {
      deliveryId: event.messageId,
      text,
      sentAt: new Date(event.timestampMs).toISOString(),
      attachedAt: new Date(now()).toISOString(),
    };
    const outcome = await deps.store.attachInstagramNote(event.uid, share.memoryId, note, now());
    await deps.store.clearInstagramEventPayload(event.id);
    logEvent('instagram_note_processed', { job: job.id.slice(0, 18), outcome });
    return { outcome: `note_${outcome}` };
  }

  /** A later try for a Reel whose video no source could give: the sources again, then the reading with the video. */
  async function handleMediaRetry(job: InstagramJob, final: boolean): Promise<JobResult> {
    if (!job.memoryId) return { outcome: 'media_missing' };
    const memory = await deps.store.getMemory(job.uid, job.memoryId);
    if (!memory || !memory.dm) return { outcome: 'media_gone' };
    if (memory.privateNoAI) return { outcome: 'media_private' };
    if (memory.dm.mediaOutcome === 'stored') return { outcome: 'media_already' };
    const event = job.eventId ? await deps.store.getInstagramEvent(job.eventId) : null;
    const sender = memory.dm.simulated ? null : event?.senderId ?? null;

    const fetched = await fetchMedia({ messageId: memory.dm.shareMessageId, mediaUrl: null, permalink: memory.url ?? null }, true);
    const r = fetched.result;
    if (r?.ok) {
      const put = await deps.storage.putMedia(job.uid, memory.id, r.buffer, r.mime);
      const media: MemoryMedia = { kind: put.kind, mime: put.mime, gcsPath: put.gcsPath, thumbPath: put.thumbPath };
      const ok = await deps.store.attachInstagramMedia(job.uid, memory.id, { media, mediaMime: r.mime, mediaBytes: r.bytes }, now());
      if (!ok) {
        await deps.storage.deleteMedia(put.gcsPath, put.thumbPath);
        return { outcome: 'media_not_applied' };
      }
      logEvent('instagram_media_retry', { job: job.id.slice(0, 18), outcome: 'video', via: fetched.via, attempts: job.attempts });
      await reply(sender, 'video_found');
      return { outcome: 'media_late_stored' };
    }

    const max = job.maxAttempts;
    if (!final) {
      const delay = MEDIA_RETRY_DELAYS_MS[Math.min(job.attempts, MEDIA_RETRY_DELAYS_MS.length - 1)];
      await deps.store.setInstagramMediaRetry(
        job.uid,
        memory.id,
        { state: 'waiting', attempt: job.attempts, max, nextAt: new Date(now() + delay).toISOString() },
        now()
      );
      throw new RetryLater('media_not_found', delay);
    }
    await deps.store.setInstagramMediaRetry(job.uid, memory.id, { state: 'gave_up', attempt: job.attempts, max }, now());
    logEvent('instagram_media_retry', { job: job.id.slice(0, 18), outcome: 'gave_up', attempts: job.attempts });
    await reply(sender, 'video_gave_up');
    return { outcome: 'media_gave_up' };
  }

  async function analyse(memory: Memory, ingest: IngestKind): Promise<MemoryAnalysis | null> {
    const input: Memory = ingest === 'full_media' ? { ...memory, ingest } : { ...memory, ingest, media: null };
    const raw = await deps.gemini.analyzeMemory(input);
    return raw ? guardAnalysis(raw, { ingest, note: memory.note, caption: memory.caption ?? null }) : null;
  }

  async function handleAnalysis(job: InstagramJob, final: boolean): Promise<JobResult> {
    if (!job.memoryId) return { outcome: 'analysis_missing' };
    const memory = await deps.store.getMemory(job.uid, job.memoryId);
    if (!memory || !memory.dm) return { outcome: 'analysis_gone' };
    // A private memory is never sent to AI: no analysis, no category, no embedding.
    if (memory.privateNoAI) return { outcome: 'analysis_private' };
    if (memory.dm.analysisGeneration !== job.generation) return { outcome: 'analysis_stale' };

    const started = now();
    const hasMedia = memory.dm.mediaOutcome === 'stored' && Boolean(memory.media?.gcsPath);
    let analysis: MemoryAnalysis | null = null;
    let basis: DmAnalysisBasis = 'none';
    let ingest: IngestKind = textIngest(memory);
    let failed = false;

    if (hasMedia) {
      try {
        analysis = await analyse(memory, 'full_media');
        if (analysis) {
          basis = 'media';
          ingest = 'full_media';
        }
      } catch {
        failed = true;
      }
    }
    if (!analysis) {
      // Honest fallback: caption plus the exact note. Frame or timestamp evidence cannot survive here.
      if (ingest === 'unsupported') {
        analysis = guardAnalysis({}, { ingest: 'unsupported', note: memory.note });
      } else {
        try {
          analysis = await analyse(memory, 'link_metadata');
          if (analysis) basis = 'caption';
        } catch {
          failed = true;
        }
      }
    }
    if (!analysis && failed && !final) throw new RetryLater('analysis_failed');

    const updated: Memory = { ...memory, analysis, ingest };
    const category =
      analysis && memory.categoryId === null
        ? await suggestCategoryForMemory(deps.store, deps.gemini, job.uid, updated).catch(() => null)
        : null;
    const embedding = await deps.gemini.embedText(buildEmbeddingText(updated)).catch(() => null);

    const applied = await deps.store.applyInstagramAnalysis(
      job.uid,
      memory.id,
      job.generation,
      { analysis, analysisStatus: analysis ? 'done' : 'failed', ingest, analysisBasis: basis, category },
      embedding,
      now()
    );
    logEvent('instagram_analysis_processed', {
      job: job.id.slice(0, 18),
      basis,
      ingest,
      status: analysis ? 'done' : 'failed',
      applied,
      ms: now() - started,
    });
    return { outcome: applied ? `analysis_${basis}` : 'analysis_stale' };
  }

  async function processJob(job: InstagramJob, final: boolean): Promise<JobResult> {
    if (job.type === 'analyze') return handleAnalysis(job, final);
    if (job.type === 'media') return handleMediaRetry(job, final);
    if (!job.eventId) return { outcome: 'event_missing' };
    const event = await deps.store.getInstagramEvent(job.eventId);
    if (!event) return { outcome: 'event_missing' };
    return event.kind === 'share' ? handleShare(event, job, final) : handleNote(event, job, final);
  }

  async function settle(job: InstagramJob, leaseId: string, s: JobSettlement, summary: WorkerRunSummary) {
    const ok = await deps.store.settleInstagramJob(job.id, leaseId, s, now()).catch(() => false);
    if (!ok) summary.lostLease++;
    else if (s.status === 'done') summary.done++;
    else if (s.status === 'dead') summary.dead++;
    else summary.retried++;
  }

  async function runOnce(limit = cfg.workerBatch): Promise<WorkerRunSummary> {
    const leaseId = crypto.randomUUID();
    const jobs = await deps.store.leaseInstagramJobs(now(), cfg.leaseMs, limit, leaseId);
    const kinds = new Map<string, string>();
    for (const j of jobs) {
      if (j.type === 'analyze' || j.type === 'media') kinds.set(j.id, 'analyze');
      else kinds.set(j.id, (await deps.store.getInstagramEvent(j.eventId ?? ''))?.kind ?? 'share');
    }
    jobs.sort((a, b) => ORDER[kinds.get(a.id) ?? 'share'] - ORDER[kinds.get(b.id) ?? 'share'] || a.createdAtMs - b.createdAtMs);

    const summary: WorkerRunSummary = { leased: jobs.length, done: 0, retried: 0, dead: 0, lostLease: 0 };
    for (const job of jobs) {
      if (job.attempts > job.maxAttempts) {
        await settle(job, leaseId, { status: 'dead', outcome: 'attempts_exhausted' }, summary);
        continue;
      }
      const final = job.attempts >= job.maxAttempts;
      try {
        const r = await processJob(job, final);
        await settle(job, leaseId, { status: 'done', outcome: r.outcome }, summary);
      } catch (err) {
        const outcome = err instanceof RetryLater ? err.outcome : 'error';
        if (final) {
          await settle(job, leaseId, { status: 'dead', outcome }, summary);
        } else {
          const delay = err instanceof RetryLater && err.delayMs ? err.delayMs : backoffMs(job.attempts);
          await settle(job, leaseId, { status: 'queued', nextRunAt: now() + delay, outcome }, summary);
        }
        logEvent('instagram_job_retry', { job: job.id.slice(0, 18), type: job.type, attempts: job.attempts, outcome, final });
      }
    }
    if (jobs.length > 0) logEvent('instagram_worker_run', { ...summary });
    return summary;
  }

  /** Runs batches until nothing is runnable (bounded), for the internal endpoint and tests. */
  async function drain(maxRounds = 10): Promise<WorkerRunSummary> {
    const total: WorkerRunSummary = { leased: 0, done: 0, retried: 0, dead: 0, lostLease: 0 };
    for (let i = 0; i < maxRounds; i++) {
      const s = await runOnce();
      for (const k of Object.keys(total) as (keyof WorkerRunSummary)[]) total[k] += s[k];
      if (s.leased === 0) break;
    }
    return total;
  }

  return { runOnce, drain };
}

export type InstagramWorker = ReturnType<typeof createInstagramWorker>;

/** Optional in-process poller. Safe on a VM or an always-on Cloud Run instance because jobs are durable and leased. */
export function startInstagramPoller(worker: InstagramWorker, intervalMs: number): () => void {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    worker
      .runOnce()
      .catch(() => logEvent('instagram_worker_error', { where: 'poller' }))
      .finally(() => {
        busy = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
