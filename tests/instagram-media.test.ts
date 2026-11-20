import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseSenderUidMap } from '../server/instagram/config.js';
import { fetchAuthorizedMedia, hostAllowed, lookupGraphAttachment, sniffMedia } from '../server/instagram/media.js';
import { instagramPermalink, parseInstagramDelivery, verifyMetaSignature } from '../server/instagram/parse.js';
import { mockFetch, mp4Response, PNG_1PX, RECIPIENT, SAMPLE_MP4, SENDER_A, shareMessage, T0 } from './helpers/instagram.js';

const opts = (fetchImpl: Parameters<typeof fetchAuthorizedMedia>[1]['fetchImpl'], extra = {}) => ({
  fetchImpl,
  allowedHosts: ['lookaside.fbsbx.com', 'fbcdn.net', 'cdninstagram.com'],
  maxBytes: 1024 * 1024,
  timeoutMs: 2000,
  ...extra,
});

describe('configuration', () => {
  it('parses the tester mapping and drops anything malformed', () => {
    const map = parseSenderUidMap(' 1100=uid-a , 1200=uid_b,bad,=x,y=,1300=uid a,1400=a=b,../x=uid ');
    expect([...map.entries()]).toEqual([
      ['1100', 'uid-a'],
      ['1200', 'uid_b'],
    ]);
    expect(parseSenderUidMap(undefined).size).toBe(0);
  });
});

describe('parsing and signatures', () => {
  it('verifies HMAC-SHA256 of the raw body only with the right secret and format', () => {
    const body = Buffer.from('{"a":1}');
    const good = 'sha256=' + crypto.createHmac('sha256', 's3').update(body).digest('hex');
    expect(verifyMetaSignature(body, good, 's3')).toBe(true);
    expect(verifyMetaSignature(body, good, 'other')).toBe(false);
    expect(verifyMetaSignature(body, undefined, 's3')).toBe(false);
    expect(verifyMetaSignature(body, good, '')).toBe(false);
    expect(verifyMetaSignature(body, [good], 's3')).toBe(false);
    expect(verifyMetaSignature(Buffer.from('{"a": 1}'), good, 's3')).toBe(false);
  });

  it('keeps only canonical HTTPS Instagram post and reel permalinks', () => {
    expect(instagramPermalink('https://instagram.com/reel/ABC_123/?igsh=example')).toBe('https://www.instagram.com/reel/ABC_123/');
    expect(instagramPermalink('https://www.instagram.com/p/XyZ-9')).toBe('https://www.instagram.com/p/XyZ-9/');
    expect(instagramPermalink('https://lookaside.fbsbx.com/ig_messaging_cdn/?signature=example')).toBeNull();
    expect(instagramPermalink('https://instagram.com.example.org/reel/ABC_123/')).toBeNull();
    expect(instagramPermalink('http://www.instagram.com/reel/ABC_123/')).toBeNull();
    expect(instagramPermalink('https://www.instagram.com/stories/someone/123/')).toBeNull();
    expect(instagramPermalink('18000000000000000')).toBeNull(); // never derived from a numeric ID
  });

  it('turns deliveries into share and note envelopes, exactly preserving note text', () => {
    const msg = shareMessage({ mid: 'm1', ts: Math.floor(T0 / 1000), text: '  keep  this\n' });
    (msg.message.attachments as unknown[]).unshift({ type: 'image', payload: { url: 'https://lookaside.fbsbx.com/x' } });
    const permalinkShare = shareMessage({ mid: 'm2', ts: T0, url: 'https://instagram.com/reel/SYN1/' });
    const r = parseInstagramDelivery({
      object: 'instagram',
      entry: [{ messaging: [msg, permalinkShare, { sender: { id: SENDER_A }, recipient: { id: RECIPIENT }, timestamp: T0, message: { mid: 'm3', text: 'n' } }] }],
    });
    expect(r.envelopes).toHaveLength(3);
    const [a, b, c] = r.envelopes;
    expect(a).toMatchObject({ kind: 'share', attachmentKind: 'ig_reel', timestampMs: Math.floor(T0 / 1000) * 1000, text: '  keep  this\n' });
    expect(b).toMatchObject({ kind: 'share', mediaUrl: null, permalink: 'https://www.instagram.com/reel/SYN1/' });
    expect(c).toMatchObject({ kind: 'note', text: 'n' });
    expect(parseInstagramDelivery({ object: 'page' }).envelopes).toEqual([]);
    expect(parseInstagramDelivery(null).envelopes).toEqual([]);
  });
});

