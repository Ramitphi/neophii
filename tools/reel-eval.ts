/**
 * Small eval of the analysis on made-up, caption-only Reels (no media, no real people).
 * Calls Vertex with the configured ANALYSIS_MODEL and prints counts only.
 *
 *   GOOGLE_CLOUD_PROJECT=... npx tsx tools/reel-eval.ts [--price-in USD_PER_1M] [--price-out USD_PER_1M]
 *
 * Works on code with or without reel_type (type accuracy is reported only when the reading has one),
 * so the same file can compare before and after a change.
 */
import { GoogleGenAI } from '@google/genai';
import { config } from '../server/config.js';
import { VertexGeminiService } from '../server/gemini.js';
import type { Memory, MemoryAnalysis } from '../src/types/neophi.js';

interface Item {
  /** Expected Reel type, or null when the caption alone cannot tell. */
  expect: string | null;
  caption: string;
  note: string | null;
  /** Caption labels counted as right. */
  use?: string[];
}

const INF = ['informative'];
const INF_MIX = ['informative', 'mixed'];

export const EVAL_ITEMS: Item[] = [
  { expect: 'recipe', caption: 'Dhaba-style dal tadka in 20 minutes 🍲 Toor dal, ghee, jeera, garlic, 2 dried red chillies. Pressure cook 3 whistles, then the tadka.', note: 'Sunday lunch', use: INF },
  { expect: 'recipe', caption: 'Overnight oats 3 ways: cocoa banana, mango chia, PB jelly. Half cup oats, half cup milk, fridge overnight.', note: null, use: INF },
  { expect: 'travel_place', caption: 'Hidden café in Fort Kochi with a garden courtyard ☕ Open 8am–10pm, coffee from ₹180. Near the Chinese fishing nets.', note: 'december trip', use: INF },
  { expect: 'travel_place', caption: 'Spiti in 7 days: Shimla → Kalpa → Kaza → Chandratal. Best time June to September. Budget around ₹25k per person.', note: 'with college gang', use: INF },
  { expect: 'product_shopping', caption: 'This ₹1,299 cordless mini vacuum from Agaro actually works for car seats. Link in bio, Amazon sale ends Sunday.', note: null, use: INF },
  { expect: 'tutorial_howto', caption: 'How to write a cover letter recruiters read: 1) open with the result 2) one story 3) end with a question. Save this!', note: 'job hunt', use: INF },
  { expect: 'diy_home', caption: 'Balcony makeover under ₹3000: jute rug, solar fairy lights, two money plants in hanging planters, fresh coat of white paint.', note: 'balcony ke liye', use: INF },
  { expect: 'fitness', caption: '15-min no-equipment core workout: plank 45s, dead bug 12 reps, Russian twists 20, 3 rounds. Rest 30s.', note: null, use: INF },
  { expect: 'fashion_style', caption: '5 ways to style a white kurta for office 🤍 with denim, with a blazer, with juttis, with a dupatta, with sneakers.', note: 'shaadi season', use: INF_MIX },
  { expect: 'tech_tool', caption: 'This free app turns your phone into a document scanner with auto-crop and OCR. Works offline. Name in the comments.', note: null, use: INF_MIX },
  { expect: 'finance', caption: 'SIP vs lump sum explained in 60 seconds. Rupee cost averaging, why timing the market rarely works. Not financial advice.', note: 'samajhna hai', use: INF_MIX },
  { expect: 'news_explainer', caption: 'Why are onion prices up 40% this month? Late monsoon, export rules and storage losses, explained simply.', note: null, use: INF_MIX },
  { expect: 'humour_meme', caption: 'Me explaining to my mom why I need a ₹200 coffee when there is Nescafé at home 😂 #relatable', note: null, use: ['mixed', 'informative', 'noise'] },
  { expect: 'music_dance', caption: 'Learn the hook step of this trending song in 30 seconds 💃 slow version first, then full speed. Tag your dance partner!', note: 'sangeet', use: INF_MIX },
  { expect: 'quote_motivation', caption: '"You do not rise to the level of your goals, you fall to the level of your systems." Start small today.', note: null, use: INF_MIX },
  { expect: 'event_offer', caption: 'Bengaluru! Indie music night this Saturday 7pm at the Courtyard, Koramangala. Early bird ₹499 till Thursday.', note: 'with Riya', use: INF },
  { expect: 'personal_other', caption: 'Dadi turned 80 today and still beat all of us at carrom ❤️', note: null, use: ['mixed', 'informative', 'noise'] },
  { expect: 'recipe', caption: 'नानी की आम की चटनी: कच्चा आम, गुड़, सौंफ, कलौंजी। धीमी आंच पर 15 मिनट।', note: 'गर्मियों के लिए', use: INF },
  { expect: null, caption: 'wait for it 😂😂 #fyp #viral #reels #explore @friend1 @friend2', note: null, use: ['noise'] },
  { expect: null, caption: 'Follow for more ✨ #trending #instagood #reelsindia #explorepage', note: null, use: ['noise'] },
  { expect: null, caption: '🔥🔥🔥 #gymlife #motivation #fitfam #noexcuses', note: null, use: ['noise'] },
  { expect: 'travel_place', caption: 'OMG this place 😍😍 #goa #travel #wanderlust Thalassa, Siolim. Get there before sunset, 6:30pm', note: null, use: ['mixed', 'informative'] },
];

