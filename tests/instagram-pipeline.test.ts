// End to end on fixtures and mocks only: signed delivery -> durable event/job -> worker -> media -> (mock) Gemini
// -> guard -> memory -> search / Today / export / delete. Nothing here talks to Meta, Google or the network.
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeminiService } from '../server/gemini.js';
import { guardAnalysis, normalizeUserNote } from '../server/guard.js';
import type { Memory } from '../src/types/neophi.js';
import {
  delivery,
  GRAPH_TOKEN,
  htmlResponse,
  mediaUrl,
  mockFetch,
  mockGemini,
  mp4Response,
  noteMessage,
  PNG_1PX,
  rawAnalysis,
  SAMPLE_MP4,
  SENDER_B,
  settleAll,
  setupHarness,
  shareMessage,
  T0,
  UID_A,
  UID_B,
  APP_SECRET,
  VERIFY_TOKEN,
  SENDER_A,
} from './helpers/instagram.js';

const LOOKASIDE = 'https://lookaside.fbsbx.com/';
const HINGLISH = 'Maa ke liye  🥞\n  Sunday ko banana hai,   kasuri methi wala step  ';
const HINDI = 'बालकनी के लिए\r\n\tदो  पौधे — ज़रूर';

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

async function memoriesOf(h: ReturnType<typeof setupHarness>, uid: string): Promise<Memory[]> {
  const r = await h.as(uid).get('/api/memories');
  expect(r.status).toBe(200);
  return r.body as Memory[];
}

const analysedMemories = (g: GeminiService) =>
  (g.analyzeMemory as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as Memory);

describe('authorized MP4 share', () => {
  it('stores the video once in private per-UID storage and sends that exact object to the matching analysis', async () => {
    const { fn, calls } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn });
    const share = delivery(shareMessage({ mid: 'm-video-1', ts: T0 - 1000 }));
    expect((await h.post(share)).status).toBe(200);
    // Another tester's share at the same time must not get this video.
    const other = delivery(shareMessage({ mid: 'm-other-b', ts: T0 - 900, sender: SENDER_B, url: null, title: 'B caption only' }));
    expect((await h.post(other)).status).toBe(200);
    await settleAll(h);

    const [mine] = await memoriesOf(h, UID_A);
    expect(mine.dm).toMatchObject({ channel: 'instagram_dm', shareMessageId: 'm-video-1', attachmentKind: 'ig_reel' });
    expect(mine.dm?.mediaOutcome).toBe('stored');
    expect(mine.dm?.mediaMime).toBe('video/mp4');
    expect(mine.dm?.mediaBytes).toBe(SAMPLE_MP4.length);
    expect(mine.dm?.analysisBasis).toBe('media');
    expect(mine.ingest).toBe('full_media');
    expect(mine.media?.gcsPath).toBe(`gs://neophi-test-media/users/${UID_A}/media/${mine.id}.mp4`);
    expect(h.storage.puts).toBe(1);
    expect(h.storage.objects.get(mine.media!.gcsPath)!.buffer.equals(SAMPLE_MP4)).toBe(true);
    expect(calls.filter((c) => c.url.includes('m-video-1'))).toHaveLength(1);
    expect(calls[0].init?.redirect).toBe('manual');

    const sent = analysedMemories(h.gemini);
    const forMine = sent.filter((m) => m.id === mine.id);
    expect(forMine).toHaveLength(1);
    expect(forMine[0]).toMatchObject({ ingest: 'full_media', media: { gcsPath: mine.media!.gcsPath, mime: 'video/mp4' } });
    const forOther = sent.filter((m) => m.id !== mine.id);
    expect(forOther.every((m) => m.media === null && m.ingest === 'link_metadata')).toBe(true);

    // Frame/timestamp evidence survives only on media-backed inference.
    expect(mine.analysis?.evidence.some((e) => e.kind === 'frame' && e.t === 2)).toBe(true);
    const [theirs] = await memoriesOf(h, UID_B);
    expect(theirs.analysis?.evidence.some((e) => e.kind === 'frame')).toBe(false);
    expect(theirs.analysis?.transcript_summary).toBe('');
  });

  it('builds a Vertex request with fileData.fileUri gs:// for the stored object (mocked client)', async () => {
    const { VertexGeminiService } = await import('../server/gemini.js');
    const requests: unknown[] = [];
    const client = {
      models: {
        generateContent: vi.fn(async (req: { config?: { systemInstruction?: string } }) => {
          requests.push(req);
          return { text: req.config?.systemInstruction ? JSON.stringify(rawAnalysis()) : '{}' };
        }),
        embedContent: vi.fn(async () => ({ embeddings: [{ values: [0.5, 0.5] }] })),
      },
    };
    const gemini = new VertexGeminiService({ client: client as never });
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn, gemini });
    await h.post(delivery(shareMessage({ mid: 'm-vertex', ts: T0, text: HINGLISH })));
    await settleAll(h);
    const [mine] = await memoriesOf(h, UID_A);
    const analysisReq = requests.find((r) => (r as { config?: { systemInstruction?: string } }).config?.systemInstruction) as {
      contents: { parts: Record<string, unknown>[] }[];
    };
    expect(analysisReq.contents[0].parts[0]).toEqual({ fileData: { fileUri: mine.media!.gcsPath, mimeType: 'video/mp4' } });
    expect(mine.media!.gcsPath.startsWith('gs://')).toBe(true);
    const meta = JSON.parse(String(analysisReq.contents[0].parts[1].text));
    expect(meta.userNote).toBe(HINGLISH);
    expect(meta.url).toBeNull(); // a CDN link is never handed to the model or the browser
    expect(mine.dm?.analysisBasis).toBe('media');
    expect(mine.note).toBe(HINGLISH);
  });
});

