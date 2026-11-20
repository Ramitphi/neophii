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
  expect: string;
  caption: string;
  note: string | null;
}

export const EVAL_ITEMS: Item[] = [
  { expect: 'recipe', caption: 'Dhaba-style dal tadka in 20 minutes 🍲 Toor dal, ghee, jeera, garlic, 2 dried red chillies. Pressure cook 3 whistles, then the tadka.', note: 'Sunday lunch' },
  { expect: 'recipe', caption: 'Overnight oats 3 ways: cocoa banana, mango chia, PB jelly. Half cup oats, half cup milk, fridge overnight.', note: null },
  { expect: 'travel_place', caption: 'Hidden café in Fort Kochi with a garden courtyard ☕ Open 8am–10pm, coffee from ₹180. Near the Chinese fishing nets.', note: 'december trip' },
  { expect: 'travel_place', caption: 'Spiti in 7 days: Shimla → Kalpa → Kaza → Chandratal. Best time June to September. Budget around ₹25k per person.', note: 'with college gang' },
  { expect: 'product_shopping', caption: 'This ₹1,299 cordless mini vacuum from Agaro actually works for car seats. Link in bio, Amazon sale ends Sunday.', note: null },
  { expect: 'tutorial_howto', caption: 'How to write a cover letter recruiters read: 1) open with the result 2) one story 3) end with a question. Save this!', note: 'job hunt' },
  { expect: 'diy_home', caption: 'Balcony makeover under ₹3000: jute rug, solar fairy lights, two money plants in hanging planters, fresh coat of white paint.', note: 'balcony ke liye' },
  { expect: 'fitness', caption: '15-min no-equipment core workout: plank 45s, dead bug 12 reps, Russian twists 20, 3 rounds. Rest 30s.', note: null },
  { expect: 'fashion_style', caption: '5 ways to style a white kurta for office 🤍 with denim, with a blazer, with juttis, with a dupatta, with sneakers.', note: 'shaadi season' },
  { expect: 'tech_tool', caption: 'This free app turns your phone into a document scanner with auto-crop and OCR. Works offline. Name in the comments.', note: null },
  { expect: 'finance', caption: 'SIP vs lump sum explained in 60 seconds. Rupee cost averaging, why timing the market rarely works. Not financial advice.', note: 'samajhna hai' },
  { expect: 'news_explainer', caption: 'Why are onion prices up 40% this month? Late monsoon, export rules and storage losses, explained simply.', note: null },
  { expect: 'humour_meme', caption: 'Me explaining to my mom why I need a ₹200 coffee when there is Nescafé at home 😂 #relatable', note: null },
  { expect: 'music_dance', caption: 'Learn the hook step of this trending song in 30 seconds 💃 slow version first, then full speed. Tag your dance partner!', note: 'sangeet' },
  { expect: 'quote_motivation', caption: '"You do not rise to the level of your goals, you fall to the level of your systems." Start small today.', note: null },
  { expect: 'event_offer', caption: 'Bengaluru! Indie music night this Saturday 7pm at the Courtyard, Koramangala. Early bird ₹499 till Thursday.', note: 'with Riya' },
  { expect: 'personal_other', caption: 'Dadi turned 80 today and still beat all of us at carrom ❤️', note: null },
  { expect: 'recipe', caption: 'नानी की आम की चटनी: कच्चा आम, गुड़, सौंफ, कलौंजी। धीमी आंच पर 15 मिनट।', note: 'गर्मियों के लिए' },
];

const priceIn = Number(argValue('--price-in') ?? NaN);
const priceOut = Number(argValue('--price-out') ?? NaN);

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function cited(a: MemoryAnalysis): { cited: number; total: number } {
  const lists: Array<{ evidence: string[] }[]> = [a.observed_objects, a.inferred_possible_intents, a.actionable_entities];
  const withDetails = a as MemoryAnalysis & { type_details?: { evidence: string[] }[] };
  if (Array.isArray(withDetails.type_details)) lists.push(withDetails.type_details);
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
    const withType = a as MemoryAnalysis & { reel_type?: string; reel_type_uncertain?: boolean; type_details?: unknown[] };
    if (withType.reel_type) {
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
