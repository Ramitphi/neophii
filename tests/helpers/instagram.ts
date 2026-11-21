// Test harness for the Instagram DM pipeline: synthetic signed deliveries, a fake clock, a mocked fetch for the
// Meta attachment route and a gs://-style in-memory storage. No network to Meta or Google.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { vi } from 'vitest';
import type { GeminiService } from '../../server/gemini.js';
import { createApp } from '../../server/index.js';
import { loadInstagramConfig, type InstagramConfig } from '../../server/instagram/config.js';
import type { FetchLike } from '../../server/instagram/media.js';
import type { VideoResolver } from '../../server/instagram/resolvers.js';
import { createInstagramWorker, type InstagramWorker } from '../../server/instagram/worker.js';
import { extForMime, type MediaStorage } from '../../server/storage.js';
import { InMemoryStore } from '../../server/store.js';
import type { Memory } from '../../src/types/neophi.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SAMPLE_MP4 = fs.readFileSync(path.join(here, '..', 'fixtures', 'neophi-sample.mp4'));
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

export const APP_SECRET = 'synthetic-parent-app-secret';
export const VERIFY_TOKEN = 'synthetic-verify-token';
export const GRAPH_TOKEN = 'synthetic-graph-token-must-not-leak';
export const RECIPIENT = '17841400000000001';
export const SENDER_A = '1100000000000001';
export const SENDER_B = '1100000000000002';
export const SENDER_UNKNOWN = '1100000000000099';
export const UID_A = 'uid-ramit-tester';
export const UID_B = 'uid-second-tester';
export const T0 = Date.UTC(2026, 10, 20, 9, 0, 0);

export function testConfig(overrides: Partial<InstagramConfig> = {}): InstagramConfig {
  return {
    ...loadInstagramConfig({
      META_APP_SECRET: APP_SECRET,
      META_VERIFY_TOKEN: VERIFY_TOKEN,
      META_IG_RECIPIENT_ID: RECIPIENT,
      INSTAGRAM_SENDER_UID_MAP: `${SENDER_A}=${UID_A},${SENDER_B}=${UID_B}`,
    }),
    ...overrides,
  };
}

export const sign = (body: string | Buffer, secret = APP_SECRET) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

export const mediaUrl = (asset: string) =>
  `https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=${asset}&signature=SYNTHETIC_SIGNATURE_${asset}`;

export interface ShareOpts {
  mid: string;
  sender?: string;
  recipient?: string;
  ts: number;
  url?: string | null;
  title?: string | null;
  type?: string;
  text?: string;
}

export function shareMessage(o: ShareOpts) {
  const payload: Record<string, unknown> = {};
  if (o.url !== null) payload.url = o.url ?? mediaUrl(o.mid);
  if (o.title !== null) payload.title = o.title ?? 'Dosa batter trick from a Chennai cafe';
  payload.reel_video_id = `reel-${o.mid}`;
  return {
    sender: { id: o.sender ?? SENDER_A },
    recipient: { id: o.recipient ?? RECIPIENT },
    timestamp: o.ts,
    message: {
      mid: o.mid,
      ...(o.text !== undefined ? { text: o.text } : {}),
      attachments: [{ type: o.type ?? 'ig_reel', payload }],
    },
  };
}

export function noteMessage(o: { mid: string; ts: number; text: string; sender?: string; recipient?: string }) {
  return {
    sender: { id: o.sender ?? SENDER_A },
    recipient: { id: o.recipient ?? RECIPIENT },
    timestamp: o.ts,
    message: { mid: o.mid, text: o.text },
  };
}

export function delivery(...messaging: unknown[]): string {
  return JSON.stringify({ object: 'instagram', entry: [{ id: RECIPIENT, time: Math.floor(T0 / 1000), messaging }] });
}

/** Storage that behaves like the private per-UID GCS bucket and hands out gs:// object URIs. */
export class FakeGcsStorage implements MediaStorage {
  readonly objects = new Map<string, { buffer: Buffer; mime: string }>();
  puts = 0;
  failNextPuts = 0;

  async putMedia(uid: string, memoryId: string, buffer: Buffer, mime: string) {
    this.puts++;
    if (this.failNextPuts > 0) {
      this.failNextPuts--;
      throw new Error('simulated storage outage');
    }
    const gcsPath = `gs://neophi-test-media/users/${uid}/media/${memoryId}.${extForMime(mime)}`;
    this.objects.set(gcsPath, { buffer: Buffer.from(buffer), mime });
    return { gcsPath, thumbPath: null, kind: mime.startsWith('video/') ? ('video' as const) : ('image' as const), mime };
  }

  async getSignedOrStreamData(gcsPath: string) {
    const item = this.objects.get(gcsPath);
    return item ? { type: 'buffer' as const, buffer: item.buffer, mime: item.mime } : null;
  }

  async deleteMedia(gcsPath: string | null | undefined, thumbPath?: string | null) {
    if (gcsPath) this.objects.delete(gcsPath);
    if (thumbPath) this.objects.delete(thumbPath);
  }

  async deleteAllUserMedia(uid: string) {
    for (const k of [...this.objects.keys()]) if (k.includes(`/users/${uid}/`)) this.objects.delete(k);
  }
}

export const mp4Response = (buf: Buffer = SAMPLE_MP4, type = 'video/mp4') =>
  new Response(new Uint8Array(buf), { status: 200, headers: { 'content-type': type, 'content-length': String(buf.length) } });

