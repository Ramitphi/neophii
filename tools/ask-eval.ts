/**
 * Does the reading follow what the person ASKED in their note? Made-up and one real public caption, caption-only
 * (no video), so the honest answer to many asks is "not in this save". Prints per-case lines and counts only.
 *
 *   GOOGLE_CLOUD_PROJECT=... GOOGLE_CLOUD_LOCATION=global npx tsx tools/ask-eval.ts [--show N]
 *
 * Works on code with or without user_ask, so the same file compares before and after a change.
 */
import { config } from '../server/config.js';
import { VertexGeminiService } from '../server/gemini.js';
import type { Memory, MemoryAnalysis } from '../src/types/neophi.js';

interface Case {
  name: string;
  caption: string;
  note: string;
  /** Acceptable ask kinds. */
  kinds: string[];
  /** Acceptable statuses for a caption-only save. */
  statuses: string[];
  /** The honest answer needs the video: `missing` must say so. */
  needsVideo: boolean;
  /** Words that, if the first suggestion repeats them without the ask, mean it ignored the ask. */
  offTopic?: RegExp;
}

export const CASES: Case[] = [
  {
    name: 'modi speech (the reported case)',
    caption: 'Happy Diwali to all of you. May Shri Ram protect the ones protecting the country and their families🙏🏼 Jai Shri Ram!',
    note: 'I want the entire speech by Modi in hindi to get saved.',
    kinds: ['full_text'],
    statuses: ['not_in_save'],
    needsVideo: true,
    offTopic: /festive|greeting|diwali/i,
  },
  {
    name: 'full recipe, caption has some',
    caption: 'Paneer tikka without a tandoor: 250g paneer, 3 tbsp hung curd, 1 tsp kasuri methi. Marinate and cook on a hot tawa. Full recipe in the video!',
    note: 'I want the full recipe with all quantities and timings',
    kinds: ['full_text', 'steps', 'details'],
    statuses: ['partly', 'not_in_save'],
    needsVideo: true,
  },
  {
    name: 'address and timings not in caption',
    caption: 'OMG this place 😍 Thalassa, Siolim, Goa #goa #travel #wanderlust',
    note: 'need the exact address and opening hours',
    kinds: ['details', 'place_or_product'],
    statuses: ['partly', 'not_in_save'],
    needsVideo: true,
  },
  {
    name: 'price and link missing',
    caption: 'This cordless mini vacuum actually works for car seats. Link in bio!',
    note: 'send me the price and where to buy it',
    kinds: ['details', 'place_or_product'],
    statuses: ['not_in_save', 'partly'],
    needsVideo: true,
  },
  {
    name: 'dsa sheet, caption has the facts',
    caption: 'DSA placement sheet: 450 questions, 15 topics. Start with arrays, do 5 a day, finish in 3 months.',
    note: 'need this DSA sheet for placements',
    kinds: ['details', 'steps', 'full_text', 'other'],
    statuses: ['found', 'partly'],
    needsVideo: false,
  },
  {
    name: 'label only',
    caption: 'Hidden café in Fort Kochi with a garden courtyard ☕ Open 8am–10pm, coffee from ₹180.',
    note: 'for Maa',
    kinds: ['remember'],
    statuses: ['found'],
    needsVideo: false,
  },
  {
    name: 'ask in Hindi',
    caption: 'नानी की आम की चटनी: कच्चा आम, गुड़, सौंफ, कलौंजी। धीमी आंच पर पकाएं।',
    note: 'इसकी पूरी रेसिपी हिंदी में चाहिए',
    kinds: ['full_text', 'steps'],
    statuses: ['partly', 'found'],
    needsVideo: false,
  },
  {
    name: 'reminder',
    caption: 'Learn the hook step of this trending song in 30 seconds 💃 slow version first, then full speed.',
    note: 'remind me to practise this on Sunday',
    kinds: ['reminder', 'remember', 'other'],
    statuses: ['found', 'partly', 'not_in_save'],
    needsVideo: false,
  },
  {
    name: 'noise caption, wants the steps',
    caption: 'wait for it 😂😂 #fyp #viral #reels #explore @friend1',
    note: 'I want all the steps of this dance',
    kinds: ['steps', 'full_text', 'details'],
    statuses: ['not_in_save'],
    needsVideo: true,
  },
  {
    name: 'ask the caption can answer',
    caption: '5 tips for a cover letter recruiters read: 1) open with the result 2) one story 3) keep it to 200 words 4) name the role 5) end with a question.',
    note: 'save the 5 tips',
    kinds: ['details', 'steps', 'full_text', 'other'],
    statuses: ['found'],
    needsVideo: false,
  },
  {
    name: 'translate the caption',
    caption: 'नानी की आम की चटनी: कच्चा आम, गुड़, सौंफ, कलौंजी। धीमी आंच पर पकाएं।',
    note: 'translate this to English',
    kinds: ['translate'],
    statuses: ['found', 'partly'],
    needsVideo: false,
  },
  {
    name: 'short summary of a long caption',
    caption: 'Budget 2026 in one post: income up to 12 lakh pays no tax under the new regime, standard deduction stays 75,000, TDS limit on rent rises to 6 lakh, and startups get 5 more years to claim the tax holiday.',
    note: 'give me a short summary',
    kinds: ['summary', 'details', 'other'],
    statuses: ['found', 'partly'],
    needsVideo: false,
  },
  {
    name: 'explain simply',
    caption: 'Index funds vs FD: FD gives about 7% fixed and is taxed as income, index funds track Nifty 50, average 11-12% over 10 years but can fall in a year.',
    note: 'explain this to me like I am new to investing',
    kinds: ['explain', 'summary'],
    statuses: ['found', 'partly'],
    needsVideo: false,
  },
  {
    name: 'speech text from a caption that has none (must not invent)',
    caption: "Independence Day 2026: the Prime Minister's address from the Red Fort 🇮🇳 #IndependenceDay",
    note: 'write the full text of this speech',
    kinds: ['full_text'],
    statuses: ['not_in_save'],
    needsVideo: true,
  },
];