describe('media signature sniffing', () => {
  it('recognises the bundled MP4 fixture and common image formats by their bytes', () => {
    expect(sniffMedia(SAMPLE_MP4)).toBe('video/mp4');
    expect(sniffMedia(PNG_1PX)).toBe('image/png');
    expect(sniffMedia(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffMedia(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffMedia(Buffer.from('<!doctype html>'))).toBeNull();
    expect(sniffMedia(Buffer.alloc(0))).toBeNull();
  });

  it('matches hosts exactly or as subdomains, never as a suffix of another name', () => {
    const allowed = ['lookaside.fbsbx.com', 'cdninstagram.com'];
    expect(hostAllowed('lookaside.fbsbx.com', allowed)).toBe(true);
    expect(hostAllowed('scontent-bom1-1.cdninstagram.com', allowed)).toBe(true);
    expect(hostAllowed('lookaside.fbsbx.com.evil.com', allowed)).toBe(false);
    expect(hostAllowed('evilcdninstagram.com', allowed)).toBe(false);
  });
});

describe('authorized media fetch', () => {
  it('follows redirects between authorized HTTPS hosts only', async () => {
    const { fn, calls } = mockFetch({
      'https://lookaside.fbsbx.com/': () => new Response(null, { status: 302, headers: { location: 'https://scontent.cdninstagram.com/v.mp4' } }),
      'https://scontent.cdninstagram.com/': () => mp4Response(),
    });
    const r = await fetchAuthorizedMedia('https://lookaside.fbsbx.com/a', opts(fn));
    expect(r.ok && r.bytes).toBe(SAMPLE_MP4.length);
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['lookaside.fbsbx.com', 'scontent.cdninstagram.com']);
  });

  it('blocks credentials in the URL, other ports, look-alike hosts and redirect loops', async () => {
    const { fn, calls } = mockFetch({
      'https://lookaside.fbsbx.com/loop': () => new Response(null, { status: 302, headers: { location: '/loop' } }),
    });
    for (const url of [
      'https://user:pass@lookaside.fbsbx.com/a',
      'https://lookaside.fbsbx.com:8443/a',
      'https://lookaside.fbsbx.com.evil.com/a',
      'http://lookaside.fbsbx.com/a',
      'not a url',
    ]) {
      expect(await fetchAuthorizedMedia(url, opts(fn))).toEqual({ ok: false, outcome: 'origin_blocked', retryable: false });
    }
    expect(calls).toHaveLength(0);
    expect(await fetchAuthorizedMedia('https://lookaside.fbsbx.com/loop', opts(fn))).toMatchObject({ ok: false, outcome: 'error' });
  });

  it('times out as a retryable failure', async () => {
    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const r = await fetchAuthorizedMedia('https://lookaside.fbsbx.com/a', opts(slow, { timeoutMs: 30 }));
    expect(r).toEqual({ ok: false, outcome: 'timeout', retryable: true });
  });

  it('does not call Graph at all without a scoped token', async () => {
    const { fn, calls } = mockFetch({});
    const r = await lookupGraphAttachment('mid', { accessToken: '', graphHost: 'graph.instagram.com', graphVersion: 'v27.0' }, fn);
    expect(r.status).toBe('not_configured');
    expect(calls).toHaveLength(0);
  });
});
