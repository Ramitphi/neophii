import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../server/store.js';
import {
  APP_SECRET,
  delivery,
  noteMessage,
  RECIPIENT,
  SENDER_A,
  SENDER_UNKNOWN,
  setupHarness,
  shareMessage,
  sign,
  T0,
  VERIFY_TOKEN,
} from './helpers/instagram.js';

describe('Instagram webhook: GET challenge', () => {
  it('echoes hub.challenge verbatim as text/plain only with the right verify token', async () => {
    const { app } = setupHarness();
    for (const challenge of ['1158201444', 'abc-123_XYZ.~', '<script>x</script>']) {
      const ok = await request(app)
        .get('/webhooks/instagram')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': challenge });
      expect(ok.status).toBe(200);
      expect(ok.text).toBe(challenge);
      expect(ok.headers['content-type']).toMatch(/^text\/plain/);
      expect(ok.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('refuses a wrong token, wrong mode, missing challenge or an unconfigured token', async () => {
    const { app } = setupHarness();
    const bad = [
      { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': 'x' },
      { 'hub.mode': 'subscribe', 'hub.verify_token': `${VERIFY_TOKEN}x`, 'hub.challenge': 'x' },
      { 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'x' },
      { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN },
      {},
    ];
    for (const q of bad) {
      const r = await request(app).get('/webhooks/instagram').query(q);
      expect(r.status).toBe(403);
      expect(r.text).not.toContain('x');
    }
    const unconfigured = setupHarness({ config: { verifyToken: '' } });
    const r = await request(unconfigured.app)
      .get('/webhooks/instagram')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': 'x' });
    expect(r.status).toBe(403);
  });
});

describe('Instagram webhook: POST signature and raw body', () => {
  const body = delivery(shareMessage({ mid: 'm-sig', ts: T0 }));

  it('rejects missing, wrong and malformed X-Hub-Signature-256 before anything is stored', async () => {
    const h = setupHarness();
    const good = sign(body);
    const variants: (string | null)[] = [
      null,
      '',
      'sha256=',
      'sha256=' + '0'.repeat(64),
      'sha256=' + good.slice(7, 70), // 63 hex chars
      'sha256=' + good.slice(7) + '00', // too long
      'sha1=' + good.slice(7),
      good.slice(7), // no prefix
      'sha256=' + 'g'.repeat(64), // not hex
      sign(body, 'some-other-app-secret'), // e.g. the test app's secret
      `${good}, ${good}`,
    ];
    for (const sig of variants) {
      const r = await h.post(body, sig);
      expect(r.status).toBe(401);
    }
    expect(h.store.calls.recordInstagramEvent).toBe(0);
    expect((await h.store.instagramCounts()).events.shares).toBe(0);
  });

  it('accepts an upper-case hex signature over the same bytes', async () => {
    const h = setupHarness();
    const r = await h.post(body, 'sha256=' + sign(body).slice(7).toUpperCase());
    expect(r.status).toBe(200);
  });

  it('verifies the untouched raw bytes, not a re-serialised JSON body (proxy-safe)', async () => {
    const h = setupHarness();
    // Unusual spacing and \\u escapes: any re-serialisation changes the bytes.
    const raw = `{ "object" : "instagram",\n  "entry": [ { "id": "${RECIPIENT}", "messaging": [ { "sender": {"id":"${SENDER_A}"}, "recipient": {"id":"${RECIPIENT}"}, "timestamp": ${T0}, "message": { "mid": "m-raw", "text": "\\u092c\\u093e\\u0932\\u0915\\u0928\\u0940  ke liye" } } ] } ] }`;
    const reserialised = JSON.stringify(JSON.parse(raw));
    expect(reserialised).not.toBe(raw);

    expect((await h.post(reserialised, sign(raw))).status).toBe(401);
    // Content type a proxy might rewrite does not matter: the signature is checked over the raw bytes.
    expect((await h.post(raw, sign(raw), { 'Content-Type': 'text/plain' })).status).toBe(200);
    const events = h.store.debugInstagramRecords().events;
    expect(events).toHaveLength(1);
    expect(events[0].noteText).toBe('बालकनी  ke liye');
  });

  it('rejects a signed body that is not JSON, a gzip body and an oversized body without storing', async () => {
    const h = setupHarness();
    const notJson = '{"object":"instagram",';
    expect((await h.post(notJson, sign(notJson))).status).toBe(400);
    const gz = await h.post(body, sign(body), { 'Content-Encoding': 'gzip' });
    expect(gz.status).toBe(415);
    const big = JSON.stringify({ object: 'instagram', pad: 'x'.repeat(1024 * 1024 + 10) });
    expect((await h.post(big, sign(big))).status).toBe(413);
    expect(h.store.calls.recordInstagramEvent).toBe(0);
  });

  it('answers 503 (retryable) when the app secret or recipient is not configured', async () => {
    const noSecret = setupHarness({ config: { appSecret: '' } });
    expect((await noSecret.post(body, sign(body, ''))).status).toBe(503);
    const noRecipient = setupHarness({ config: { recipientId: '' } });
    expect((await noRecipient.post(body)).status).toBe(503);
    expect(noRecipient.store.calls.recordInstagramEvent).toBe(0);
  });
});

describe('Instagram webhook: filtering and durable intake', () => {
  it('stores nothing for other recipients, echoes, stale or future events, reactions and unknown senders', async () => {
    const h = setupHarness();
    const echo = shareMessage({ mid: 'm-echo', ts: T0 });
    (echo.message as Record<string, unknown>).is_echo = true;
    const body = delivery(
      shareMessage({ mid: 'm-other-recipient', ts: T0, recipient: '999' }),
      echo,
      shareMessage({ mid: 'm-stale', ts: T0 - 3 * 24 * 3_600_000 }),
      shareMessage({ mid: 'm-future', ts: T0 + 3_600_000 }),
      { sender: { id: SENDER_A }, recipient: { id: RECIPIENT }, timestamp: T0, reaction: { mid: 'x', action: 'react' } },
      { sender: { id: SENDER_A }, recipient: { id: RECIPIENT }, timestamp: T0, read: { mid: 'x' } },
      noteMessage({ mid: 'm-blank', ts: T0, text: '   \n ' }),
      shareMessage({ mid: 'm-unknown', ts: T0, sender: SENDER_UNKNOWN }),
      noteMessage({ mid: 'm-unknown-note', ts: T0, text: 'not yours', sender: SENDER_UNKNOWN })
    );
    const r = await h.post(body);
    expect(r.status).toBe(200);
    expect(h.store.calls.recordInstagramEvent).toBe(0);
    const other = JSON.stringify({ object: 'page', entry: [] });
    expect((await h.post(other)).status).toBe(200);
    expect(h.store.debugInstagramRecords().events).toEqual([]);
  });

  it('logs a denied sender ID only when the pairing aid is switched on, and never its content', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(' ')));
    try {
      const body = delivery(noteMessage({ mid: 'm-pair', ts: T0, text: 'pairing words', sender: SENDER_UNKNOWN }));
      await setupHarness().post(body);
      expect(lines.join('\n')).not.toContain(SENDER_UNKNOWN);
      await setupHarness({ config: { logDeniedSenders: true } }).post(body);
      expect(lines.join('\n')).toContain(SENDER_UNKNOWN);
      expect(lines.join('\n')).not.toContain('pairing words');
    } finally {
      spy.mockRestore();
    }
  });

  it('never takes ownership from the payload: a uid field in the body is ignored', async () => {
    const h = setupHarness();
    const msg = shareMessage({ mid: 'm-uid-spoof', ts: T0, sender: SENDER_UNKNOWN }) as Record<string, unknown>;
    msg.uid = 'uid-ramit-tester';
    (msg.sender as Record<string, unknown>).uid = 'uid-ramit-tester';
    expect((await h.post(delivery(msg))).status).toBe(200);
    expect(h.store.debugInstagramRecords().events).toEqual([]);
  });

  it('persists the event and its job before answering 200, and answers 503 when intake fails', async () => {
    const store = new InMemoryStore();
    let fail = true;
    const original = store.recordInstagramEvent.bind(store);
    store.recordInstagramEvent = async (event, job) => {
      if (fail) throw new Error('firestore unavailable');
      return original(event, job);
    };
    const h = setupHarness({ store });
    const body = delivery(shareMessage({ mid: 'm-intake', ts: T0 }));
    expect((await h.post(body)).status).toBe(503);
    expect(h.store.debugInstagramRecords().events).toHaveLength(0);
    fail = false;
    expect((await h.post(body)).status).toBe(200);
    const { events, jobs } = h.store.debugInstagramRecords();
    expect(events).toHaveLength(1);
    expect(jobs).toHaveLength(1);
    expect(events[0].id).toMatch(/^[0-9a-f]{64}$/); // hashed, safe document ID
    expect(events[0].uid).toBe('uid-ramit-tester');
    expect(jobs[0].status).toBe('queued');
  });

  it('keeps one event per recipient + message ID across sequential and concurrent retries', async () => {
    const h = setupHarness();
    const body = delivery(shareMessage({ mid: 'm-dup', ts: T0 }), noteMessage({ mid: 'm-dup-note', ts: T0 + 5000, text: 'same' }));
    for (let i = 0; i < 3; i++) expect((await h.post(body)).status).toBe(200);
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => h.post(body)));
    expect(concurrent.every((r) => r.status === 200)).toBe(true);
    const counts = await h.store.instagramCounts();
    expect(counts.events).toMatchObject({ shares: 1, notes: 1 });
    expect(counts.jobs.queued).toBe(2);
  });

  it('accepts the entry[].changes shape used by the dashboard sample', async () => {
    const h = setupHarness();
    const body = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: RECIPIENT,
          time: Math.floor(T0 / 1000),
          changes: [
            {
              field: 'messages',
              value: {
                sender: { id: SENDER_A },
                recipient: { id: RECIPIENT },
                timestamp: String(Math.floor(T0 / 1000)),
                message: { mid: 'm-changes', text: 'from the changes shape' },
              },
            },
          ],
        },
      ],
    });
    expect((await h.post(body)).status).toBe(200);
    expect((await h.store.instagramCounts()).events.notes).toBe(1);
  });

  it('health reports only whether the webhook is configured, never a secret', async () => {
    const h = setupHarness();
    const r = await request(h.app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.instagram).toEqual({ webhookConfigured: true });
    const text = JSON.stringify(r.body);
    for (const secret of [APP_SECRET, VERIFY_TOKEN, RECIPIENT, SENDER_A]) expect(text).not.toContain(secret);
  });
});

