// Runs the DM pipeline against the real FirestoreStore on a local Firestore emulator (loopback only).
// Skipped unless FIRESTORE_EMULATOR_HOST is set, e.g.:
//   gcloud emulators firestore start --host-port=127.0.0.1:8085
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npx vitest run tests/firestore-store.emulator.test.ts
import admin from 'firebase-admin';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/index.js';
import type { InstagramWorker } from '../server/instagram/worker.js';
import { FirestoreStore } from '../server/store.js';
import type { Memory } from '../src/types/neophi.js';
import {
  delivery,
  FakeGcsStorage,
  mockFetch,
  mockGemini,
  mp4Response,
  noteMessage,
  SAMPLE_MP4,
  shareMessage,
  sign,
  T0,
  testConfig,
  UID_A,
  UID_B,
  SENDER_B,
} from './helpers/instagram.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
// Loopback only: never probe the GCE metadata server for credentials.
if (enabled) process.env.METADATA_SERVER_DETECTION = 'none';
const HINGLISH = 'Maa ke liye  🥞\n  kasuri methi wala step  ';

describe.skipIf(!enabled)('FirestoreStore on the emulator', { timeout: 120_000 }, () => {
  const app = enabled ? admin.initializeApp({ projectId: 'demo-neophi-test' }, 'emulator-test') : null;
  const db = app ? admin.firestore(app) : null;

  afterAll(async () => {
    await app?.delete();
  });

  beforeEach(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-neophi-test/databases/(default)/documents`, {
      method: 'DELETE',
    });
  });

  function harness() {
    let t = T0;
    const clock = { now: () => t, advance: (ms: number) => void (t += ms) };
    const store = new FirestoreStore(db!);
    const storage = new FakeGcsStorage();
    const gemini = mockGemini();
    const config = testConfig();
    const { fn } = mockFetch({ 'https://lookaside.fbsbx.com/': () => mp4Response() });
    const server = createApp({ store, storage, gemini, authVerifier: async (x) => x, instagram: { config, fetchImpl: fn, now: clock.now } });
    const worker = server.locals.instagramWorker as InstagramWorker;
    const post = (body: string) =>
      request(server).post('/webhooks/instagram').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sign(body)).send(body);
    const settle = async () => {
      for (let i = 0; i < 4; i++) {
        await worker.drain();
        clock.advance(config.noteSettleMs + 1000);
      }
    };
    const list = async (uid: string) => (await request(server).get('/api/memories').set('Authorization', `Bearer ${uid}`)).body as Memory[];
    return { server, store, storage, gemini, worker, post, settle, list, clock };
  }

  it('captures an MP4 share and a later Hinglish note exactly once across retries and concurrent workers', async () => {
    const h = harness();
    const share = delivery(shareMessage({ mid: 'fs-video', ts: T0 - 60_000 }));
    const note = delivery(noteMessage({ mid: 'fs-note', ts: T0 - 30_000, text: HINGLISH }));
    const posts = await Promise.all([share, share, share, note, note].map((b) => h.post(b)));
    expect(posts.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const other = harness();
    for (let i = 0; i < 4; i++) {
      await Promise.all([h.worker.drain(), other.worker.drain()]);
      h.clock.advance(20_000);
      other.clock.advance(20_000);
    }
    await h.settle();
    const memories = await h.list(UID_A);
    expect(memories).toHaveLength(1);
    const [m] = memories;
    expect(m.note).toBe(HINGLISH);
    expect(m.dmNotes?.map((n) => n.deliveryId)).toEqual(['fs-note']);
    expect(m.dm).toMatchObject({ mediaOutcome: 'stored', mediaBytes: SAMPLE_MP4.length, analysisBasis: 'media' });
    expect(m.analysisStatus).toBe('done');
    expect(h.storage.puts + other.storage.puts).toBe(1);
    const counts = await h.store.instagramCounts();
    expect(counts.events).toMatchObject({ shares: 1, notes: 1, activeShares: 1 });
    expect(counts.jobs).toMatchObject({ queued: 0, leased: 0, dead: 0 });
    // Restricted payloads are cleared on the server-side event docs.
    const events = await db!.collection('instagramEvents').get();
    const raw = JSON.stringify(events.docs.map((d) => d.data()));
    expect(raw).not.toContain('lookaside');
    expect(raw).not.toContain('kasuri');
    expect(events.docs.every((d) => d.data().expireAt instanceof admin.firestore.Timestamp)).toBe(true);
  });

  it('tombstones a deleted share so retries and late notes cannot resurrect it, and isolates users', async () => {
    const h = harness();
    const share = delivery(shareMessage({ mid: 'fs-del', ts: T0 - 60_000 }));
    await h.post(share);
    await h.worker.runOnce();
    const [m] = await h.list(UID_A);
    expect((await request(h.server).delete(`/api/memories/${m.id}`).set('Authorization', `Bearer ${UID_B}`)).status).toBe(404);
    expect((await request(h.server).delete(`/api/memories/${m.id}`).set('Authorization', `Bearer ${UID_A}`)).status).toBe(200);
    await h.post(share);
    await h.post(delivery(noteMessage({ mid: 'fs-del-note', ts: T0 - 30_000, text: 'late' })));
    await h.post(delivery(noteMessage({ mid: 'fs-b-note', ts: T0 - 20_000, text: 'B', sender: SENDER_B })));
    await h.settle();
    h.clock.advance(5 * 60_000);
    await h.settle();
    expect(await h.list(UID_A)).toEqual([]);
    expect(await h.list(UID_B)).toEqual([]);
    expect(h.gemini.analyzeMemory).not.toHaveBeenCalled();
    expect(h.storage.objects.size).toBe(0);
  });

  it('a lease held by a crashed worker expires and is resumed; the stale lease cannot settle', async () => {
    const h = harness();
    await h.post(delivery(shareMessage({ mid: 'fs-crash', ts: T0 })));
    const abandoned = await h.store.leaseInstagramJobs(h.clock.now(), 60_000, 10, 'crashed');
    expect(abandoned).toHaveLength(1);
    expect((await h.worker.runOnce()).leased).toBe(0);
    h.clock.advance(61_000);
    await h.settle();
    expect(await h.list(UID_A)).toHaveLength(1);
    expect(await h.store.settleInstagramJob(abandoned[0].id, 'crashed', { status: 'done', outcome: 'late' }, h.clock.now())).toBe(false);
  });
});
