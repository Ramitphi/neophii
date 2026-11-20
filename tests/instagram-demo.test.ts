// "Try without Instagram": a signed-in person sends a simulated share into their own library. Fixtures and mocks only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Memory } from '../src/types/neophi.js';
import { setupHarness } from './helpers/instagram.js';

const WEB_USER = 'firebase-uid-demo-user';
const OTHER = 'firebase-uid-someone-else';
const NOTE = 'Maa ke liye  🥞\n  kasuri methi step  ';

beforeEach(() => {
  for (const level of ['info', 'log', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const memoriesOf = async (h: ReturnType<typeof setupHarness>, uid: string) => (await h.as(uid).get('/api/memories')).body as Memory[];

describe('simulated Instagram share', () => {
  it('is off unless switched on: 404, and the status says so', async () => {
    const h = setupHarness({ config: { senderUidMap: new Map(), demoSender: false } });
    expect((await h.as(WEB_USER).post('/api/instagram/demo-share')).status).toBe(404);
    expect((await h.as(WEB_USER).get('/api/instagram/link')).body.demoAvailable).toBe(false);
    expect(await memoriesOf(h, WEB_USER)).toHaveLength(0);
  });

  it('needs a signed-in user', async () => {
    const h = setupHarness({ config: { senderUidMap: new Map(), demoSender: true } });
    const request = (await import('supertest')).default;
    expect((await request(h.app).post('/api/instagram/demo-share')).status).toBe(401);
  });

  it('makes one marked save with the exact note in the caller\'s own library only, and reads it', async () => {
    const h = setupHarness({ config: { senderUidMap: new Map(), demoSender: true } });
    expect((await h.as(WEB_USER).get('/api/instagram/link')).body.demoAvailable).toBe(true);
    const r = await h.as(WEB_USER).post('/api/instagram/demo-share').send({ index: 0, note: NOTE });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, processed: true });

    const mine = await memoriesOf(h, WEB_USER);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ platform: 'instagram', note: NOTE, ingest: 'link_metadata', analysisStatus: 'done' });
    expect(mine[0].dm).toMatchObject({ channel: 'instagram_dm', simulated: true, analysisBasis: 'caption' });
    expect(mine[0].ledger[0].text).toMatch(/Simulated/);
    expect(mine[0].url).toBeNull();
    expect(await memoriesOf(h, OTHER)).toHaveLength(0);
  });

  it('works without a note: the share alone is enough', async () => {
    const h = setupHarness({ config: { senderUidMap: new Map(), demoSender: true } });
    expect((await h.as(WEB_USER).post('/api/instagram/demo-share').send({ index: 2 })).status).toBe(200);
    const [m] = await memoriesOf(h, WEB_USER);
    expect(m.note).toBeNull();
    expect(m.dm?.simulated).toBe(true);
    expect(m.analysisStatus).toBe('done');
  });

  it('limits how many a person can send in an hour, and a deleted save stays deleted', async () => {
    const h = setupHarness({ config: { senderUidMap: new Map(), demoSender: true } });
    let limited = 0;
    for (let i = 0; i < 10; i++) if ((await h.as(WEB_USER).post('/api/instagram/demo-share').send({ index: i })).status === 429) limited++;
    expect(limited).toBe(2);
    const list = await memoriesOf(h, WEB_USER);
    expect(list).toHaveLength(8);
    expect((await h.as(WEB_USER).del(`/api/memories/${list[0].id}`)).status).toBe(200);
    await h.worker.drain();
    expect(await memoriesOf(h, WEB_USER)).toHaveLength(7);
  });

  it('never touches real Instagram handling: a real share from an unlinked sender is still dropped', async () => {
    const h = setupHarness({ config: { senderUidMap: new Map(), demoSender: true } });
    const { delivery, shareMessage, SENDER_UNKNOWN, T0 } = await import('./helpers/instagram.js');
    expect((await h.post(delivery(shareMessage({ mid: 'm-real-1', ts: T0 - 500, sender: SENDER_UNKNOWN })))).status).toBe(200);
    expect((await h.store.instagramCounts()).events.shares).toBe(0);
  });
});
