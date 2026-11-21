// A shared Reel whose DM carried only a page link: the fallback video getters are tried in order, send only the
// public link, and the file they point to still passes the same checks as any other media. Mocks only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadResolvers, type VideoResolver } from '../server/instagram/resolvers.js';
import type { Memory } from '../src/types/neophi.js';
import { delivery, mockFetch, mp4Response, htmlResponse, noteMessage, settleAll, setupHarness, shareMessage, T0, UID_A } from './helpers/instagram.js';

const PAGE = 'https://www.instagram.com/reel/SYNTH_page1/';
const CDN = 'https://scontent.cdninstagram.com/v/t66/synthetic.mp4?sig=SECRETSIG';
const NOTE = 'I want the entire speech saved';

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  for (const level of ['info', 'log', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(' ')));
  }
});
afterEach(() => vi.restoreAllMocks());

const memoriesOf = async (h: ReturnType<typeof setupHarness>): Promise<Memory[]> => (await h.as(UID_A).get("/api/memories")).body as Memory[];

const resolverReturning = (name: string, urls: string[], hosts: string[] = []): VideoResolver & { calls: string[] } => {
  const calls: string[] = [];
  return {
    name,
    calls,
    async resolve(permalink) {
      calls.push(permalink);
      return { urls, hosts };
    },
  };
};
const failing = (name: string): VideoResolver & { calls: string[] } => {
  const calls: string[] = [];
  return {
    name,
    calls,
    async resolve(permalink) {
      calls.push(permalink);
      throw new Error('status_500');
    },
  };
};

const send = async (h: ReturnType<typeof setupHarness>, mid: string) => {
  await h.post(delivery(shareMessage({ mid, ts: T0 - 5000, url: PAGE }), noteMessage({ mid: `${mid}-note`, ts: T0 - 1000, text: NOTE })));
  await settleAll(h);
};

describe('fallback video getters', () => {
  it('with none configured, a page link stays link-only and nothing is asked of any service', async () => {
    const { fn, calls } = mockFetch({});
    const h = setupHarness({ fetchImpl: fn });
    await send(h, 'm-none');
    const [m] = await memoriesOf(h);
    expect(m.ingest).toBe('link_metadata');
    expect(calls).toHaveLength(0);
  });

  it('a service that finds the video gives Gemini the actual file', async () => {
    const r = resolverReturning('generic', [CDN]);
    const { fn } = mockFetch({ 'https://scontent.cdninstagram.com/': () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn, resolvers: [r] });
    await send(h, 'm-found');
    const [m] = await memoriesOf(h);
    expect(r.calls).toEqual([PAGE]); // only the public link goes out
    expect(m.ingest).toBe('full_media');
    expect(m.media?.kind).toBe('video');
    expect(h.storage.puts).toBe(1);
    expect(m.note).toBe(NOTE);
    const joined = logs.join('\n');
    expect(joined).toContain('"resolver":"generic"');
    expect(joined).not.toContain('SECRETSIG');
  });

  it('tries the next service when the first fails or points to a web page', async () => {
    const bad = failing('apify');
    const page = resolverReturning('cobalt', ['https://tunnel.example.com/x'], ['tunnel.example.com']);
    const good = resolverReturning('generic', [CDN]);
    const { fn } = mockFetch({
      'https://tunnel.example.com/': () => htmlResponse(),
      'https://scontent.cdninstagram.com/': () => mp4Response(),
    });
    const h = setupHarness({ fetchImpl: fn, resolvers: [bad, page, good] });
    await send(h, 'm-chain');
    const [m] = await memoriesOf(h);
    expect([bad.calls.length, page.calls.length, good.calls.length]).toEqual([1, 1, 1]);
    expect(m.ingest).toBe('full_media');
  });

  it('stops at the first service that gives a video', async () => {
    const first = resolverReturning('apify', [CDN]);
    const second = resolverReturning('generic', [CDN]);
    const { fn } = mockFetch({ 'https://scontent.cdninstagram.com/': () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn, resolvers: [first, second] });
    await send(h, 'm-first');
    expect(second.calls).toHaveLength(0);
  });

  it('when every service fails, the save is still made from the link and caption', async () => {
    const h = setupHarness({ fetchImpl: mockFetch({}).fn, resolvers: [failing('apify'), failing('generic')] });
    await send(h, 'm-allfail');
    const [m] = await memoriesOf(h);
    expect(m.ingest).toBe('link_metadata');
    expect(m.media).toBeNull();
    expect(m.analysisStatus).toBe('done');
    expect(m.note).toBe(NOTE);
  });

  it('a file from a host nobody allowed is refused, even if a service names it', async () => {
    const r = resolverReturning('generic', ['https://evil.example.net/video.mp4']);
    const { fn, calls } = mockFetch({});
    const h = setupHarness({ fetchImpl: fn, resolvers: [r] });
    await send(h, 'm-evil');
    const [m] = await memoriesOf(h);
    expect(m.ingest).toBe('link_metadata');
    expect(calls).toHaveLength(0);
  });
});

