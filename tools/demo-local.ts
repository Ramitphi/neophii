// Local demo of the whole journey, with no Google or Meta account:
//   site (built client)  <->  Neophi server  <->  signed webhook deliveries  <-  a simulated Instagram DM screen.
// The Instagram screen posts exactly what Meta posts (a signed JSON delivery), so the real webhook, link-code
// check, durable queue and worker all run. Gemini and storage are stand-ins; secrets are throw-away.
//
//   npm run build:client && npx tsx tools/demo-local.ts
//   open http://localhost:8099/            (the Neophi site)
//   open http://localhost:8099/demo/instagram   (the simulated DM screen, in another window)
import crypto from 'node:crypto';
import express from 'express';
import type { GeminiService } from '../server/gemini.js';
import { createApp } from '../server/index.js';
import { loadInstagramConfig } from '../server/instagram/config.js';
import { startInstagramPoller, type InstagramWorker } from '../server/instagram/worker.js';
import type { MediaStorage } from '../server/storage.js';
import { InMemoryStore } from '../server/store.js';
import type { Memory } from '../src/types/neophi.js';

const PORT = Number(process.env.DEMO_PORT || 8099);
const APP_SECRET = 'demo-only-app-secret';
const RECIPIENT = '17841449458840084';
const SENDER = '1100000000000777';
const HANDLE = 'yuck.pov';

const store = new InMemoryStore();
const storage: MediaStorage = {
  async putMedia() {
    throw new Error('demo has no media storage');
  },
  async getSignedOrStreamData() {
    return null;
  },
  async deleteMedia() {},
  async deleteAllUserMedia() {},
};

// A stand-in reader: describes only what the caption says, as the real one does when it has no video.
const gemini: GeminiService = {
  async analyzeMemory(m: Memory) {
    const cap = m.caption ?? m.title;
    return {
      source_summary: `The caption says: ${cap}`,
      evidence: [{ id: 'c_00', kind: 'caption', ref: `caption: ${cap.slice(0, 60)}` }],
      observed_objects: [],
      visible_text: [],
      transcript_summary: '',
      inferred_possible_intents: [{ intent: 'Come back to this later', confidence: 0.55, evidence: ['c_00'], origin: 'ai', label: 'AI suggestion' }],
      actionable_entities: [],
      suggested_actions: [],
      purpose: 'other',
      note_grounding: { status: 'not_attempted', evidence: [], explanation: '' },
    } as never;
  },
  async embedText() {
    return [0.1, 0.2, 0.3];
  },
  async rewriteSearchQuery(q: string) {
    return { english: q, hindi: q, hinglish: q, keywords: q.toLowerCase().split(/\s+/).filter((w) => w.length > 1), timeHint: null };
  },
  async suggestCategory() {
    return null;
  },
  async buildOutcome() {
    return [];
  },
};

const igConfig = {
  ...loadInstagramConfig({
    META_APP_SECRET: APP_SECRET,
    META_VERIFY_TOKEN: 'demo-verify-token',
    META_IG_RECIPIENT_ID: RECIPIENT,
    INSTAGRAM_HANDLE: HANDLE,
  }),
  noteSettleMs: 2500, // the real value is 15 s; shorter here so the demo feels live
};

const app = createApp({
  store,
  storage,
  gemini,
  instagram: {
    config: igConfig,
    fetchImpl: async () => new Response('<!doctype html><title>Instagram</title>', { status: 200, headers: { 'content-type': 'text/html' } }),
  },
});
startInstagramPoller(app.locals.instagramWorker as InstagramWorker, 1000);