describe('honest fallbacks', () => {
  it('HTML-only attachment: no storage, caption-only analysis, caption + exact note searchable', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => htmlResponse() });
    const h = setupHarness({ fetchImpl: fn });
    await h.post(delivery(shareMessage({ mid: 'm-html', ts: T0 - 5000 }), noteMessage({ mid: 'm-html-note', ts: T0 - 1000, text: HINGLISH })));
    await settleAll(h);
    const [m] = await memoriesOf(h, UID_A);
    expect(m.dm?.mediaOutcome).toBe('html');
    expect(m.media).toBeNull();
    expect(m.ingest).toBe('link_metadata');
    expect(m.dm?.analysisBasis).toBe('caption');
    expect(h.storage.puts).toBe(0);
    expect(analysedMemories(h.gemini).every((x) => x.media === null && x.ingest === 'link_metadata')).toBe(true);
    expect(m.analysis?.evidence.map((e) => e.kind)).toEqual(['caption']);
    expect(m.analysis?.visible_text).toEqual([]);
    expect(m.note).toBe(HINGLISH);

    const byCaption = await h.as(UID_A).post('/api/search').send({ q: 'batter' });
    expect(byCaption.body.results.map((r: { memory: Memory }) => r.memory.id)).toEqual([m.id]);
    const byNote = await h.as(UID_A).post('/api/search').send({ q: 'kasuri methi' });
    expect(byNote.body.results[0].memory.id).toBe(m.id);
    expect(byNote.body.results[0].whyMatched).toContain('Your words');
  });

  it('HTML attachment with a scoped Graph token: reads the documented message attachment fields via header only', async () => {
    const graphVideo = 'https://scontent.cdninstagram.com/v/t66/synthetic-video.mp4?sig=GRAPHSIG';
    const { fn, calls } = mockFetch({
      [LOOKASIDE]: () => htmlResponse(),
      'https://graph.instagram.com/': () =>
        Response.json({
          attachments: { data: [{ video_data: { url: graphVideo } }] },
          shares: { data: [{ link: 'https://www.instagram.com/reel/SYNTH_reel1/?igsh=abc' }] },
        }),
      'https://scontent.cdninstagram.com/': () => mp4Response(),
    });
    const h = setupHarness({ fetchImpl: fn, config: { accessToken: GRAPH_TOKEN } });
    await h.post(delivery(shareMessage({ mid: 'm-graph', ts: T0, title: null })));
    await settleAll(h);
    const [m] = await memoriesOf(h, UID_A);
    expect(m.dm?.mediaOutcome).toBe('stored');
    expect(m.url).toBe('https://www.instagram.com/reel/SYNTH_reel1/');
    const graphCall = calls.find((c) => c.url.startsWith('https://graph.instagram.com/'))!;
    expect(graphCall.url).toBe('https://graph.instagram.com/v27.0/m-graph?fields=attachments,shares');
    expect(graphCall.url).not.toContain(GRAPH_TOKEN);
    expect((graphCall.init?.headers as Record<string, string>).authorization).toBe(`Bearer ${GRAPH_TOKEN}`);
    expect(logs.join('\n')).not.toContain(GRAPH_TOKEN);
  });

  it.each([
    [403, 'forbidden'],
    [404, 'expired'],
    [410, 'expired'],
  ])('expired or forbidden media (%s) falls back at once without retrying the download', async (status, outcome) => {
    const { fn, calls } = mockFetch({ [LOOKASIDE]: () => new Response('gone', { status }) });
    const h = setupHarness({ fetchImpl: fn });
    await h.post(delivery(shareMessage({ mid: `m-exp-${status}`, ts: T0 })));
    await settleAll(h);
    const [m] = await memoriesOf(h, UID_A);
    expect(m.dm?.mediaOutcome).toBe(outcome);
    expect(m.ingest).toBe('link_metadata');
    expect(m.analysisStatus).toBe('done');
    expect(calls).toHaveLength(1);
  });

  it('refuses redirects off the authorized origins, plain http and MIME/signature mismatches', async () => {
    const cases: [string, () => Response, string][] = [
      ['redirect', () => new Response(null, { status: 302, headers: { location: 'https://evil.example.com/v.mp4' } }), 'origin_blocked'],
      ['http', () => new Response(null, { status: 301, headers: { location: 'http://lookaside.fbsbx.com/v.mp4' } }), 'origin_blocked'],
      ['mismatch', () => mp4Response(Buffer.from('<html>not a video</html>')), 'signature_mismatch'],
      ['png-as-mp4', () => mp4Response(PNG_1PX), 'signature_mismatch'],
      ['octet', () => mp4Response(SAMPLE_MP4, 'application/octet-stream'), 'unsupported_type'],
    ];
    for (const [name, respond, outcome] of cases) {
      const { fn } = mockFetch({ [LOOKASIDE]: respond });
      const h = setupHarness({ fetchImpl: fn });
      await h.post(delivery(shareMessage({ mid: `m-${name}`, ts: T0 })));
      await settleAll(h);
      const [m] = await memoriesOf(h, UID_A);
      expect([name, m.dm?.mediaOutcome]).toEqual([name, outcome]);
      expect(h.storage.puts).toBe(0);
    }
  });

  it('caps media size from the header and while streaming', async () => {
    for (const declared of [true, false]) {
      const big = Buffer.concat([SAMPLE_MP4, Buffer.alloc(2048)]);
      const { fn } = mockFetch({
        [LOOKASIDE]: () =>
          new Response(new Uint8Array(big), {
            status: 200,
            headers: { 'content-type': 'video/mp4', ...(declared ? { 'content-length': String(big.length) } : {}) },
          }),
      });
      const h = setupHarness({ fetchImpl: fn, config: { maxMediaBytes: SAMPLE_MP4.length } });
      await h.post(delivery(shareMessage({ mid: `m-big-${declared}`, ts: T0 })));
      await settleAll(h);
      const [m] = await memoriesOf(h, UID_A);
      expect(m.dm?.mediaOutcome).toBe('too_large');
      expect(h.storage.puts).toBe(0);
    }
  });

  it('a transient media error is retried with backoff and the video is still stored once', async () => {
    let n = 0;
    const { fn } = mockFetch({ [LOOKASIDE]: () => (++n === 1 ? new Response('busy', { status: 503 }) : mp4Response()) });
    const h = setupHarness({ fetchImpl: fn });
    await h.post(delivery(shareMessage({ mid: 'm-transient', ts: T0 })));
    expect((await h.worker.runOnce()).retried).toBe(1);
    expect((await memoriesOf(h, UID_A))[0].dm?.mediaOutcome).toBe('pending');
    expect((await h.worker.runOnce()).leased).toBe(0); // backing off
    h.clock.advance(31_000);
    await settleAll(h);
    const [m] = await memoriesOf(h, UID_A);
    expect(m.dm?.mediaOutcome).toBe('stored');
    expect(h.storage.puts).toBe(1);
  });

  it('failed video inference degrades to caption + note; total failure leaves caption + note searchable', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const gemini = mockGemini();
    gemini.analyzeMemory.mockImplementation(async (m: Memory) => {
      if (m.ingest === 'full_media') throw new Error('Vertex 403');
      return rawAnalysis('caption only reading');
    });
    const h = setupHarness({ fetchImpl: fn, gemini });
    await h.post(delivery(shareMessage({ mid: 'm-vfail', ts: T0, text: HINDI })));
    await settleAll(h);
    const [m] = await memoriesOf(h, UID_A);
    expect(m.dm?.mediaOutcome).toBe('stored'); // the video is kept for the user to watch
    expect(m.dm?.analysisBasis).toBe('caption');
    expect(m.ingest).toBe('link_metadata'); // never claims the model read the video
    expect(m.analysis?.evidence.some((e) => e.kind === 'frame')).toBe(false);
    expect(m.analysis?.source_summary).toBe('caption only reading');

    const g2 = mockGemini();
    g2.analyzeMemory.mockRejectedValue(new Error('Vertex 403'));
    const { fn: fn2 } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h2 = setupHarness({ fetchImpl: fn2, gemini: g2 });
    await h2.post(delivery(shareMessage({ mid: 'm-allfail', ts: T0, text: HINDI })));
    for (let i = 0; i < 8; i++) {
      await h2.worker.drain();
      h2.clock.advance(16 * 60_000);
    }
    const [m2] = await memoriesOf(h2, UID_A);
    expect(m2.analysisStatus).toBe('failed');
    expect(m2.analysis).toBeNull();
    expect(m2.ingest).toBe('link_metadata');
    expect(m2.note).toBe(HINDI);
    expect((await h2.store.instagramCounts()).jobs.leased).toBe(0);
    const found = await h2.as(UID_A).post('/api/search').send({ q: 'batter' });
    expect(found.body.results).toHaveLength(1);
  });

  it('unsupported attachments are never sent to the model', async () => {
    const h = setupHarness();
    const msg = shareMessage({ mid: 'm-unsup', ts: T0, url: null, title: null, type: 'share' });
    await h.post(delivery(msg));
    await settleAll(h);
    const [m] = await memoriesOf(h, UID_A);
    expect(m.ingest).toBe('unsupported');
    expect(m.dm?.mediaOutcome).toBe('no_link');
    expect(m.analysis?.source_summary).toBe('');
    expect(h.gemini.analyzeMemory).not.toHaveBeenCalled();
  });
});