export const htmlResponse = () =>
  new Response('<!doctype html><html><body>Instagram</body></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

export type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;

/** A fetch that only answers the URLs a test registers; anything else is a test failure, never a real request. */
export function mockFetch(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn: FetchLike = async (input, init) => {
    calls.push({ url: input, init });
    const url = new URL(input);
    const key = Object.keys(routes).find((k) => input.startsWith(k));
    if (!key) throw new Error(`unexpected fetch in test to host ${url.host}`);
    return routes[key](url, init);
  };
  return { fn, calls };
}

/** Raw model output with frame + caption evidence, so tests can see what the guard keeps. */
export function rawAnalysis(marker = 'A cafe counter with a dosa tawa') {
  return {
    source_summary: marker,
    evidence: [
      { id: 'f_00', kind: 'frame', ref: 'frame at 00:02', t: 2, tEnd: 4 },
      { id: 'c_00', kind: 'caption', ref: 'caption: dosa batter trick' },
    ],
    observed_objects: [
      { label: 'dosa tawa', where: 'centre', bbox: null, confidence: 0.9, evidence: ['f_00'] },
      { label: 'dosa batter', where: 'caption', bbox: null, confidence: 0.8, evidence: ['c_00'] },
    ],
    visible_text: ['CRISPY'],
    transcript_summary: 'Someone explains resting the batter overnight',
    inferred_possible_intents: [{ intent: 'Cook this on Sunday', confidence: 0.7, evidence: ['f_00'] }],
    actionable_entities: [{ type: 'recipe', name: 'Dosa', evidence: ['c_00'] }],
    suggested_actions: ['recipe_steps'],
    purpose: 'food',
    note_grounding: { status: 'grounded', evidence: ['f_00'], explanation: 'The note refers to the tawa' },
  };
}

export function mockGemini(): GeminiService & {
  analyzeMemory: ReturnType<typeof vi.fn<(m: Memory) => Promise<unknown>>>;
  embedText: ReturnType<typeof vi.fn<(t: string) => Promise<number[] | null>>>;
  suggestCategory: ReturnType<typeof vi.fn>;
} {
  return {
    analyzeMemory: vi.fn(async () => rawAnalysis()),
    embedText: vi.fn(async () => [0.1, 0.2, 0.3]),
    rewriteSearchQuery: vi.fn(async (q: string) => ({
      english: q,
      hindi: q,
      hinglish: q,
      keywords: q.toLowerCase().split(/\s+/).filter((s) => s.length > 1),
      timeHint: null,
    })),
    suggestCategory: vi.fn(async () => null),
    buildOutcome: vi.fn(async () => []),
  } as never;
}

export interface Harness {
  app: ReturnType<typeof createApp>;
  store: InMemoryStore;
  storage: FakeGcsStorage;
  gemini: GeminiService;
  worker: InstagramWorker;
  config: InstagramConfig;
  clock: { now: () => number; advance: (ms: number) => void; set: (ms: number) => void };
  post: (body: string, signature?: string | null, headers?: Record<string, string>) => request.Test;
  as: (uid: string) => { get: (p: string) => request.Test; post: (p: string) => request.Test; patch: (p: string) => request.Test; del: (p: string) => request.Test };
  newWorker: () => InstagramWorker;
}

export function setupHarness(opts: {
  fetchImpl?: FetchLike;
  resolvers?: VideoResolver[];
  gemini?: GeminiService;
  config?: Partial<InstagramConfig>;
  store?: InMemoryStore;
  storage?: FakeGcsStorage;
  verifyWorkerCaller?: (token: string) => Promise<boolean>;
} = {}): Harness {
  let t = T0;
  const clock = { now: () => t, advance: (ms: number) => void (t += ms), set: (ms: number) => void (t = ms) };
  const store = opts.store ?? new InMemoryStore();
  const storage = opts.storage ?? new FakeGcsStorage();
  const gemini = opts.gemini ?? mockGemini();
  const config = testConfig(opts.config);
  const fetchImpl = opts.fetchImpl ?? mockFetch({}).fn;
  const app = createApp({
    store,
    storage,
    gemini,
    authVerifier: async (token) => token,
    instagram: { config, fetchImpl, resolvers: opts.resolvers ?? [], now: clock.now, verifyWorkerCaller: opts.verifyWorkerCaller },
  });
  const worker = app.locals.instagramWorker as InstagramWorker;
  const post = (body: string, signature: string | null = sign(body), headers: Record<string, string> = {}) => {
    let r = request(app).post('/webhooks/instagram').set('Content-Type', 'application/json');
    if (signature !== null) r = r.set('X-Hub-Signature-256', signature);
    for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
    return r.send(body);
  };
  const as = (uid: string) => ({
    get: (p: string) => request(app).get(p).set('Authorization', `Bearer ${uid}`),
    post: (p: string) => request(app).post(p).set('Authorization', `Bearer ${uid}`),
    patch: (p: string) => request(app).patch(p).set('Authorization', `Bearer ${uid}`),
    del: (p: string) => request(app).delete(p).set('Authorization', `Bearer ${uid}`),
  });
  const newWorker = () => createInstagramWorker({ store, storage, gemini, config, resolvers: opts.resolvers ?? [], fetchImpl, now: clock.now });
  return { app, store, storage, gemini, worker, config, clock, post, as, newWorker };
}

/** Advance past the note settle delay and drain every runnable job. */
export async function settleAll(h: Harness, rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    await h.worker.drain();
    h.clock.advance(h.config.noteSettleMs + 1000);
  }
  await h.worker.drain();
}
