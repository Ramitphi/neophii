// Self-serve linking: a signed-in user gets a one-time code, sends it to the connected Instagram account by DM,
// and from then on that sender's shares land in that user's library. Fixtures and mocks only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateLinkCode,
  hashLinkCode,
  LINK_CODE_TTL_MS,
  normalizeLinkCode,
} from '../server/instagram/link.js';
import type { Memory } from '../src/types/neophi.js';
import {
  delivery,
  htmlResponse,
  mockFetch,
  noteMessage,
  SENDER_A,
  SENDER_UNKNOWN,
  settleAll,
  setupHarness,
  shareMessage,
  T0,
  UID_A,
  UID_B,
} from './helpers/instagram.js';

const NEW_SENDER = SENDER_UNKNOWN;
const OTHER_SENDER = '1100000000000098';
const WEB_USER = 'firebase-uid-web-user';
const OTHER_WEB_USER = 'firebase-uid-other-web-user';

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  for (const level of ['info', 'log', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

const unlinkedHarness = () =>
  setupHarness({ config: { senderUidMap: new Map(), handle: 'yuck.pov' }, fetchImpl: mockFetch({ 'https://www.instagram.com/': () => htmlResponse() }).fn });

async function codeFor(h: ReturnType<typeof setupHarness>, uid: string): Promise<string> {
  const r = await h.as(uid).post('/api/instagram/link-code');
  expect(r.status).toBe(200);
  return r.body.code as string;
}

let mid = 0;
// Each message is stamped a little later than the one before, as on a real timeline (a note follows its share).
const stamp = (h: ReturnType<typeof setupHarness>) => h.clock.now() - 60_000 + ++mid * 100;
const sendText = (h: ReturnType<typeof setupHarness>, text: string, sender = NEW_SENDER) =>
  h.post(delivery(noteMessage({ mid: `m-link-${mid + 1}`, ts: stamp(h), text, sender })));
const sendReel = (h: ReturnType<typeof setupHarness>, sender = NEW_SENDER, title = 'Sunday paneer tikka') =>
  h.post(
    delivery(
      shareMessage({
        mid: `m-reel-${mid + 1}`,
        ts: stamp(h),
        sender,
        url: 'https://www.instagram.com/reel/Cabc123XYZ_/',
        title,
      })
    )
  );
const memoriesOf = async (h: ReturnType<typeof setupHarness>, uid: string) =>
  (await h.as(uid).get('/api/memories')).body as Memory[];

describe('link code format', () => {
  it('generates readable codes and recognises them only when the whole message is a code', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateLinkCode();
      expect(c).toMatch(/^NEO-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      expect(normalizeLinkCode(c)).toBe(c);
    }
    const c = 'NEO-7K4M-Q2XP';
    for (const variant of ['neo-7k4m-q2xp', '  NEO-7K4M-Q2XP\n', 'neo 7k4m q2xp', 'NEO7K4MQ2XP', 'Neo-7K4M-q2xp ']) {
      expect(normalizeLinkCode(variant)).toBe(c);
    }
    for (const notACode of [
      '',
      'NEO-7K4M-Q2X',
      'NEO-7K4M-Q2XPP',
      'NEO-7K4M-Q2X0', // 0 is not in the alphabet
      'XYZ-7K4M-Q2XP',
      'my code is NEO-7K4M-Q2XP please',
      'NEO-7K4M-Q2XP and also dinner',
      'Neophi is a good name',
    ]) {
      expect(normalizeLinkCode(notACode)).toBeNull();
    }
    expect(normalizeLinkCode(null)).toBeNull();
    expect(hashLinkCode(c)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkCode(c)).not.toContain('7K4M');
  });
});

describe('link API', () => {
  it('needs a signed-in user and reports the handle and link state', async () => {
    const h = unlinkedHarness();
    const request = (await import('supertest')).default;
    expect((await request(h.app).get('/api/instagram/link')).status).toBe(401);
    expect((await request(h.app).post('/api/instagram/link-code')).status).toBe(401);
    expect((await request(h.app).delete('/api/instagram/link')).status).toBe(401);

    const status = await h.as(WEB_USER).get('/api/instagram/link');
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ available: true, handle: 'yuck.pov', linked: false, linkedAt: null, demoAvailable: false });
    expect(status.headers['cache-control']).toBe('no-store');
  });

  it('says capture is not available when the webhook is not configured, and refuses to issue codes', async () => {
    const h = setupHarness({ config: { recipientId: '', handle: '' } });
    const status = await h.as(WEB_USER).get('/api/instagram/link');
    expect(status.body).toMatchObject({ available: false, handle: null, linked: false });
    expect((await h.as(WEB_USER).post('/api/instagram/link-code')).status).toBe(503);
  });

  it('issues a code that expires in 15 minutes, never stores the code itself, and limits how many a user can ask for', async () => {
    const h = unlinkedHarness();
    const r = await h.as(WEB_USER).post('/api/instagram/link-code');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.expiresAt).toBe(new Date(T0 + LINK_CODE_TTL_MS).toISOString());
    expect(r.body.handle).toBe('yuck.pov');
    // The stored record is keyed by a hash; the code text is nowhere in it.
    const stored = JSON.stringify([...(h.store as unknown as { igLinkCodes: Map<string, unknown> }).igLinkCodes.values()]);
    expect(stored).not.toContain(r.body.code);
    expect(stored).not.toContain(r.body.code.replace(/-/g, ''));

    let limited = 0;
    for (let i = 0; i < 12; i++) if ((await h.as(WEB_USER).post('/api/instagram/link-code')).status === 429) limited++;
    expect(limited).toBeGreaterThan(0);
    // Another user is not affected.
    expect((await h.as(OTHER_WEB_USER).post('/api/instagram/link-code')).status).toBe(200);
  });
});