const showIdx = process.argv.includes('--show') ? Number(process.argv[process.argv.indexOf('--show') + 1]) : -1;

async function main() {
  if (!config.project) throw new Error('set GOOGLE_CLOUD_PROJECT');
  const gemini = new VertexGeminiService();
  let withAsk = 0;
  let kindOk = 0;
  let statusOk = 0;
  let missingSaysVideo = 0;
  let needVideo = 0;
  let onTopic = 0;
  let honest = 0;
  let invented = 0;
  const started = Date.now();
  for (const [i, c] of CASES.entries()) {
    const memory = {
      id: `ask-${i}`,
      url: `https://www.instagram.com/reel/ask${i}/`,
      title: '',
      caption: c.caption,
      note: c.note,
      chip: null,
      ingest: 'link_metadata',
      privateNoAI: false,
    } as unknown as Memory;
    let a: MemoryAnalysis | null = null;
    try {
      a = await gemini.analyzeMemory(memory);
    } catch (err) {
      console.log(`${i} ${c.name}: error ${String((err as Error).message).slice(0, 80)}`);
      continue;
    }
    if (!a) continue;
    const ask = (a as MemoryAnalysis & { user_ask?: { kind: string; status: string; answer: string; missing: string } }).user_ask;
    const firstSuggestion = a.inferred_possible_intents[0]?.intent ?? '';
    if (ask) withAsk++;
    const k = ask ? c.kinds.includes(ask.kind) : false;
    const s = ask ? c.statuses.includes(ask.status) : false;
    if (k) kindOk++;
    if (s) statusOk++;
    if (c.needsVideo) {
      needVideo++;
      if (ask && /video|file|screen|record|upload/i.test(ask.missing)) missingSaysVideo++;
    }
    const ignored = c.offTopic ? c.offTopic.test(firstSuggestion) || c.offTopic.test(a.suggested_actions.join(' ')) : false;
    if (!ignored) onTopic++;
    // Honest: never claims it has what a caption-only save cannot hold.
    const overclaim = ask?.status === 'found' && c.needsVideo;
    if (!overclaim) honest++;
    // Invented: a caption-only save that cannot hold the text still came back with a long answer.
    const made = c.needsVideo && c.statuses.length === 1 && c.statuses[0] === 'not_in_save' && (ask?.answer.length ?? 0) > 200;
    if (made) invented++;
    console.log(
      `${i} ${c.name}: ask=${ask ? `${ask.kind}/${ask.status}/${ask.answer.length}ch` : 'none'} kind${k ? 'ok' : 'X'} status${s ? 'ok' : 'X'} firstSuggestion="${firstSuggestion.slice(0, 70)}"`
    );
    if (i === showIdx) console.log(JSON.stringify({ ask, what: (a as { what_this_is?: string }).what_this_is, intents: a.inferred_possible_intents, actions: a.suggested_actions }, null, 2));
  }
  const n = CASES.length;
  console.log(
    `\nresults (${n} cases, ${Math.round((Date.now() - started) / 1000)} s): ask present ${withAsk}/${n}; kind right ${kindOk}/${n}; status right ${statusOk}/${n}; ` +
      `missing says video/file ${missingSaysVideo}/${needVideo}; suggestion on topic ${onTopic}/${n}; no over-claim ${honest}/${n}; invented long answers ${invented}`
  );
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});
