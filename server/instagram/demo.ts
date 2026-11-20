// "Try without Instagram": a signed-in person (a judge, a reviewer, an automated tester) sends a SIMULATED Instagram
// share, a sample Reel with an optional note, into their OWN library, and watches it go through the same queue, worker
// and reading as a real one. It exists so the journey can be experienced without being an approved Instagram tester.
// It is off unless INSTAGRAM_DEMO_SENDER=1, writes only for the caller's own user, is rate limited, and every save it
// makes is marked simulated and labelled that way on the site.
import crypto from 'node:crypto';
import { normalizeUserNote } from '../guard.js';
import type { NeophiStore } from '../store.js';
import type { InstagramConfig } from './config.js';
import { buildEventJob, eventIdFor, RETENTION_MS, type InstagramEventRecord } from './model.js';
import type { InstagramWorker } from './worker.js';

/** Sample captions on purpose differ: some are noise (hashtags, tags), some carry real usable detail. */
export const DEMO_REELS: { caption: string }[] = [
  {
    caption:
      'Crispy paneer tikka without a tandoor: 250g paneer, 3 tbsp hung curd, 1 tsp kasuri methi, 1 tsp chaat masala. Marinate 30 min, cook on a hot tawa 4 min per side.',
  },
  {
    caption: 'Hidden cafe in Jaipur with a rooftop view. Chitrakoot Road, open 9am to 11pm, filter coffee 120 rupees, best table is the corner by the arch.',
  },
  { caption: 'wait for it 😂😂 tag your bestie @everyone #reels #viral #explore #fyp #trending #love #fun' },
  {
    caption: 'Balcony herb garden in 10 minutes: pots with drainage holes, coco peat plus compost 1:1, start with basil, mint and curry leaf. Water every morning.',
  },
];

export interface DemoSender {
  submit(uid: string, opts: { index?: number; note?: string | null }): Promise<{ title: string; processed: boolean }>;
}

export function createDemoSender(deps: {
  store: NeophiStore;
  config: InstagramConfig;
  worker: InstagramWorker;
  now?: () => number;
  /** Longest to wait for the reading before answering; the worker finishes it anyway. */
  waitMs?: number;
}): DemoSender {
  const now = deps.now ?? (() => Date.now());
  return {
    async submit(uid, opts) {
      const nowMs = now();
      const pick = DEMO_REELS[Math.abs(Math.floor(Number(opts.index) || 0)) % DEMO_REELS.length];
      const note = normalizeUserNote((opts.note ?? '').slice(0, 1000));
      const messageId = `demo-${crypto.randomUUID()}`;
      const recipientId = deps.config.recipientId || 'demo';
      const event: InstagramEventRecord = {
        id: eventIdFor(recipientId, messageId),
        kind: 'share',
        recipientId,
        senderId: `demo:${crypto.createHash('sha256').update(uid).digest('hex').slice(0, 12)}`,
        uid,
        messageId,
        timestampMs: nowMs,
        receivedAtMs: nowMs,
        expireAtMs: nowMs + RETENTION_MS,
        share: {
          attachmentType: 'ig_reel',
          attachmentKind: 'ig_reel',
          caption: pick.caption,
          mediaUrl: null,
          permalink: null,
          unsupported: false,
          text: note,
          simulated: true,
        },
        noteText: null,
        shareState: 'pending',
        memoryId: null,
        payloadCleared: false,
      };
      await deps.store.recordInstagramEvent(event, buildEventJob(event, nowMs, deps.config.maxAttempts));
      // Run the queue now so the person sees the result straight away; if the reading is slow the worker finishes it.
      let processed = false;
      await Promise.race([
        deps.worker.drain().then(() => {
          processed = true;
        }),
        new Promise((resolve) => setTimeout(resolve, deps.waitMs ?? 40_000)),
      ]);
      return { title: pick.caption.slice(0, 72), processed };
    },
  };
}