describe('exact notes', () => {
  it('Hindi and Hinglish notes stay byte-identical through capture, attach, search, export and guard', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn });
    const body = delivery(
      shareMessage({ mid: 'm-exact-1', ts: T0 - 60_000 }),
      noteMessage({ mid: 'm-exact-note-1', ts: T0 - 50_000, text: HINGLISH }),
      shareMessage({ mid: 'm-exact-2', ts: T0 - 20_000, title: 'Balcony shelf' }),
      noteMessage({ mid: 'm-exact-note-2', ts: T0 - 10_000, text: HINDI })
    );
    await h.post(body);
    await settleAll(h);
    const list = await memoriesOf(h, UID_A);
    const one = list.find((m) => m.dm?.shareMessageId === 'm-exact-1')!;
    const two = list.find((m) => m.dm?.shareMessageId === 'm-exact-2')!;
    const bytes = (s: string | null | undefined) => Buffer.from(s ?? '', 'utf8');
    expect(bytes(one.note).equals(bytes(HINGLISH))).toBe(true);
    expect(bytes(two.note).equals(bytes(HINDI))).toBe(true);
    expect(one.dmNotes).toEqual([expect.objectContaining({ deliveryId: 'm-exact-note-1', text: HINGLISH })]);
    expect(one.caption).not.toContain('kasuri'); // the note stays out of the caption
    expect(one.analysis?.source_summary).not.toContain('kasuri');

    // The model received the exact note for the matching memory.
    const sentNotes = analysedMemories(h.gemini).filter((m) => m.id === two.id).map((m) => m.note);
    expect(sentNotes.at(-1)).toBe(HINDI);

    const single = await h.as(UID_A).get(`/api/memories/${two.id}`);
    expect(bytes(single.body.note).equals(bytes(HINDI))).toBe(true);
    const search = await h.as(UID_A).post('/api/search').send({ q: 'पौधे' });
    expect(search.body.results[0].memory.id).toBe(two.id);
    expect(search.body.results[0].memory.note).toBe(HINDI);
    const searchH = await h.as(UID_A).post('/api/search').send({ q: 'kasuri methi' });
    expect(searchH.body.results[0].memory.note).toBe(HINGLISH);

    const exported = await h.as(UID_A).get('/api/export');
    const exp = exported.body.memories as Memory[];
    expect(exp.find((m) => m.id === two.id)!.note).toBe(HINDI);
    expect(exp.find((m) => m.id === one.id)!.dmNotes![0].text).toBe(HINGLISH);

    for (const note of [HINDI, HINGLISH]) {
      expect(normalizeUserNote(note)).toBe(note);
      const guarded = guardAnalysis({ ...rawAnalysis(), explicit_user_intent: 'model rewrite', user_reason: 'x' }, { ingest: 'full_media', note });
      expect(JSON.stringify(guarded)).not.toContain('model rewrite');
    }
  });

  it('retries do not duplicate memories or notes; repeated words in a new delivery are kept by delivery ID', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn });
    const share = delivery(shareMessage({ mid: 'm-retry', ts: T0 - 9000 }));
    const note = delivery(noteMessage({ mid: 'm-retry-n1', ts: T0 - 8000, text: '  same words  ' }));
    const again = delivery(noteMessage({ mid: 'm-retry-n2', ts: T0 - 7000, text: '  same words  ' }));
    for (const b of [share, share, note, share, note, again, again]) expect((await h.post(b)).status).toBe(200);
    await settleAll(h);
    for (const b of [share, note, again]) await h.post(b);
    await settleAll(h);
    const list = await memoriesOf(h, UID_A);
    expect(list).toHaveLength(1);
    expect(list[0].note).toBe('  same words  ');
    expect(list[0].dmNotes!.map((n) => n.deliveryId)).toEqual(['m-retry-n1', 'm-retry-n2']);
    expect(list[0].dm?.primaryNoteId).toBe('m-retry-n1');
    expect(h.storage.puts).toBe(1);
    // Later notes are searchable as the user's words too, without changing `note`.
  });

  it('attaches a note to the most recent preceding share within 10 minutes only', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => htmlResponse() });
    const h = setupHarness({ fetchImpl: fn });
    await h.post(
      delivery(
        shareMessage({ mid: 'm-old', ts: T0 - 30 * 60_000, title: 'old share' }),
        shareMessage({ mid: 'm-a', ts: T0 - 5 * 60_000, title: 'share a' }),
        shareMessage({ mid: 'm-b', ts: T0 - 4 * 60_000, title: 'share b' }),
        noteMessage({ mid: 'm-n-b', ts: T0 - 3 * 60_000, text: 'for b' }),
        noteMessage({ mid: 'm-n-late', ts: T0 + 60_000 - 30 * 60_000 + 11 * 60_000, text: 'too late for old' })
      )
    );
    await settleAll(h);
    h.clock.advance(5 * 60_000);
    await settleAll(h);
    const list = await memoriesOf(h, UID_A);
    const byCaption = Object.fromEntries(list.map((m) => [m.caption, m]));
    expect(byCaption['share b'].note).toBe('for b');
    expect(byCaption['share a'].note).toBeNull();
    expect(byCaption['old share'].note).toBeNull();
    expect(list.flatMap((m) => m.dmNotes ?? []).map((n) => n.text)).toEqual(['for b']);
  });

  it('a delayed first note triggers a guarded reanalysis; an older in-flight job cannot overwrite it', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const gemini = mockGemini();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let call = 0;
    gemini.analyzeMemory.mockImplementation(async (m: Memory) => {
      call++;
      if (call === 1) {
        await gate; // generation 1 is still running when the note arrives
        return rawAnalysis('stale generation one');
      }
      return rawAnalysis(`fresh with note: ${m.note !== null}`);
    });
    const h = setupHarness({ fetchImpl: fn, gemini });
    await h.post(delivery(shareMessage({ mid: 'm-race', ts: T0 - 60_000 })));
    await h.worker.runOnce(); // share -> media stored -> analysis gen 1 queued
    const inflight = h.worker.runOnce(); // leases gen 1 and blocks inside the model call
    await vi.waitFor(() => expect(call).toBe(1));

    await h.post(delivery(noteMessage({ mid: 'm-race-note', ts: T0 - 30_000, text: HINGLISH })));
    h.clock.advance(h.config.noteSettleMs + 1);
    const second = h.newWorker(); // a second worker instance (e.g. another Cloud Run instance)
    await second.drain();
    release();
    const stale = await inflight;
    expect(stale.lostLease).toBe(1);
    const [m] = await memoriesOf(h, UID_A);
    expect(m.note).toBe(HINGLISH);
    expect(m.dm?.analysisGeneration).toBe(2);
    expect(m.analysis?.source_summary).toBe('fresh with note: true');
  });
});

