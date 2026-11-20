// Self-serve linking of an Instagram account to a Neophi library.
//
// The signed-in web session asks for a short one-time code. Sending exactly that code as a plain DM to the
// connected Instagram account proves the sender controls that Instagram account and binds the sender's
// Instagram-scoped ID to the web session's user. Every later share from that sender lands in that user's
// library. Nothing about the person is taken from the DM itself: the owner is whoever held the code.
import crypto from 'node:crypto';

export const LINK_CODE_TTL_MS = 15 * 60 * 1000;
/** Unambiguous letters and digits only (no 0/O, 1/I/L): easy to read and to type on a phone. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const BODY_LEN = 8;
const PREFIX = 'NEO';

export interface InstagramLinkCodeRecord {
  /** sha256 of the canonical code. The code itself is never stored. */
  id: string;
  uid: string;
  createdAtMs: number;
  expiresAtMs: number;
  /** Same instant, as a field a Firestore TTL policy can use to clean up unused codes. */
  expireAtMs: number;
}

export interface InstagramLinkRecord {
  senderId: string;
  uid: string;
  linkedAtMs: number;
}

/** A fresh code like NEO-7K4M-Q2XP (about 40 bits). */
export function generateLinkCode(): string {
  let body = '';
  for (let i = 0; i < BODY_LEN; i++) body += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * Accepts a DM whose entire text is a link code, tolerating case, spaces, missing dashes and surrounding
 * whitespace. Anything else (including a code buried in a sentence) is not a code, so ordinary notes are never
 * mistaken for one. Returns the canonical form, or null.
 */
export function normalizeLinkCode(text: string | null | undefined): string | null {
  if (typeof text !== 'string' || text.length > 40) return null;
  const compact = text.replace(/[\s-]+/g, '').toUpperCase();
  if (!compact.startsWith(PREFIX)) return null;
  const body = compact.slice(PREFIX.length);
  if (body.length !== BODY_LEN) return null;
  for (const ch of body) if (!ALPHABET.includes(ch)) return null;
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function hashLinkCode(canonicalCode: string): string {
  return crypto.createHash('sha256').update(canonicalCode).digest('hex');
}

export function buildLinkCodeRecord(uid: string, code: string, nowMs: number): InstagramLinkCodeRecord {
  return {
    id: hashLinkCode(code),
    uid,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + LINK_CODE_TTL_MS,
    expireAtMs: nowMs + LINK_CODE_TTL_MS,
  };
}

/** Per-key sliding-window limiter. In-process and best effort: it blunts guessing, it is not the only defence. */
export function createAttemptLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Records an attempt and says whether it is allowed. */
    allow(key: string, nowMs: number): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => nowMs - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(nowMs);
      hits.set(key, recent);
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.every((t) => nowMs - t >= windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}
