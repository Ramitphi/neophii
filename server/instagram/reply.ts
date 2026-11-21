// Short status replies to the person on Instagram: the video could not be fetched yet, it arrived, or it never did.
// Off unless INSTAGRAM_REPLIES=1 and the connected account's token is set. Uses the Instagram Send API with the
// token in a header only. Never logs or returns a person's ID, the message text or the token.
import type { InstagramConfig } from './config.js';
import { logEvent } from './log.js';
import type { FetchLike } from './media.js';

export interface Replier {
  send(recipientId: string, text: string, kind: ReplyKind): Promise<void>;
}

export type ReplyKind = 'video_missing' | 'video_found' | 'video_gave_up';

export const REPLY_TEXT: Record<ReplyKind, string> = {
  video_missing:
    "Saved your Reel, but I could not get the video even after trying every source. I will try again in a while. You can also send the video as a file here and I will read it.",
  video_found: 'Got the video now. I read it again, so your save is updated.',
  video_gave_up:
    'I still could not get the video after trying again. Send the video as a file here, or upload it on the site, and I will read it.',
};

export function createReplier(cfg: InstagramConfig, fetchImpl: FetchLike): Replier | null {
  if (!cfg.replies || !cfg.accessToken) return null;
  if (!/^[a-z0-9.-]+$/i.test(cfg.graphHost) || !/^v\d+\.\d+$/.test(cfg.graphVersion)) return null;
  const url = `https://${cfg.graphHost}/${cfg.graphVersion}/me/messages`;
  return {
    async send(recipientId, text, kind) {
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
          headers: { authorization: `Bearer ${cfg.accessToken}`, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
        });
        await res.body?.cancel().catch(() => {});
        logEvent('instagram_reply', { kind, ok: res.ok, status: res.status });
      } catch {
        logEvent('instagram_reply', { kind, ok: false, status: 0 });
      }
    },
  };
}