describe('privacy, deletion and isolation', () => {
  it('a memory marked private is never sent to analysis, category or embedding', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn });
    await h.post(delivery(shareMessage({ mid: 'm-private', ts: T0 - 60_000 })));
    await h.worker.runOnce(); // memory exists, analysis queued
    const [m] = await memoriesOf(h, UID_A);
    expect((await h.as(UID_A).patch(`/api/memories/${m.id}`).send({ privateNoAI: true })).status).toBe(200);
    await h.post(delivery(noteMessage({ mid: 'm-private-note', ts: T0 - 50_000, text: 'medical, keep private' })));
    await settleAll(h);
    const [after] = await memoriesOf(h, UID_A);
    expect(after.privateNoAI).toBe(true);
    expect(after.analysisStatus).toBe('skipped');
    expect(after.analysis).toBeNull();
    expect(after.note).toBe('medical, keep private'); // the user's words are still kept
    expect(h.gemini.analyzeMemory).not.toHaveBeenCalled();
    expect(h.gemini.suggestCategory).not.toHaveBeenCalled();
    expect((h.gemini.embedText as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ')).not.toContain('medical');
  });

  it('a deleted memory is not analysed, its media is removed, and retries or late notes never bring it back', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn });
    const share = delivery(shareMessage({ mid: 'm-del', ts: T0 - 60_000 }));
    await h.post(share);
    await h.worker.runOnce();
    const [m] = await memoriesOf(h, UID_A);
    expect(h.storage.objects.size).toBe(1);
    expect((await h.as(UID_A).del(`/api/memories/${m.id}`)).status).toBe(200);
    expect(h.storage.objects.size).toBe(0);

    await h.post(share); // Meta retry of the same delivery
    await h.post(delivery(noteMessage({ mid: 'm-del-note', ts: T0 - 30_000, text: 'late note' })));
    await settleAll(h);
    expect(await memoriesOf(h, UID_A)).toEqual([]);
    expect(h.gemini.analyzeMemory).not.toHaveBeenCalled();
    expect(h.storage.objects.size).toBe(0);
    const ev = h.store.debugInstagramRecords().events;
    expect(ev.find((e) => e.messageId === 'm-del')?.shareState).toBe('deleted');
    expect(ev.find((e) => e.messageId === 'm-del-note')?.noteText).toBeNull();
  });

  it('a share job retried after the user deleted its memory does not resurrect it', async () => {
    let n = 0;
    const { fn } = mockFetch({ [LOOKASIDE]: () => (++n === 1 ? new Response('busy', { status: 503 }) : mp4Response()) });
    const h = setupHarness({ fetchImpl: fn });
    await h.post(delivery(shareMessage({ mid: 'm-del-retry', ts: T0 })));
    expect((await h.worker.runOnce()).retried).toBe(1); // memory reserved, media pending, job will retry
    const [m] = await memoriesOf(h, UID_A);
    expect((await h.as(UID_A).del(`/api/memories/${m.id}`)).status).toBe(200);
    h.clock.advance(60_000);
    await settleAll(h);
    expect(await memoriesOf(h, UID_A)).toEqual([]);
    expect(h.storage.puts).toBe(0);
    expect(h.gemini.analyzeMemory).not.toHaveBeenCalled();
  });

  it('deleting while the media is downloading leaves no orphaned object', async () => {
    const ref: { h?: ReturnType<typeof setupHarness> } = {};
    const { fn } = mockFetch({
      [LOOKASIDE]: async () => {
        const id = (await ref.h!.store.listMemories(UID_A))[0].id;
        await ref.h!.as(UID_A).del(`/api/memories/${id}`);
        return mp4Response();
      },
    });
    const h = setupHarness({ fetchImpl: fn });
    ref.h = h;
    await h.post(delivery(shareMessage({ mid: 'm-del-race', ts: T0 })));
    await settleAll(h);
    expect(h.storage.puts).toBe(1);
    expect(h.storage.objects.size).toBe(0);
    expect(await memoriesOf(h, UID_A)).toEqual([]);
    expect(h.gemini.analyzeMemory).not.toHaveBeenCalled();
  });

  it('delete-me tombstones every DM share so a retry cannot recreate it', async () => {
    const h = setupHarness();
    const share = delivery(shareMessage({ mid: 'm-wipe', ts: T0, url: null }));
    await h.post(share);
    await settleAll(h);
    expect(await memoriesOf(h, UID_A)).toHaveLength(1);
    expect((await h.as(UID_A).del('/api/me')).status).toBe(200);
    await h.post(share);
    await settleAll(h);
    expect(await memoriesOf(h, UID_A)).toEqual([]);
  });

  it("one tester cannot read, search, fetch media of, or attach notes to another tester's DM memories", async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn });
    await h.post(delivery(shareMessage({ mid: 'm-iso-a', ts: T0 - 60_000, title: 'flamingo reel' })));
    // B's note lands inside A's window but must never attach to A's share.
    await h.post(delivery(noteMessage({ mid: 'm-iso-b-note', ts: T0 - 30_000, text: 'B words', sender: SENDER_B })));
    await settleAll(h);
    h.clock.advance(5 * 60_000);
    await settleAll(h);
    const [a] = await memoriesOf(h, UID_A);
    expect(a.note).toBeNull();
    expect(await memoriesOf(h, UID_B)).toEqual([]);
    expect((await h.as(UID_B).get(`/api/memories/${a.id}`)).status).toBe(404);
    expect((await h.as(UID_B).get(`/api/media/${a.id}`)).status).toBe(404);
    expect((await h.as(UID_B).del(`/api/memories/${a.id}`)).status).toBe(404);
    expect((await h.as(UID_B).post('/api/search').send({ q: 'flamingo' })).body.results).toEqual([]);
    expect((await h.as(UID_A).get(`/api/media/${a.id}`)).status).toBe(200);
    expect((await request(h.app).get('/api/memories')).status).toBe(401);
  });
});

