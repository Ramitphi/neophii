// Downloads media only from the Meta-provided attachment route. HTTPS only, authorized hosts only (redirects
// are re-checked hop by hop), bounded bytes and time, and the declared MIME must match the actual file signature.
// Nothing here logs or returns a URL.
import type { DmMediaOutcome } from '../../src/types/neophi.js';
import type { InstagramConfig } from './config.js';
import { instagramPermalink } from './parse.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type MediaMime = 'video/mp4' | 'video/quicktime' | 'image/jpeg' | 'image/png' | 'image/webp';

export type MediaFetchResult =
  | { ok: true; buffer: Buffer; mime: MediaMime; bytes: number }
  | { ok: false; outcome: Exclude<DmMediaOutcome, 'stored' | 'pending' | 'no_link'>; retryable: boolean };

const DECLARED = new Set<string>(['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export function hostAllowed(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowed.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Identifies the file from its bytes, not from what the server claims. */
export function sniffMedia(buf: Buffer): MediaMime | null {
  if (buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp') {
    return buf.toString('latin1', 8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function declaredMatches(declared: string, sniffed: MediaMime): boolean {
  if (declared.startsWith('video/')) return sniffed.startsWith('video/');
  return declared === sniffed;
}

const fail = (
  outcome: Exclude<DmMediaOutcome, 'stored' | 'pending' | 'no_link'>,
  retryable = false
): MediaFetchResult => ({ ok: false, outcome, retryable });

async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export interface MediaFetchOptions {
  fetchImpl: FetchLike;
  allowedHosts: string[];
  maxBytes: number;
  timeoutMs: number;
  maxRedirects?: number;
}

export async function fetchAuthorizedMedia(url: string, opts: MediaFetchOptions): Promise<MediaFetchResult> {
  const signal = AbortSignal.timeout(opts.timeoutMs);
  let current = url;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    if (!URL.canParse(current)) return fail('origin_blocked');
    const target = new URL(current);
    if (
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      (target.port && target.port !== '443') ||
      !hostAllowed(target.hostname, opts.allowedHosts)
    ) {
      return fail('origin_blocked');
    }

    let res: Response;
    try {
      res = await opts.fetchImpl(target.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: { accept: 'video/mp4,image/jpeg,image/png,image/webp;q=0.8', 'user-agent': 'NeophiCapture/1.0' },
      });
    } catch {
      return fail(signal.aborted ? 'timeout' : 'error', true);
    }

    if (REDIRECTS.has(res.status)) {
      const location = res.headers.get('location');
      await res.body?.cancel().catch(() => {});
      if (!location) return fail('error');
      current = new URL(location, target).toString();
      continue;
    }
    if (res.status === 401 || res.status === 403) return fail('forbidden');
    if (res.status === 404 || res.status === 410) return fail('expired');
    if (res.status === 429 || res.status >= 500) return fail('error', true);
    if (res.status !== 200) return fail('error');

    const declared = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (declared === 'text/html' || declared === 'application/xhtml+xml') {
      await res.body?.cancel().catch(() => {});
      return fail('html');
    }
    if (!DECLARED.has(declared)) {
      await res.body?.cancel().catch(() => {});
      return fail('unsupported_type');
    }
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > opts.maxBytes) {
      await res.body?.cancel().catch(() => {});
      return fail('too_large');
    }

    let buffer: Buffer | null;
    try {
      buffer = await readCapped(res, opts.maxBytes);
    } catch {
      return fail(signal.aborted ? 'timeout' : 'error', true);
    }
    if (!buffer) return fail('too_large');
    const sniffed = sniffMedia(buffer);
    if (!sniffed || !declaredMatches(declared, sniffed)) return fail('signature_mismatch');
    return { ok: true, buffer, mime: sniffed, bytes: buffer.length };
  }
  return fail('error');
}

export interface GraphAttachmentLookup {
  status: 'ok' | 'not_configured' | 'error';
  mediaUrls: string[];
  permalink: string | null;
}

/**
 * Reads the Graph message attachment and share fields for one message, with the connected account's token
 * sent only in the Authorization header. Used only when the webhook attachment URL did not give media.
 * The exact field shape for the selected login flow must be confirmed in the staging gate.
 */
export async function lookupGraphAttachment(
  messageId: string,
  cfg: Pick<InstagramConfig, 'accessToken' | 'graphHost' | 'graphVersion'>,
  fetchImpl: FetchLike
): Promise<GraphAttachmentLookup> {
  if (!cfg.accessToken) return { status: 'not_configured', mediaUrls: [], permalink: null };
  if (!/^[a-z0-9.-]+$/i.test(cfg.graphHost) || !/^v\d+\.\d+$/.test(cfg.graphVersion)) {
    return { status: 'error', mediaUrls: [], permalink: null };
  }
  const url = `https://${cfg.graphHost}/${cfg.graphVersion}/${encodeURIComponent(messageId)}?fields=attachments,shares`;
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${cfg.accessToken}`, accept: 'application/json' },
    });
    if (!res.ok) return { status: 'error', mediaUrls: [], permalink: null };
    const body = (await res.json()) as Record<string, unknown>;
    const list = (v: unknown): Record<string, unknown>[] => {
      const data = v && typeof v === 'object' ? (v as { data?: unknown }).data : null;
      return Array.isArray(data) ? data.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object') : [];
    };
    const urlOf = (v: unknown): string | null => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string') return (v as { url: string }).url;
      return null;
    };
    const mediaUrls: string[] = [];
    for (const a of list(body.attachments)) {
      for (const candidate of [urlOf(a.video_data), urlOf(a.image_data), urlOf(a.file_url), urlOf(a.payload)]) {
        if (candidate && !mediaUrls.includes(candidate)) mediaUrls.push(candidate);
      }
    }
    let permalink: string | null = null;
    for (const s of list(body.shares)) permalink = permalink ?? instagramPermalink(s.link);
    return { status: 'ok', mediaUrls, permalink };
  } catch {
    return { status: 'error', mediaUrls: [], permalink: null };
  }
}
