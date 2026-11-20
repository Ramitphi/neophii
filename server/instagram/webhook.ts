// Meta Instagram webhook. Mounted BEFORE any global JSON parser so the HMAC is computed over the untouched
// raw bytes. Every delivery is verified, filtered and written durably (event + job) before Meta gets a 200;
// all slow work (media download, Gemini) happens later in the worker.
import express from 'express';
import type { NeophiStore } from '../store.js';
import type { InstagramConfig } from './config.js';
import { createAttemptLimiter, hashLinkCode, normalizeLinkCode } from './link.js';
import { logEvent } from './log.js';
import { buildEventJob, eventIdFor, RETENTION_MS, type InstagramEventRecord } from './model.js';
import { parseInstagramDelivery, safeEqual, verifyMetaSignature, type ParsedEnvelope } from './parse.js';

/** In-process counters for the internal status endpoint. Counts only. */
export interface WebhookStats {
  posts: number;
  badSignature: number;
  malformed: number;
  stored: number;
  duplicates: number;
  ignored: number;
  denied: number;
  intakeFailures: number;
  /** Instagram accounts linked to a library with a one-time code, and code messages that did not link. */
  linked: number;
  linkRejected: number;
}

export function newWebhookStats(): WebhookStats {
  return { posts: 0, badSignature: 0, malformed: 0, stored: 0, duplicates: 0, ignored: 0, denied: 0, intakeFailures: 0, linked: 0, linkRejected: 0 };
}

const FUTURE_SKEW_MS = 10 * 60 * 1000;

export function toEventRecord(env: ParsedEnvelope, uid: string, nowMs: number): InstagramEventRecord {
  return {
    id: eventIdFor(env.recipientId, env.messageId),
    kind: env.kind,
    recipientId: env.recipientId,
    senderId: env.senderId,
    uid,
    messageId: env.messageId,
    timestampMs: env.timestampMs,
    receivedAtMs: nowMs,
    expireAtMs: nowMs + RETENTION_MS,
    share:
      env.kind === 'share'
        ? {
            attachmentType: env.attachmentType,
            attachmentKind: env.attachmentKind,
            caption: env.caption,
            mediaUrl: env.mediaUrl,
            permalink: env.permalink,
            unsupported: env.unsupported,
            text: env.text,
          }
        : null,
    noteText: env.kind === 'note' ? env.text : null,
    shareState: env.kind === 'share' ? 'pending' : null,
    memoryId: null,
    payloadCleared: false,
  };
}

export function createInstagramWebhookRouter(deps: {
  store: NeophiStore;
  config: InstagramConfig;
  stats: WebhookStats;
  now?: () => number;
}): express.Router {
  const router = express.Router();
  const cfg = deps.config;
  const now = deps.now ?? (() => Date.now());
  // A code is about 40 bits, so a handful of tries per sender per window makes guessing pointless.
  const linkAttempts = createAttemptLimiter(8, 10 * 60 * 1000);

  router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (
      cfg.verifyToken &&
      mode === 'subscribe' &&
      typeof token === 'string' &&
      safeEqual(token, cfg.verifyToken) &&
      typeof challenge === 'string'
    ) {
      res.status(200).type('text/plain').send(challenge);
      return;
    }
    res.status(403).type('text/plain').send('forbidden');
  });

  router.post(
    '/',
    express.raw({ type: () => true, limit: cfg.maxBodyBytes, inflate: false }),
    async (req, res) => {
      deps.stats.posts++;
      if (!cfg.appSecret) {
        res.status(503).json({ error: 'not configured' });
        return;
      }
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!verifyMetaSignature(raw, req.headers['x-hub-signature-256'], cfg.appSecret)) {
        deps.stats.badSignature++;
        logEvent('instagram_webhook_rejected', { reason: 'signature' });
        res.status(401).json({ error: 'bad signature' });
        return;
      }
      if (!cfg.recipientId) {
        // Without a configured recipient nothing can be safely attributed; let Meta retry once configured.
        logEvent('instagram_webhook_rejected', { reason: 'recipient_not_configured' });
        res.status(503).json({ error: 'not configured' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        deps.stats.malformed++;
        res.status(400).json({ error: 'malformed body' });
        return;
      }

      const nowMs = now();
      const parsed = parseInstagramDelivery(body);
      let ignored = parsed.ignored;
      let denied = 0;
      let stored = 0;
      let duplicates = 0;
      try {
        for (const env of parsed.envelopes) {
          if (env.recipientId !== cfg.recipientId) {
            ignored++;
            continue;
          }
          if (nowMs - env.timestampMs > cfg.maxEventAgeMs || env.timestampMs - nowMs > FUTURE_SKEW_MS) {
            ignored++; // stale replay or clock nonsense
            continue;
          }
          // A text-only DM that is exactly a link code links that sender to the code's owner. It is consumed here
          // and never stored as a note.
          const code = env.kind === 'note' ? normalizeLinkCode(env.text) : null;
          if (code) {
            if (!linkAttempts.allow(env.senderId, nowMs)) {
              deps.stats.linkRejected++;
              ignored++;
              continue;
            }
            const link = await deps.store.redeemInstagramLinkCode(hashLinkCode(code), env.senderId, nowMs);
            if (link) deps.stats.linked++;
            else deps.stats.linkRejected++;
            logEvent(link ? 'instagram_link_created' : 'instagram_link_rejected', {});
            continue;
          }
          const uid = cfg.senderUidMap.get(env.senderId) ?? (await deps.store.getInstagramLinkBySender(env.senderId))?.uid;
          if (!uid) {
            denied++; // unknown sender: nothing is persisted
            if (cfg.logDeniedSenders) logEvent('instagram_sender_not_paired', { senderId: env.senderId, kind: env.kind });
            continue;
          }
          const event = toEventRecord(env, uid, nowMs);
          const runAt = env.kind === 'note' ? nowMs + cfg.noteSettleMs : nowMs;
          const result = await deps.store.recordInstagramEvent(event, buildEventJob(event, runAt, cfg.maxAttempts));
          if (result === 'created') stored++;
          else duplicates++;
        }
      } catch {
        deps.stats.intakeFailures++;
        logEvent('instagram_webhook_intake_failed', { stored, duplicates });
        res.status(503).json({ error: 'retry' });
        return;
      }

      deps.stats.stored += stored;
      deps.stats.duplicates += duplicates;
      deps.stats.ignored += ignored;
      deps.stats.denied += denied;
      logEvent('instagram_webhook', { stored, duplicates, ignored, denied });
      res.status(200).json({ ok: true });
    }
  );

  // Body too large or unreadable: answer before anything is parsed or stored.
  router.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    const status = (err as { status?: number; type?: string })?.status;
    if (status === 413) {
      deps.stats.malformed++;
      res.status(413).json({ error: 'too large' });
      return;
    }
    if (status && status >= 400 && status < 500) {
      deps.stats.malformed++;
      res.status(status).json({ error: 'bad request' });
      return;
    }
    next(err);
  });

  return router;
}