describe('durability, concurrency and restart', () => {
  it('concurrent deliveries and concurrent workers produce one memory, one object and consistent notes', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn });
    const body = delivery(shareMessage({ mid: 'm-conc', ts: T0 - 20_000 }), noteMessage({ mid: 'm-conc-n', ts: T0 - 10_000, text: HINGLISH }));
    const posts = await Promise.all(Array.from({ length: 6 }, () => h.post(body)));
    expect(posts.every((r) => r.status === 200)).toBe(true);
    const workers = [h.worker, h.newWorker(), h.newWorker()];
    for (let i = 0; i < 4; i++) {
      await Promise.all(workers.map((w) => w.drain()));
      h.clock.advance(h.config.noteSettleMs + 1);
    }
    const list = await memoriesOf(h, UID_A);
    expect(list).toHaveLength(1);
    expect(list[0].dmNotes).toHaveLength(1);
    expect(list[0].note).toBe(HINGLISH);
    expect(h.storage.puts).toBe(1);
    const counts = await h.store.instagramCounts();
    expect(counts.events).toMatchObject({ shares: 1, notes: 1, activeShares: 1 });
    expect(counts.jobs).toMatchObject({ queued: 0, leased: 0, dead: 0 });
  });

  it('a crashed worker’s lease expires and a fresh worker resumes; the stale worker cannot settle', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn });
    await h.post(delivery(shareMessage({ mid: 'm-crash', ts: T0 })));
    const abandoned = await h.store.leaseInstagramJobs(h.clock.now(), h.config.leaseMs, 10, 'crashed-worker');
    expect(abandoned).toHaveLength(1);
    const restarted = h.newWorker();
    expect((await restarted.runOnce()).leased).toBe(0); // still leased by the crashed worker
    h.clock.advance(h.config.leaseMs + 1);
    await settleAll({ ...h, worker: restarted });
    expect(await memoriesOf(h, UID_A)).toHaveLength(1);
    expect(await h.store.settleInstagramJob(abandoned[0].id, 'crashed-worker', { status: 'done', outcome: 'late' }, h.clock.now())).toBe(false);
  });

  it('a storage outage mid-job is retried and the share still produces exactly one memory', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => mp4Response() });
    const h = setupHarness({ fetchImpl: fn });
    h.storage.failNextPuts = 1;
    await h.post(delivery(shareMessage({ mid: 'm-outage', ts: T0, text: 'note in the same message' })));
    expect((await h.worker.runOnce()).retried).toBe(1);
    h.clock.advance(60_000);
    await settleAll(h);
    const list = await memoriesOf(h, UID_A);
    expect(list).toHaveLength(1);
    expect(list[0].dm?.mediaOutcome).toBe('stored');
    expect(list[0].dmNotes).toHaveLength(1);
    expect(h.storage.objects.size).toBe(1);
  });

  it('bounded retry: a job that keeps failing ends dead instead of looping', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => new Response('busy', { status: 503 }) });
    const h = setupHarness({ fetchImpl: fn, config: { maxAttempts: 3 } });
    await h.post(delivery(shareMessage({ mid: 'm-bounded', ts: T0 })));
    for (let i = 0; i < 6; i++) {
      await h.worker.drain();
      h.clock.advance(16 * 60_000);
    }
    const [m] = await memoriesOf(h, UID_A);
    // On the final attempt the share degrades honestly instead of being lost.
    expect(m.dm?.mediaOutcome).toBe('error');
    expect(m.ingest).toBe('link_metadata');
    const jobs = h.store.debugInstagramRecords().jobs;
    expect(jobs.find((j) => j.type === 'event')?.attempts).toBe(3);
  });
});

