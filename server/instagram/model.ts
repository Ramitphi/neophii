// Records and pure state transitions for the Instagram DM pipeline. Both stores (Firestore and in-memory)
// call these inside their transaction / critical section so the rules live in one place.
import crypto from 'node:crypto';
import type {
  DmMediaOutcome,
  DmNote,
  IngestKind,
  LedgerEntry,
  Memory,
  MemoryAnalysis,
  MemoryDmSource,
  MemoryMedia,
  AnalysisStatus,
  DmAnalysisBasis,
} from '../../src/types/neophi.js';

export type AttachmentKind = MemoryDmSource['attachmentKind'];

/** Restricted share payload. Lives only on the server-side event and is cleared once processed. */
export interface InstagramSharePayload {
  attachmentType: string | null;
  attachmentKind: AttachmentKind;
  caption: string | null;
  /** Meta-provided attachment URL. Never logged, never sent to a browser. */
  mediaUrl: string | null;
  /** Canonical public Instagram permalink, only when Meta sent an actual post/reel permalink. */
  permalink: string | null;
  unsupported: boolean;
  /** Text sent in the same message as the share, treated as a note with the share's delivery ID. */
  text: string | null;
  /** Set only on a share made by the "try without Instagram" sender; the save is marked and labelled simulated. */
  simulated?: boolean;
}

export interface InstagramEventRecord {
  /** sha256(recipientId + ':' + messageId), a safe Firestore document ID. */
  id: string;
  kind: 'share' | 'note';
  recipientId: string;
  senderId: string;
  /** Resolved server-side from the pre-approved sender mapping, never from the request. */
  uid: string;
  messageId: string;
  timestampMs: number;
  receivedAtMs: number;
  expireAtMs: number;
  share: InstagramSharePayload | null;
  noteText: string | null;
  /** Share reservation: pending until a memory exists, deleted once the user deletes it (tombstone). */
  shareState: 'pending' | 'active' | 'deleted' | null;
  memoryId: string | null;
  payloadCleared: boolean;
}

export type InstagramJobStatus = 'queued' | 'leased' | 'done' | 'dead';

export interface InstagramJob {
  id: string;
  type: 'event' | 'analyze';
  uid: string;
  eventId: string | null;
  memoryId: string | null;
  generation: number;
  status: InstagramJobStatus;
  attempts: number;
  maxAttempts: number;
  /** Epoch ms. For a leased job this is the lease expiry, so an abandoned lease becomes runnable again. */
  nextRunAt: number;
  leaseId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  outcome: string | null;
  expireAtMs: number;
}

export interface InstagramCounts {
  events: { shares: number; notes: number; activeShares: number; deletedShares: number };
  jobs: Record<InstagramJobStatus, number>;
}

export const RETENTION_MS = 7 * 24 * 3_600_000;
export const ANALYSIS_MAX_ATTEMPTS = 4;
const MEMORY_PREFIX = 'ig_';

export function eventIdFor(recipientId: string, messageId: string): string {
  return crypto.createHash('sha256').update(`${recipientId}:${messageId}`).digest('hex');
}

export function memoryIdForEvent(eventId: string): string {
  return `${MEMORY_PREFIX}${eventId}`;
}

export function eventIdForMemory(memoryId: string): string | null {
  return memoryId.startsWith(MEMORY_PREFIX) && /^[0-9a-f]{64}$/.test(memoryId.slice(MEMORY_PREFIX.length))
    ? memoryId.slice(MEMORY_PREFIX.length)
    : null;
}

export function analysisJobId(memoryId: string): string {
  return `analyze_${memoryId}`;
}

export function eventJobId(eventId: string): string {
  return `event_${eventId}`;
}

export function buildEventJob(event: InstagramEventRecord, runAt: number, maxAttempts: number): InstagramJob {
  return {
    id: eventJobId(event.id),
    type: 'event',
    uid: event.uid,
    eventId: event.id,
    memoryId: null,
    generation: 0,
    status: 'queued',
    attempts: 0,
    maxAttempts,
    nextRunAt: runAt,
    leaseId: null,
    createdAtMs: event.receivedAtMs,
    updatedAtMs: event.receivedAtMs,
    outcome: null,
    expireAtMs: event.receivedAtMs + RETENTION_MS,
  };
}

export function buildAnalysisJob(uid: string, memoryId: string, generation: number, nowMs: number): InstagramJob {
  return {
    id: analysisJobId(memoryId),
    type: 'analyze',
    uid,
    eventId: null,
    memoryId,
    generation,
    status: 'queued',
    attempts: 0,
    maxAttempts: ANALYSIS_MAX_ATTEMPTS,
    nextRunAt: nowMs,
    leaseId: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    outcome: null,
    expireAtMs: nowMs + RETENTION_MS,
  };
}

/** Leasing rule shared by both stores. Returns the leased copy, or null if the job is not runnable. */
export function leaseJob(job: InstagramJob, nowMs: number, leaseMs: number, leaseId: string): InstagramJob | null {
  if (job.status !== 'queued' && job.status !== 'leased') return null;
  if (job.nextRunAt > nowMs) return null;
  return {
    ...job,
    status: 'leased',
    leaseId,
    attempts: job.attempts + 1,
    nextRunAt: nowMs + leaseMs,
    updatedAtMs: nowMs,
  };
}