describe('linking by DM, then saving', () => {
  it('links the sender, consumes the code message (never a note), and then their Reel lands in the right library only', async () => {
    const h = unlinkedHarness();

    // Before linking nothing is accepted.
    expect((await sendReel(h)).status).toBe(200);
    expect((await h.store.instagramCounts()).events.shares).toBe(0);

    const code = await codeFor(h, WEB_USER);
    expect((await sendText(h, code)).status).toBe(200);
    expect((await h.store.instagramCounts()).events.notes).toBe(0); // the code was consumed, not stored as a note
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toMatchObject({ uid: WEB_USER });

    const status = await h.as(WEB_USER).get('/api/instagram/link');
    expect(status.body).toMatchObject({ linked: true });
    expect(typeof status.body.linkedAt).toBe('string');
    expect((await h.as(OTHER_WEB_USER).get('/api/instagram/link')).body.linked).toBe(false);

    // Share a Reel, then say why. The note is kept exactly as typed.
    const note = 'Maa ke liye  🥞\n  kasuri methi wala step  ';
    expect((await sendReel(h)).status).toBe(200);
    expect((await sendText(h, note)).status).toBe(200);
    await settleAll(h);

    const mine = await memoriesOf(h, WEB_USER);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ platform: 'instagram', title: 'Sunday paneer tikka', note, ingest: 'link_metadata' });
    expect(mine[0].dm?.channel).toBe('instagram_dm');
    expect(mine[0].url).toBe('https://www.instagram.com/reel/Cabc123XYZ_/');
    expect(await memoriesOf(h, OTHER_WEB_USER)).toHaveLength(0);
    expect(await memoriesOf(h, UID_A)).toHaveLength(0);

    expect(logs.join('\n')).not.toContain(code);
    expect(logs.join('\n')).not.toContain(NEW_SENDER);
    expect(logs.join('\n')).toContain('instagram_link_created');
  });

  it('accepts the code however it was typed', async () => {
    const h = unlinkedHarness();
    const code = await codeFor(h, WEB_USER);
    expect((await sendText(h, `  ${code.toLowerCase().replace(/-/g, ' ')}\n`)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toMatchObject({ uid: WEB_USER });
  });

  it('is single use, and a replayed delivery does nothing', async () => {
    const h = unlinkedHarness();
    const code = await codeFor(h, WEB_USER);
    const body = delivery(noteMessage({ mid: 'm-code-once', ts: T0 - 500, text: code, sender: NEW_SENDER }));
    expect((await h.post(body)).status).toBe(200);
    expect((await h.post(body)).status).toBe(200); // Meta retry
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toMatchObject({ uid: WEB_USER });
    // A second sender cannot reuse it.
    expect((await sendText(h, code, OTHER_SENDER)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(OTHER_SENDER)).toBeNull();
    expect((await h.post(delivery(noteMessage({ mid: 'm-n', ts: T0 - 100, text: 'hello', sender: OTHER_SENDER })))).status).toBe(200);
    expect((await h.store.instagramCounts()).events.notes).toBe(0);
  });

  it('rejects an expired code, a made-up code, and a code from someone who is not who it was made for', async () => {
    const h = unlinkedHarness();
    const code = await codeFor(h, WEB_USER);
    h.clock.advance(LINK_CODE_TTL_MS + 1000);
    expect((await sendText(h, code)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toBeNull();

    expect((await sendText(h, 'NEO-AAAA-BBBB', OTHER_SENDER)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(OTHER_SENDER)).toBeNull();
    expect((await h.store.instagramCounts()).events.notes).toBe(0);
  });

  it('does not treat a normal note that mentions a code as a code', async () => {
    const h = unlinkedHarness();
    const code = await codeFor(h, WEB_USER);
    expect((await sendText(h, `here is my code ${code}`)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toBeNull();
    // The code is still usable afterwards.
    expect((await sendText(h, code)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toMatchObject({ uid: WEB_USER });
  });

  it('asking for a new code cancels the earlier one', async () => {
    const h = unlinkedHarness();
    const first = await codeFor(h, WEB_USER);
    const second = await codeFor(h, WEB_USER);
    expect((await sendText(h, first)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toBeNull();
    expect((await sendText(h, second)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toMatchObject({ uid: WEB_USER });
  });

  it('blunts guessing: after a handful of wrong codes a sender is ignored, even with the right one', async () => {
    const h = unlinkedHarness();
    const code = await codeFor(h, WEB_USER);
    for (let i = 0; i < 8; i++) await sendText(h, `NEO-AAAA-BBB${'CDEFGHJK'[i]}`);
    expect((await sendText(h, code)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toBeNull();
    // Another sender is unaffected, and the window passes.
    expect((await sendText(h, code, OTHER_SENDER)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(OTHER_SENDER)).toMatchObject({ uid: WEB_USER });
  });

  it('linking again from a new browser moves the Instagram account to the new library', async () => {
    const h = unlinkedHarness();
    expect((await sendText(h, await codeFor(h, WEB_USER))).status).toBe(200);
    expect((await sendText(h, await codeFor(h, OTHER_WEB_USER))).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toMatchObject({ uid: OTHER_WEB_USER });
    expect((await h.as(WEB_USER).get('/api/instagram/link')).body.linked).toBe(false);

    expect((await sendReel(h)).status).toBe(200);
    await settleAll(h);
    expect(await memoriesOf(h, WEB_USER)).toHaveLength(0);
    expect(await memoriesOf(h, OTHER_WEB_USER)).toHaveLength(1);
  });

  it('two people can each link their own account', async () => {
    const h = unlinkedHarness();
    expect((await sendText(h, await codeFor(h, WEB_USER), NEW_SENDER)).status).toBe(200);
    expect((await sendText(h, await codeFor(h, OTHER_WEB_USER), OTHER_SENDER)).status).toBe(200);
    expect((await sendReel(h, NEW_SENDER, 'First person reel')).status).toBe(200);
    expect((await sendReel(h, OTHER_SENDER, 'Second person reel')).status).toBe(200);
    await settleAll(h);
    expect((await memoriesOf(h, WEB_USER)).map((m) => m.title)).toEqual(['First person reel']);
    expect((await memoriesOf(h, OTHER_WEB_USER)).map((m) => m.title)).toEqual(['Second person reel']);
  });

  it('disconnecting stops capture right away and keeps what was already saved', async () => {
    const h = unlinkedHarness();
    expect((await sendText(h, await codeFor(h, WEB_USER))).status).toBe(200);
    expect((await sendReel(h)).status).toBe(200);
    await settleAll(h);
    expect(await memoriesOf(h, WEB_USER)).toHaveLength(1);

    const off = await h.as(WEB_USER).del('/api/instagram/link');
    expect(off.body).toEqual({ ok: true, wasLinked: true });
    expect((await h.as(WEB_USER).get('/api/instagram/link')).body.linked).toBe(false);
    expect((await h.as(WEB_USER).del('/api/instagram/link')).body.wasLinked).toBe(false);

    const sharesBefore = (await h.store.instagramCounts()).events.shares;
    expect((await sendReel(h, NEW_SENDER, 'After disconnect')).status).toBe(200);
    expect((await h.store.instagramCounts()).events.shares).toBe(sharesBefore);
    expect(await memoriesOf(h, WEB_USER)).toHaveLength(1);
  });

  it('deleting everything also removes the link and any unused code', async () => {
    const h = unlinkedHarness();
    expect((await sendText(h, await codeFor(h, WEB_USER))).status).toBe(200);
    const unused = await codeFor(h, WEB_USER);
    expect((await h.as(WEB_USER).del('/api/me')).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(NEW_SENDER)).toBeNull();
    expect(await h.store.getInstagramLinkForUser(WEB_USER)).toBeNull();
    expect((await sendText(h, unused, OTHER_SENDER)).status).toBe(200);
    expect(await h.store.getInstagramLinkBySender(OTHER_SENDER)).toBeNull();
  });

  it('keeps the pre-approved tester map working alongside self-serve links', async () => {
    const h = setupHarness({ config: { handle: 'yuck.pov' } }); // SENDER_A is mapped to UID_A, SENDER_B to UID_B
    expect((await h.post(delivery(shareMessage({ mid: 'm-static', ts: T0 - 300, sender: SENDER_A, url: null, title: 'Static map save' })))).status).toBe(200);
    expect((await sendText(h, await codeFor(h, WEB_USER))).status).toBe(200);
    expect((await sendReel(h, NEW_SENDER, 'Linked save')).status).toBe(200);
    await settleAll(h);
    expect((await memoriesOf(h, UID_A)).map((m) => m.title)).toEqual(['Static map save']);
    expect((await memoriesOf(h, WEB_USER)).map((m) => m.title)).toEqual(['Linked save']);
    expect(await memoriesOf(h, UID_B)).toHaveLength(0);
  });
});