describe('reuse of Today and export, and no leaks', () => {
  it('DM memories show in Today, export has no asset URLs or tokens, and logs carry no notes, URLs or secrets', async () => {
    const { fn } = mockFetch({ [LOOKASIDE]: () => htmlResponse() });
    const h = setupHarness({ fetchImpl: fn, config: { accessToken: GRAPH_TOKEN } });
    const url = mediaUrl('LEAKCHECK');
    await h.post(delivery(shareMessage({ mid: 'm-leak', ts: T0 - 5000, url, title: 'caption that must not be logged' })));
    await h.post(delivery(noteMessage({ mid: 'm-leak-note', ts: T0 - 1000, text: HINGLISH })));
    await settleAll(h);
    const today = await h.as(UID_A).get('/api/today?tz=Asia/Kolkata');
    expect(today.body.justArrived.map((c: { memory: Memory }) => c.memory.dm?.shareMessageId)).toContain('m-leak');

    const exported = JSON.stringify((await h.as(UID_A).get('/api/export')).body);
    const memories = JSON.stringify((await h.as(UID_A).get('/api/memories')).body);
    for (const text of [exported, memories]) {
      for (const leak of ['lookaside', 'asset_id', 'SYNTHETIC_SIGNATURE', GRAPH_TOKEN, APP_SECRET, SENDER_A]) {
        expect(text).not.toContain(leak);
      }
    }
    expect(exported).toContain(JSON.stringify(HINGLISH).slice(1, -1));

    const all = logs.join('\n');
    expect(all).toContain('instagram_webhook');
    for (const leak of ['lookaside', 'asset_id', 'SYNTHETIC_SIGNATURE', GRAPH_TOKEN, APP_SECRET, VERIFY_TOKEN, SENDER_A, 'caption that must not', 'kasuri', 'Maa ke liye']) {
      expect(all).not.toContain(leak);
    }
    // The restricted event drops the URL, caption and note once processed.
    const raw = JSON.stringify(h.store.debugInstagramRecords());
    for (const leak of ['lookaside', 'kasuri', 'caption that must not']) expect(raw).not.toContain(leak);
  });
});