export interface JobSettlement {
  status: 'done' | 'dead' | 'queued';
  nextRunAt?: number;
  outcome: string;
}

/** Only the worker holding the current lease may settle a job; a stale worker's result is dropped. */
export function settleJob(job: InstagramJob, leaseId: string, s: JobSettlement, nowMs: number): InstagramJob | null {
  if (job.status !== 'leased' || job.leaseId !== leaseId) return null;
  return {
    ...job,
    status: s.status,
    nextRunAt: s.status === 'queued' ? (s.nextRunAt ?? nowMs) : job.nextRunAt,
    leaseId: null,
    outcome: s.outcome,
    updatedAtMs: nowMs,
  };
}

export function clearedPayload(event: InstagramEventRecord): InstagramEventRecord {
  return {
    ...event,
    share: event.share ? { ...event.share, caption: null, mediaUrl: null, text: null } : null,
    noteText: null,
    payloadCleared: true,
  };
}

const ledger = (text: string, nowIso: string): LedgerEntry => ({ at: nowIso, who: 'you', text, undoable: false });

/** True once the share's media step has finished, so a new primary note can trigger a reanalysis. */
export function shareFinalized(memory: Memory): boolean {
  return Boolean(memory.dm && memory.dm.mediaOutcome !== 'pending');
}

export type NoteOutcome = 'primary' | 'later' | 'duplicate';

/**
 * Attach a DM note exactly as sent. Notes are keyed by delivery ID, so a retry is a no-op but a repeat of the
 * same words in a new delivery is kept. The earliest DM note is shown as `note` unless the user edited it.
 */
export function noteAttachment(
  memory: Memory,
  note: DmNote,
  nowIso: string
): { outcome: NoteOutcome; next: Memory } {
  const notes = memory.dmNotes ?? [];
  if (notes.some((n) => n.deliveryId === note.deliveryId) || !memory.dm) {
    return { outcome: 'duplicate', next: memory };
  }
  const dmNotes = [...notes, note].sort(
    (a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt) || a.deliveryId.localeCompare(b.deliveryId)
  );
  const current = notes.find((n) => n.deliveryId === memory.dm?.primaryNoteId);
  const userUntouched = current ? memory.note === current.text : memory.note === null;
  const becomesPrimary =
    memory.note === null || (current !== undefined && userUntouched && Date.parse(note.sentAt) < Date.parse(current.sentAt));

  if (!becomesPrimary) {
    return {
      outcome: 'later',
      next: { ...memory, dmNotes, ledger: [...memory.ledger, ledger('Another note arrived by DM', nowIso)], updatedAt: nowIso },
    };
  }
  return {
    outcome: 'primary',
    next: {
      ...memory,
      note: note.text,
      dmNotes,
      dm: { ...memory.dm, primaryNoteId: note.deliveryId, analysisGeneration: memory.dm.analysisGeneration + 1 },
      ledger: [...memory.ledger, ledger('Your note arrived by DM', nowIso)],
      analysisStatus: memory.privateNoAI ? 'skipped' : memory.analysisStatus,
      updatedAt: nowIso,
    },
  };
}

export interface ShareFinalizeInput {
  media: MemoryMedia | null;
  ingest: IngestKind;
  mediaOutcome: DmMediaOutcome;
  mediaMime?: string;
  mediaBytes?: number;
  permalink?: string | null;
}

export function finalizeShare(memory: Memory, input: ShareFinalizeInput, nowIso: string): Memory | null {
  if (!memory.dm || memory.dm.mediaOutcome !== 'pending') return null;
  const dm: MemoryDmSource = {
    ...memory.dm,
    mediaOutcome: input.mediaOutcome,
    analysisGeneration: memory.dm.analysisGeneration + 1,
  };
  if (input.mediaMime) dm.mediaMime = input.mediaMime;
  if (typeof input.mediaBytes === 'number') dm.mediaBytes = input.mediaBytes;
  return {
    ...memory,
    media: input.media,
    ingest: input.ingest,
    url: memory.url ?? input.permalink ?? null,
    dm,
    analysisStatus: memory.privateNoAI ? 'skipped' : 'pending',
    updatedAt: nowIso,
  };
}

export interface InstagramAnalysisPatch {
  analysis: MemoryAnalysis | null;
  analysisStatus: AnalysisStatus;
  ingest: IngestKind;
  analysisBasis: DmAnalysisBasis;
  category: { categoryId: string; categoryWhy: string; ledger: LedgerEntry } | null;
}

/** Applies an analysis only for the generation it was computed for, and never to a private memory. */
export function applyAnalysis(
  memory: Memory,
  generation: number,
  patch: InstagramAnalysisPatch,
  nowIso: string
): Memory | null {
  if (!memory.dm || memory.privateNoAI || memory.dm.analysisGeneration !== generation) return null;
  const next: Memory = {
    ...memory,
    analysis: patch.analysis,
    analysisStatus: patch.analysisStatus,
    ingest: patch.ingest,
    dm: { ...memory.dm, analysisBasis: patch.analysisBasis },
    updatedAt: nowIso,
  };
  if (patch.category && memory.categoryId === null) {
    next.categoryId = patch.category.categoryId;
    next.categoryWhy = patch.category.categoryWhy;
    next.categoryByAI = true;
    next.ledger = [...memory.ledger, patch.category.ledger];
  }
  return next;
}

/** Firestore rejects `undefined`; every record written by the pipeline is plain JSON. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
