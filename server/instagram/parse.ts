// Meta Instagram messaging webhook: signature check and parsing into share and note envelopes.
// Documented attachment types: ig_reel and ig_post with a payload url and title. Field shapes beyond those
// are handled defensively; anything unrecognised is ignored rather than guessed.
import crypto from 'node:crypto';
import { normalizeUserNote } from '../guard.js';
import type { AttachmentKind } from './model.js';

const SIGNATURE_RE = /^sha256=([0-9a-fA-F]{64})$/;

/** Validates X-Hub-Signature-256 against the untouched raw body using a constant-time comparison. */
export function verifyMetaSignature(rawBody: Buffer, header: unknown, appSecret: string): boolean {
  if (!appSecret || typeof header !== 'string') return false;
  const match = SIGNATURE_RE.exec(header.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(match[1], 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** Constant-time string comparison for tokens of possibly different lengths. */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

/** Only an actual HTTPS instagram.com post or reel permalink is kept. CDN and signed URLs never qualify. */
export function instagramPermalink(value: unknown): string | null {
  if (typeof value !== 'string' || !URL.canParse(value)) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.host)) return null;
  const post = /^\/(reel|p)\/([\w-]+)\/?$/.exec(url.pathname);
  return post ? `https://www.instagram.com/${post[1]}/${post[2]}/` : null;
}

export interface ParsedEnvelopeBase {
  messageId: string;
  senderId: string;
  recipientId: string;
  timestampMs: number;
}

export interface ParsedShare extends ParsedEnvelopeBase {
  kind: 'share';
  attachmentType: string | null;
  attachmentKind: AttachmentKind;
  caption: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  unsupported: boolean;
  text: string | null;
}

export interface ParsedNote extends ParsedEnvelopeBase {
  kind: 'note';
  text: string;
}

export type ParsedEnvelope = ParsedShare | ParsedNote;

export interface ParseResult {
  envelopes: ParsedEnvelope[];
  /** Echoes, reactions, reads, malformed or unrelated events. Counted, never stored. */
  ignored: number;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function timestampMs(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n; // seconds in some samples, milliseconds in messaging deliveries
}

function messagingEvents(body: Record<string, unknown>): { events: Record<string, unknown>[]; ignored: number } {
  const events: Record<string, unknown>[] = [];
  let ignored = 0;
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    const e = rec(entry);
    if (!e) continue;
    for (const m of Array.isArray(e.messaging) ? e.messaging : []) {
      const r = rec(m);
      if (r) events.push(r);
      else ignored++;
    }
    // Some deliveries (and the dashboard sample) use entry[].changes[] with field "messages".
    for (const c of Array.isArray(e.changes) ? e.changes : []) {
      const r = rec(c);
      const value = r ? rec(r.value) : null;
      if (r && r.field === 'messages' && value) events.push(value);
      else ignored++;
    }
  }
  return { events, ignored };
}

export function parseInstagramDelivery(body: unknown): ParseResult {
  const b = rec(body);
  if (!b || b.object !== 'instagram') return { envelopes: [], ignored: 1 };
  const { events, ignored: skipped } = messagingEvents(b);
  let ignored = skipped;
  const envelopes: ParsedEnvelope[] = [];

  for (const ev of events) {
    const message = rec(ev.message);
    const senderId = str(rec(ev.sender)?.id);
    const recipientId = str(rec(ev.recipient)?.id);
    const ts = timestampMs(ev.timestamp);
    const messageId = message ? str(message.mid) : null;
    if (!message || !senderId || !recipientId || !messageId || ts === null) {
      ignored++;
      continue;
    }
    if (message.is_echo === true || message.is_deleted === true || message.is_unsupported === true) {
      ignored++;
      continue;
    }
    const base = { messageId, senderId, recipientId, timestampMs: ts };
    const text = normalizeUserNote(typeof message.text === 'string' ? message.text : null);
    const attachments = (Array.isArray(message.attachments) ? message.attachments : [])
      .map(rec)
      .filter((a): a is Record<string, unknown> => a !== null);

    if (attachments.length === 0) {
      if (text) envelopes.push({ ...base, kind: 'note', text });
      else ignored++;
      continue;
    }

    // One memory per share message: prefer a Reel or post attachment, else the first one.
    const att = attachments.find((a) => a.type === 'ig_reel' || a.type === 'ig_post') ?? attachments[0];
    const payload = rec(att.payload) ?? {};
    const type = str(att.type);
    const rawUrl = str(payload.url);
    const permalink = instagramPermalink(rawUrl);
    envelopes.push({
      ...base,
      kind: 'share',
      attachmentType: type,
      attachmentKind: type === 'ig_reel' || type === 'ig_post' ? type : 'other',
      caption: str(payload.title),
      mediaUrl: permalink ? null : rawUrl,
      permalink,
      unsupported: payload.is_unsupported === true || type === 'unsupported_type',
      text,
    });
  }
  return { envelopes, ignored };
}
