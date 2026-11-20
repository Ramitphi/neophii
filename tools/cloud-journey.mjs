#!/usr/bin/env node
// The whole journey against a deployed service, with no Meta and no person: a throw-away signed-in user connects an
// Instagram sender with a one-time code, a synthetic Reel and a note arrive as signed deliveries, the worker turns
// them into a save, the save is read back through the same API the site uses, and everything is deleted again.
//
//   node tools/cloud-journey.mjs --public https://PUBLIC_URL --api-key FIREBASE_WEB_API_KEY
//   node tools/cloud-journey.mjs --public http://localhost:8099 --dev            (local server only)
//
// Needs in the environment of this one process (never on a command line, never printed):
//   META_APP_SECRET        the parent app's secret, to sign the synthetic deliveries
//   META_IG_RECIPIENT_ID   the connected account's numeric ID (17841449458840084)
// Optional: --wait-seconds N (default 240; the Scheduler runs the worker about once a minute).
//
// The synthetic sender is an ID that is not a real person. The throw-away user and everything it saved are deleted
// at the end (DELETE /api/instagram/link, DELETE /api/me), even when a check fails. Output is PASS/FAIL lines and
// counts only: no codes, tokens, IDs, URLs or message text.
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = (opt('public') || '').replace(/\/+$/, '');
const apiKey = opt('api-key') || '';
const dev = args.includes('--dev');
const waitMs = Number(opt('wait-seconds') || 240) * 1000;
const secret = process.env.META_APP_SECRET || '';
const recipient = process.env.META_IG_RECIPIENT_ID || '';

if (!base || !secret || !recipient || (!dev && !apiKey)) {
  console.error('usage: META_APP_SECRET=... META_IG_RECIPIENT_ID=... node tools/cloud-journey.mjs --public URL (--api-key KEY | --dev) [--wait-seconds N]');
  process.exit(2);
}
if (dev && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error('--dev is for a local server only');
  process.exit(2);
}

const results = [];
const check = (ok, name, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = '';
async function api(path, init = {}) {
  const res = await fetch(`${base}/api${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body };
}

async function signIn() {
  if (dev) {
    token = `dev-uid:journey${crypto.randomBytes(5).toString('hex')}`;
    return true;
  }
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.idToken) {
    check(false, 'anonymous sign-in works (Firebase Authentication, Anonymous provider enabled)', `status ${res.status}${body?.error?.message ? ` ${body.error.message}` : ''}`);
    return false;
  }
  token = body.idToken;
  return true;
}

let counter = 0;
async function deliver(sender, message) {
  const now = Date.now() + ++counter; // strictly increasing, so a note always follows its share
  const body = JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: recipient,
        time: Math.floor(now / 1000),
        messaging: [{ sender: { id: sender }, recipient: { id: recipient }, timestamp: now, message: { mid: `journey-${crypto.randomUUID()}`, ...message } }],
      },
    ],
  });
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  const res = await fetch(`${base}/webhooks/instagram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body,
  });
  return res.status;
}

const SENDER = `99${Date.now()}`.slice(0, 16); // not a real Instagram account
const SLUG = `Cjourney${crypto.randomBytes(4).toString('hex')}`;
const CAPTION = 'Synthetic journey check: sunday paneer tikka';
const NOTE = 'Maa ke liye  🥞\n  journey check, kasuri methi step  ';

async function run() {
  if (!(await signIn())) return;
  check(true, 'signed in as a throw-away user');

  const health = await fetch(`${base}/api/health`).then((r) => r.json()).catch(() => null);
  check(Boolean(health?.instagram?.webhookConfigured), 'service says Instagram capture is configured');

  const status0 = await api('/instagram/link');
  check(status0.status === 200 && status0.body?.available === true && status0.body?.linked === false, 'link status: available and not yet linked', `status ${status0.status}`);
  check(typeof status0.body?.handle === 'string' && status0.body.handle.length > 0, 'INSTAGRAM_HANDLE is set (the site names the account to message)');

  const made = await api('/instagram/link-code', { method: 'POST' });
  const code = made.body?.code;
  check(made.status === 200 && /^NEO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code || ''), 'a one-time code is issued', `status ${made.status}`);
  if (!code) return;

  check((await deliver(SENDER, { text: code })) === 200, 'the code arrives as a signed DM and is accepted');
  let linked = false;
  for (let i = 0; i < 10 && !linked; i++) {
    linked = (await api('/instagram/link')).body?.linked === true;
    if (!linked) await sleep(1000);
  }
  check(linked, 'the site would show "connected" (link stored)');
  check((await api('/memories')).body?.length === 0, 'the code was not stored as a note or a save');

  check(
    (await deliver(SENDER, { attachments: [{ type: 'ig_reel', payload: { reel_video_id: `reel-${SLUG}`, title: CAPTION, url: `https://www.instagram.com/reel/${SLUG}/` } }] })) === 200,
    'a Reel arrives as a signed DM'
  );
  check((await deliver(SENDER, { text: NOTE })) === 200, 'the note arrives as a signed DM');

  const deadline = Date.now() + waitMs;
  let memory = null;
  let waited = 0;
  while (Date.now() < deadline) {
    const list = (await api('/memories')).body;
    memory = Array.isArray(list) ? list.find((m) => m.dm) || null : null;
    if (memory && memory.note === NOTE && memory.analysisStatus !== 'pending') break;
    await sleep(5000);
    waited += 5;
  }
  check(Boolean(memory), 'the save appears in the library', `after ${waited}s`);
  if (!memory) return;
  check(memory.note === NOTE, 'the note is kept exactly, byte for byte');
  check(memory.platform === 'instagram' && memory.dm?.channel === 'instagram_dm', 'the save is marked as an Instagram DM save');
  check(memory.title === CAPTION, 'the caption became the title');
  check(typeof memory.url === 'string' && memory.url.includes(`/reel/${SLUG}/`), 'the Reel link is kept, so the site can offer the preview');
  check(memory.analysisStatus === 'done', 'the reading finished', `analysisStatus=${memory.analysisStatus}`);
  console.log(`INFO  ingest=${memory.ingest} analysisBasis=${memory.dm?.analysisBasis ?? 'none'} mediaOutcome=${memory.dm?.mediaOutcome ?? 'none'}`);

  const one = await api(`/memories/${encodeURIComponent(memory.id)}`);
  check(one.status === 200 && one.body?.id === memory.id, 'the save page can load it');
}

try {
  await run();
} catch (err) {
  check(false, 'journey ran without an unexpected error', String(err?.message || err).slice(0, 120));
} finally {
  if (token) {
    const off = await api('/instagram/link', { method: 'DELETE' }).catch(() => null);
    const gone = await api('/me', { method: 'DELETE' }).catch(() => null);
    check(off?.status === 200 && gone?.status === 200, 'cleanup: link removed and the throw-away user deleted', `link ${off?.status ?? 'x'}, user ${gone?.status ?? 'x'}`);
  }
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}