describe('Private worker trigger', () => {
  it('is not mounted when no worker identity is configured', async () => {
    const h = setupHarness();
    expect((await request(h.app).post('/internal/instagram/worker/run')).status).toBe(404);
    expect((await request(h.app).get('/internal/instagram/status')).status).toBe(404);
  });

  it('requires the configured caller and returns counts only', async () => {
    const h = setupHarness({ verifyWorkerCaller: async (t) => t === 'oidc-token-for-worker-sa' });
    expect((await request(h.app).post('/internal/instagram/worker/run')).status).toBe(401);
    expect(
      (await request(h.app).post('/internal/instagram/worker/run').set('Authorization', 'Bearer wrong')).status
    ).toBe(403);
    await h.post(delivery(noteMessage({ mid: 'm-status', ts: T0, text: 'private words' })));
    const status = await request(h.app).get('/internal/instagram/status').set('Authorization', 'Bearer oidc-token-for-worker-sa');
    expect(status.status).toBe(200);
    expect(status.body.events.notes).toBe(1);
    expect(status.body.webhook.stored).toBe(1);
    expect(JSON.stringify(status.body)).not.toContain('private words');
    const run = await request(h.app).post('/internal/instagram/worker/run').set('Authorization', 'Bearer oidc-token-for-worker-sa');
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ leased: 0 }); // the note is still inside its settle delay
  });

  it('the shared-secret verifier accepts only the exact secret', async () => {
    const { createWorkerCallerVerifier } = await import('../server/instagram/internal.js');
    const { testConfig } = await import('./helpers/instagram.js');
    const verify = createWorkerCallerVerifier(testConfig({ workerSecret: 'vm-cron-shared-secret' }));
    expect(await verify('vm-cron-shared-secret')).toBe(true);
    expect(await verify('vm-cron-shared-secre')).toBe(false);
    expect(await verify('vm-cron-shared-secretX')).toBe(false);
    const oidcOnly = createWorkerCallerVerifier(
      testConfig({ workerOidcAudience: 'https://example.invalid/internal/instagram/worker/run', workerServiceAccount: 'worker@p.iam.gserviceaccount.com' })
    );
    expect(await oidcOnly('not-a-jwt')).toBe(false);
  });
});