describe('loadResolvers', () => {
  it('builds only what is named and configured, in the order given', () => {
    const env = { INSTAGRAM_VIDEO_RESOLVERS: 'generic, apify, cobalt, nonsense', GENERIC_RESOLVER_URL: 'https://svc.example.com/get', APIFY_TOKEN: 'x' };
    expect(loadResolvers(env).map((r) => r.name)).toEqual(['generic', 'apify']);
  });

  it('is empty by default and refuses non-https endpoints', () => {
    expect(loadResolvers({})).toEqual([]);
    expect(loadResolvers({ INSTAGRAM_VIDEO_RESOLVERS: 'generic', GENERIC_RESOLVER_URL: 'http://svc.example.com/get' })).toEqual([]);
    expect(loadResolvers({ INSTAGRAM_VIDEO_RESOLVERS: 'cobalt', COBALT_API_URL: 'https://user:pw@svc.example.com/' })).toEqual([]);
  });

  it('the cobalt and generic shapes are read as documented', async () => {
    const reply = (body: unknown) => (async () => Response.json(body)) as never;
    const [c] = loadResolvers({ INSTAGRAM_VIDEO_RESOLVERS: 'cobalt', COBALT_API_URL: 'https://c.example.com/' });
    expect((await c.resolve(PAGE, reply({ status: 'tunnel', url: 'https://c.example.com/t/1' }))).urls).toEqual(['https://c.example.com/t/1']);
    expect((await c.resolve(PAGE, reply({ status: 'picker', picker: [{ type: 'photo', url: 'a' }, { type: 'video', url: 'b' }] }))).urls).toEqual(['b']);
    expect((await c.resolve(PAGE, reply({ status: 'error' }))).urls).toEqual([]);
    const [g] = loadResolvers({ INSTAGRAM_VIDEO_RESOLVERS: 'generic', GENERIC_RESOLVER_URL: 'https://g.example.com/x' });
    expect((await g.resolve(PAGE, reply({ video_url: 'https://g.example.com/v.mp4' }))).urls).toEqual(['https://g.example.com/v.mp4']);
  });
});