const priceIn = Number(argValue('--price-in') ?? NaN);
const priceOut = Number(argValue('--price-out') ?? NaN);

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function cited(a: MemoryAnalysis): { cited: number; total: number } {
  const lists: Array<{ evidence: string[] }[]> = [a.observed_objects, a.inferred_possible_intents, a.actionable_entities];
  const withDetails = a as MemoryAnalysis & { type_details?: { evidence: string[] }[]; key_points?: { evidence: string[] }[] };
  if (Array.isArray(withDetails.type_details)) lists.push(withDetails.type_details);
  if (Array.isArray(withDetails.key_points)) lists.push(withDetails.key_points);
  let c = 0;
  let t = 0;
  for (const list of lists) for (const x of list) {
    t++;
    if (x.evidence.length > 0) c++;
  }
  return { cited: c, total: t };
}

async function main() {
  if (!config.project) throw new Error('set GOOGLE_CLOUD_PROJECT');
  const real = new GoogleGenAI({ vertexai: true, project: config.project, location: config.location });
  const usage = { in: 0, out: 0, think: 0 };
  const client = {
    models: {
      ...real.models,
      generateContent: async (req: Parameters<typeof real.models.generateContent>[0]) => {
        const res = await real.models.generateContent(req);
        usage.in += res.usageMetadata?.promptTokenCount ?? 0;
        usage.out += res.usageMetadata?.candidatesTokenCount ?? 0;
        usage.think += res.usageMetadata?.thoughtsTokenCount ?? 0;
        return res;
      },
    },
  };
  const gemini = new VertexGeminiService({ client: client as never });

  let valid = 0;
  let typed = 0;
  let correct = 0;
  let uncertain = 0;
  let details = 0;
  let citedItems = 0;
  let totalItems = 0;
  let noteKept = 0;
  let signalSeen = 0;
  let signalRight = 0;
  let whatSeen = 0;
  let pointsSeen = 0;
  let pointsTotal = 0;
  let usefulItems = 0;
  let noNoteWithLine = 0;
  let noNote = 0;
  const signalMisses: string[] = [];
  const misses: string[] = [];
  const started = Date.now();

  for (const [i, item] of EVAL_ITEMS.entries()) {
    const memory = {
      id: `eval-${i}`,
      url: `https://www.instagram.com/reel/eval${i}/`,
      title: '',
      caption: item.caption,
      note: item.note,
      chip: null,
      ingest: 'link_metadata',
      privateNoAI: false,
    } as unknown as Memory;
    let a: MemoryAnalysis | null = null;
    try {
      a = await gemini.analyzeMemory(memory);
    } catch (err) {
      console.log(`item ${i}: error ${String((err as Error).message).slice(0, 80)}`);
    }
    if (memory.note !== item.note) throw new Error('note changed');
    noteKept++;
    if (!a) continue;
    valid++;
    const c = cited(a);
    citedItems += c.cited;
    totalItems += c.total;
    const extra = a as MemoryAnalysis & {
      caption_signal?: { usefulness: string };
      what_this_is?: string;
      key_points?: unknown[];
    };
    if (item.note === null) noNote++;
    if (extra.caption_signal) {
      signalSeen++;
      if ((item.use ?? []).includes(extra.caption_signal.usefulness)) signalRight++;
      else signalMisses.push(`${i}:${extra.caption_signal.usefulness}`);
    }
    if (extra.what_this_is) whatSeen++;
    const useful = !(item.use ?? []).every((u) => u === 'noise');
    if (useful) usefulItems++;
    if (useful && (extra.key_points?.length ?? 0) > 0) pointsSeen++;
    pointsTotal += extra.key_points?.length ?? 0;
    if (item.note === null && (extra.what_this_is || (extra.key_points?.length ?? 0) > 0)) noNoteWithLine++;
    const withType = a as MemoryAnalysis & { reel_type?: string; reel_type_uncertain?: boolean; type_details?: unknown[] };
    if (withType.reel_type && item.expect !== null) {
      typed++;
      if (withType.reel_type === item.expect) correct++;
      else misses.push(`${item.expect}->${withType.reel_type}`);
      if (withType.reel_type_uncertain) uncertain++;
      details += withType.type_details?.length ?? 0;
    }
  }

  const n = EVAL_ITEMS.length;
  const seconds = (Date.now() - started) / 1000;
  console.log(`model ${config.analysisModel}, location ${config.location}, items ${n} (caption only)`);
  console.log(`valid outputs ${valid}/${n}; notes unchanged ${noteKept}/${n}`);
  if (typed > 0) {
    console.log(`type accuracy ${correct}/${typed}; uncertain ${uncertain}; type details kept ${details} (${(details / typed).toFixed(1)} per save)`);
    if (misses.length) console.log(`misses: ${misses.join(', ')}`);
  } else {
    console.log('type accuracy: not available (this code has no reel_type)');
  }
  if (signalSeen > 0) {
    console.log(`caption usefulness right ${signalRight}/${signalSeen}${signalMisses.length ? ` (misses ${signalMisses.join(', ')})` : ''}`);
    console.log(`what-this-is present ${whatSeen}/${valid}; key points present on useful captions ${pointsSeen}/${usefulItems} (${pointsTotal} points); saves without a note that still get an AI line ${noNoteWithLine}/${noNote}`);
  } else {
    console.log('caption signal and key points: not available in this code');
  }
  console.log(`evidence-cited rate ${citedItems}/${totalItems} (${totalItems ? Math.round((100 * citedItems) / totalItems) : 0}%)`);
  console.log(
    `tokens per save: in ${Math.round(usage.in / n)}, out ${Math.round(usage.out / n)}, thinking ${Math.round(usage.think / n)}; ${(seconds / n).toFixed(1)} s per save`
  );
  if (Number.isFinite(priceIn) && Number.isFinite(priceOut)) {
    const perSave = ((usage.in / n) * priceIn + ((usage.out + usage.think) / n) * priceOut) / 1e6;
    console.log(`cost per save at $${priceIn}/$${priceOut} per 1M tokens in/out: $${perSave.toFixed(5)}`);
  }
}

await main();