let n = 0;
async function deliver(message: Record<string, unknown>): Promise<number> {
  n++;
  const body = JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: RECIPIENT,
        time: Math.floor(Date.now() / 1000),
        messaging: [{ sender: { id: SENDER }, recipient: { id: RECIPIENT }, timestamp: Date.now(), message: { mid: `demo-${Date.now()}-${n}`, ...message } }],
      },
    ],
  });
  const signature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  const res = await fetch(`http://127.0.0.1:${PORT}/webhooks/instagram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body,
  });
  return res.status;
}

const REELS = [
  { title: 'Sunday paneer tikka, crispy outside, soft inside #recipe', slug: 'CdemoPaneer1' },
  { title: 'Hidden cafe in Jaipur with a rooftop view #travel', slug: 'CdemoJaipur2' },
  { title: 'Balcony herb garden in 10 minutes #diy', slug: 'CdemoBalcony3' },
];

const demo = express.Router();
demo.use(express.json());
demo.post('/send', async (req, res) => {
  const { kind, text, index } = req.body as { kind?: string; text?: string; index?: number };
  if (kind === 'reel') {
    const r = REELS[Math.max(0, Math.min(REELS.length - 1, Number(index) || 0))];
    const status = await deliver({
      attachments: [{ type: 'ig_reel', payload: { reel_video_id: `reel-${r.slug}`, title: r.title, url: `https://www.instagram.com/reel/${r.slug}/` } }],
    });
    res.json({ status, title: r.title });
    return;
  }
  const status = await deliver({ text: String(text ?? '') });
  res.json({ status });
});
demo.get('/reels', (_req, res) => res.json(REELS.map((r) => r.title)));
demo.get('/instagram', (_req, res) => {
  res.type('html').send(PHONE_HTML);
});

const outer = express();
outer.use('/demo', demo);
outer.use(app);
outer.listen(PORT, () => {
  console.info(`Neophi demo on http://localhost:${PORT}/  (Instagram screen: http://localhost:${PORT}/demo/instagram)`);
});

const PHONE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instagram DM (simulated)</title>
<style>
  body{margin:0;font:15px system-ui,sans-serif;background:#fafafa;color:#111;display:flex;justify-content:center}
  .phone{width:min(420px,100vw);min-height:100vh;display:flex;flex-direction:column;background:#fff;border-inline:1px solid #ddd}
  header{display:flex;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid #eee}
  .av{width:34px;height:34px;border-radius:50%;background:linear-gradient(45deg,#f58529,#dd2a7b,#8134af)}
  .sim{margin:8px 14px;padding:8px 10px;background:#fff7e0;border:1px solid #f0d78c;border-radius:8px;font-size:12px}
  #log{flex:1;padding:14px;display:flex;flex-direction:column;gap:8px;overflow:auto}
  .me{align-self:flex-end;background:#3797f0;color:#fff;padding:8px 12px;border-radius:18px;max-width:80%;white-space:pre-wrap}
  .reel{align-self:flex-end;background:#262626;color:#fff;padding:10px 12px;border-radius:14px;max-width:80%}
  .reel small{display:block;opacity:.7;margin-bottom:4px}
  .bar{padding:10px 14px;border-top:1px solid #eee;display:grid;gap:8px}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  input{flex:1;min-width:0;padding:10px 12px;border:1px solid #ddd;border-radius:20px;font:inherit}
  button{padding:9px 14px;border:0;border-radius:18px;background:#3797f0;color:#fff;font:inherit;cursor:pointer}
  button.alt{background:#efefef;color:#111}
</style></head><body><div class="phone">
<header><div class="av"></div><div><b>${HANDLE}</b><div style="font-size:12px;color:#777">Instagram DM</div></div></header>
<div class="sim">Simulated Instagram screen for local testing. It sends the same signed messages Meta would.</div>
<div id="log"></div>
<div class="bar">
  <div class="row" id="reels"></div>
  <form class="row" id="f"><input id="t" placeholder="Message… (paste your code, or say why)" autocomplete="off"><button>Send</button></form>
</div></div>
<script>
const log=document.getElementById('log');
function add(cls,html){const d=document.createElement('div');d.className=cls;d.innerHTML=html;log.appendChild(d);log.scrollTop=log.scrollHeight}
function esc(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
async function send(body){const r=await fetch('/demo/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json()}
document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();const t=document.getElementById('t');const v=t.value;if(!v.trim())return;t.value='';add('me',esc(v));await send({kind:'text',text:v})});
fetch('/demo/reels').then(r=>r.json()).then(list=>{const box=document.getElementById('reels');list.forEach((title,i)=>{const b=document.createElement('button');b.className='alt';b.textContent='Share Reel '+(i+1);b.title=title;b.onclick=async()=>{add('reel','<small>Reel</small>'+esc(title));await send({kind:'reel',index:i})};box.appendChild(b)})});
</script></body></html>`;