describe('video could not be fetched: try again later, then read it with the video', () => {
  const flaky = (name = 'generic') => {
    const state = { works: false, calls: 0 };
    const r: VideoResolver = {
      name,
      async resolve() {
        state.calls++;
        if (!state.works) throw new Error('status_503');
        return { urls: [CDN], hosts: [] };
      },
    };
    return { state, r };
  };
  const cdn = { 'https://scontent.cdninstagram.com/': () => mp4Response() };
  const MIN = 60_000;
  const analysedWith = (h: ReturnType<typeof setupHarness>) =>
    (h.gemini.analyzeMemory as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as Memory);

  it('all sources fail: the save says so and waits; the video turns up on the retry and Gemini then reads it', async () => {
    const { state, r } = flaky();
    const h = setupHarness({ fetchImpl: mockFetch(cdn).fn, resolvers: [r] });
    await send(h, 'm-late');
    let [m] = await memoriesOf(h);
    expect(m.ingest).toBe('link_metadata');
    expect(m.dm?.mediaRetry).toMatchObject({ state: 'waiting', attempt: 0 });
    expect(analysedWith(h).every((x) => x.media === null)).toBe(true); // nothing read a video that was not there

    h.clock.advance(6 * MIN);
    await h.worker.drain(); // still down: waits again
    [m] = await memoriesOf(h);
    expect(m.dm?.mediaRetry).toMatchObject({ state: 'waiting', attempt: 1 });
    expect(m.ingest).toBe('link_metadata');

    state.works = true;
    h.clock.advance(31 * MIN);
    await h.worker.drain();
    [m] = await memoriesOf(h);
    expect(m.ingest).toBe('full_media');
    expect(m.media?.kind).toBe('video');
    expect(m.dm).toMatchObject({ mediaOutcome: 'stored', analysisBasis: 'media' });
    expect(m.dm?.mediaRetry).toBeUndefined();
    expect(m.note).toBe(NOTE); // the person's words untouched
    expect(m.analysisStatus).toBe('done');
    const last = analysedWith(h).at(-1)!;
    expect(last.ingest).toBe('full_media');
    expect(last.note).toBe(NOTE);
  });

  it('never found: after the last try it says so honestly and stops', async () => {
    const { r } = flaky();
    const h = setupHarness({ fetchImpl: mockFetch(cdn).fn, resolvers: [r] });
    await send(h, 'm-never');
    for (let i = 0; i < 6; i++) {
      h.clock.advance(3 * 60 * MIN);
      await h.worker.drain();
    }
    const [m] = await memoriesOf(h);
    expect(m.dm?.mediaRetry).toMatchObject({ state: 'gave_up', max: 4 });
    expect(m.ingest).toBe('link_metadata');
    expect(m.media).toBeNull();
    const counts = await h.store.instagramCounts();
    expect(counts.jobs.queued + counts.jobs.leased).toBe(0);
  });

  it('a save with no source that could ever work is not left waiting', async () => {
    const h = setupHarness({ fetchImpl: mockFetch({}).fn });
    await send(h, 'm-nosource');
    const [m] = await memoriesOf(h);
    expect(m.dm?.mediaRetry).toBeUndefined();
  });
});

describe('status replies on Instagram', () => {
  const MIN = 60_000;
  const TOKEN = 'reply-token-must-not-leak';
  const setup = (replies: boolean) => {
    const sent: { text: string; to: string; auth: string }[] = [];
    let works = false;
    const r: VideoResolver = {
      name: 'generic',
      async resolve() {
        if (!works) throw new Error('down');
        return { urls: [CDN], hosts: [] };
      },
    };
    const { fn } = mockFetch({
      'https://graph.instagram.com/': (url, init) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { recipient: { id: string }; message: { text: string } };
          sent.push({ text: body.message.text, to: body.recipient.id, auth: (init.headers as Record<string, string>).authorization });
          expect(url.pathname.endsWith('/me/messages')).toBe(true);
        }
        return Response.json({});
      },
      'https://scontent.cdninstagram.com/': () => mp4Response(),
    });
    const h = setupHarness({ fetchImpl: fn, resolvers: [r], config: { accessToken: TOKEN, replies } });
    return { h, sent, up: () => void (works = true) };
  };

  it('tells the person when the video could not be fetched, and again when it arrived', async () => {
    const { h, sent, up } = setup(true);
    await send(h, 'm-reply');
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toMatch(/could not get the video even after trying every source/);
    expect(sent[0].text).toMatch(/try again in a while/);
    expect(sent[0].auth).toBe(`Bearer ${TOKEN}`);
    up();
    h.clock.advance(6 * MIN);
    await h.worker.drain();
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toMatch(/Got the video/);
    expect(logs.join('\n')).not.toContain(TOKEN);
    expect(logs.join('\n')).not.toContain(sent[0].to);
  });

  it('says so once more if it never arrives, and nothing in between', async () => {
    const { h, sent } = setup(true);
    await send(h, 'm-reply2');
    for (let i = 0; i < 6; i++) {
      h.clock.advance(3 * 60 * MIN);
      await h.worker.drain();
    }
    expect(sent.map((s) => s.text.slice(0, 20))).toHaveLength(2);
    expect(sent[1].text).toMatch(/still could not get the video/i);
  });

  it('sends nothing unless replies are switched on', async () => {
    const { h, sent } = setup(false);
    await send(h, 'm-silent');
    expect(sent).toHaveLength(0);
  });
});
