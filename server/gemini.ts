import { GoogleGenAI, Type } from '@google/genai';
import type {
  Category,
  Memory,
  MemoryAnalysis,
  OutcomeSection,
  OutcomeType,
  ReelType,
  SearchQueryUnderstanding,
} from '../src/types/neophi.js';
import {
  ASK_KINDS,
  ASK_STATUSES,
  CAPTION_USEFULNESS,
  KEY_POINT_KINDS,
  REEL_TYPES,
  TYPE_DETAIL_FIELDS,
} from '../src/types/neophi.js';
import { config } from './config.js';
import { guardAnalysis } from './guard.js';

const ANALYSIS_RULES =
  "You read one saved item for a personal memory app. Return only JSON in the given schema. Rules: (1) Never write the user's reason; the user's note is theirs and is kept by code. You read it only to fill user_ask (see 12). (2) Every observation, suggestion and entity must cite an evidence id from your evidence list; if you cannot, leave evidence empty. (3) Only describe what you can actually see or hear in the media provided. If no media is provided, describe only the caption text; never guess what a video shows. (4) A fact that appears only in the user's note must not cite media or caption evidence. (5) Suggestions are possibilities with a confidence from 0 to 1, not facts. (6) Evidence for video uses seconds (t, tEnd); for images use a region in percent (bbox x, y, w, h).";

/**
 * What to look for in each kind of Reel. Shown to the model as a rubric; the guard enforces the list and the evidence.
 * Keep the keys in step with REEL_TYPES.
 */
export const REEL_TYPE_RUBRIC: Record<ReelType, string> = {
  recipe: 'cooking or a dish; details: dish, ingredient (one per item), step, time',
  travel_place: 'a place to visit, stay or eat at; details: place, area, price, hours',
  product_shopping: 'a product to buy or a haul or review; details: product, brand, price, where_to_buy',
  tutorial_howto: 'teaches how to do something (not cooking, home or fitness); details: step, tool, topic',
  diy_home: 'home, decor, cleaning, gardening or a craft project; details: material, tool, step',
  fitness: 'workout, exercise, yoga or sport; details: exercise, sets_reps, time',
  fashion_style: 'outfits, clothes, makeup, skincare or hair; details: item, brand, price',
  tech_tool: 'an app, gadget, website, software or AI tool; details: tool, topic, price',
  finance: 'money, investing, saving, tax or prices; details: topic, figure. Never add advice of your own',
  news_explainer: 'news, current events or an explainer of a topic; details: topic, claim, source',
  humour_meme: 'a joke, sketch, meme or prank; details: topic',
  music_dance: 'a song, dance, cover or performance; details: song, topic',
  quote_motivation: 'a quote, affirmation or motivational talk; details: quote, topic',
  event_offer: 'an event, sale, launch or limited-time offer; details: date, venue, offer, deadline, price',
  personal_other: 'a personal moment or anything that fits none of the above',
};

export const ANALYSIS_SYSTEM_INSTRUCTION = `${ANALYSIS_RULES} Classify the item: (7) Pick reel_type from this list only, after writing the evidence; choose the single main type of the whole item, not of one detail: ${Object.entries(
  REEL_TYPE_RUBRIC
)
  .map(([k, v]) => `${k} = ${v}`)
  .join('; ')}. Give reel_type_confidence from 0 to 1 and cite the evidence ids that show the type in reel_type_evidence. Use personal_other with a low confidence when nothing fits. The user's note may tell you why they saved it, but the type describes the item itself. (8) type_details holds only facts that are stated or shown in the item, each with the field named for that type above, a short value copied or closely paraphrased from the source, and at least one evidence id. Never fill a detail from general knowledge: no prices, hours, addresses, ingredients or steps that are not in the item. Leave type_details empty rather than guess. Judge the caption: (9) Set caption_signal.usefulness to informative when the caption states real facts about the item (steps, ingredients, a place with hours or price, a product with price, a tool name, a date), mixed when it has some facts among hashtags, mentions, emojis or hooks, noise when it is only hashtags, mentions, emojis, hooks like "wait for it" or "follow for more", or tags, and none when there is no caption. Copy the informative pieces word for word into useful_parts. Say in a few words what you ignored in ignored_reason. Never treat noise as meaning: hashtags and hooks are not evidence of what the item shows, and a noise caption must not be cited. Describe the item: (10) The user's note is optional and many saves have none; the reading must stand on its own. what_this_is is one short line saying what the item is and what it offers (for example "A 20-minute dal tadka recipe with a garlic tadka"). Never say or guess why the person saved it or what they plan to do. (11) key_points: up to 6 short, crisp points with the substance someone would come back for, each a few words, each with a kind (step, item, place, price, tool, date, fact) and evidence ids. Order steps as given. Only facts from the item; if the item has nothing concrete, return no key points. Read what the person asked: (12) When userNote is present it is the person's own request or intent for this save. Read it first and fill user_ask, and DO what they asked as far as the item allows: the result goes in answer, because answer is what the person gets saved. kind says what they want: full_text for the whole words, transcript or script of what is said; summary; translate; explain; steps; details for specific facts such as a price, name, place, time or link; place_or_product; reminder; remember when the note is only a label or context such as 'for Maa' and asks for nothing. status says whether this save, as you were given it, can provide that: found when the item's own evidence gives all of it, partly when some of it is there, not_in_save when none is. answer holds the deliverable, built only from what you can actually see or hear in the media or read in the caption, with answer_evidence ids. For full_text with media provided, write the complete transcript of everything said, in order, word for word, in the language and script it is spoken in (Hindi in Devanagari), without shortening, merging or summarising, and mark unclear words as [unclear]; cite a quote evidence id with its time. Without media, full_text may only copy the caption's own words, as partly. For summary, explain or translate, always do it when the caption or media has any content to work from (mark found, or partly if only some of it is covered); use not_in_save only when there is nothing to work from. Do it from the same evidence only, in the language the person wrote their note in unless they asked for another. Never write from memory or general knowledge what a person, speech, song or recipe usually says, and never invent what was not in the evidence. missing is one plain sentence saying what is missing and the simplest way to get it. If the ask needs what is said or shown in a video and mediaProvided is false, say the video was not available (only the link and caption were) and that the person can screen-record the Reel and send the video as a file in the DM, or upload it on the site. Never say or imply the video contains something you cannot see or hear, and never invent what the person wants beyond their own words. (13) When userNote asks for something, inferred_possible_intents and suggested_actions must serve that ask; never offer a suggestion about the caption's topic that ignores what the person asked. If the note is only a label, return no suggestions about it.`;

const BBOX_SCHEMA = {
  type: Type.OBJECT,
  nullable: true,
  properties: {
    x: { type: Type.NUMBER },
    y: { type: Type.NUMBER },
    w: { type: Type.NUMBER },
    h: { type: Type.NUMBER },
  },
  required: ['x', 'y', 'w', 'h'],
};

const ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    source_summary: { type: Type.STRING },
    evidence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          kind: { type: Type.STRING },
          ref: { type: Type.STRING },
          t: { type: Type.NUMBER, nullable: true },
          tEnd: { type: Type.NUMBER, nullable: true },
          bbox: BBOX_SCHEMA,
        },
        required: ['id', 'kind', 'ref'],
      },
    },
    observed_objects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          where: { type: Type.STRING },
          bbox: BBOX_SCHEMA,
          confidence: { type: Type.NUMBER },
          evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['label', 'where', 'confidence', 'evidence'],
      },
    },
    visible_text: { type: Type.ARRAY, items: { type: Type.STRING } },
    transcript_summary: { type: Type.STRING },
    inferred_possible_intents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          intent: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['intent', 'confidence', 'evidence'],
      },
    },
    actionable_entities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          name: { type: Type.STRING },
          evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['type', 'name', 'evidence'],
      },
    },
    suggested_actions: { type: Type.ARRAY, items: { type: Type.STRING } },
    purpose: { type: Type.STRING },
    reel_type: { type: Type.STRING, format: 'enum', enum: [...REEL_TYPES] },
    reel_type_confidence: { type: Type.NUMBER },
    reel_type_evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
    type_details: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          field: { type: Type.STRING, format: 'enum', enum: [...TYPE_DETAIL_FIELDS] },
          value: { type: Type.STRING },
          evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['field', 'value', 'evidence'],
        propertyOrdering: ['field', 'value', 'evidence'],
      },
    },
    caption_signal: {
      type: Type.OBJECT,
      properties: {
        usefulness: { type: Type.STRING, format: 'enum', enum: [...CAPTION_USEFULNESS] },
        useful_parts: { type: Type.ARRAY, items: { type: Type.STRING } },
        ignored_reason: { type: Type.STRING },
      },
      required: ['usefulness', 'useful_parts', 'ignored_reason'],
      propertyOrdering: ['usefulness', 'useful_parts', 'ignored_reason'],
    },
    what_this_is: { type: Type.STRING },
    key_points: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, format: 'enum', enum: [...KEY_POINT_KINDS] },
          text: { type: Type.STRING },
          evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['kind', 'text', 'evidence'],
        propertyOrdering: ['kind', 'text', 'evidence'],
      },
    },
    user_ask: {
      type: Type.OBJECT,
      properties: {
        kind: { type: Type.STRING, format: 'enum', enum: [...ASK_KINDS] },
        status: { type: Type.STRING, format: 'enum', enum: [...ASK_STATUSES] },
        answer: { type: Type.STRING },
        answer_evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
        missing: { type: Type.STRING },
      },
      required: ['kind', 'status', 'answer', 'answer_evidence', 'missing'],
      propertyOrdering: ['kind', 'status', 'answer', 'answer_evidence', 'missing'],
    },
    note_grounding: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING },
        evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
        explanation: { type: Type.STRING },
      },
      required: ['status', 'evidence', 'explanation'],
    },
  },
  required: [
    'source_summary',
    'evidence',
    'observed_objects',
    'visible_text',
    'transcript_summary',
    'inferred_possible_intents',
    'actionable_entities',
    'suggested_actions',
    'purpose',
    'note_grounding',
    'reel_type',
    'reel_type_confidence',
    'reel_type_evidence',
    'type_details',
    'caption_signal',
    'what_this_is',
    'key_points',
  ],
  // Evidence first, then what was seen, then the classification that rests on it.
  propertyOrdering: [
    'caption_signal',
    'evidence',
    'source_summary',
    'observed_objects',
    'visible_text',
    'transcript_summary',
    'reel_type',
    'reel_type_confidence',
    'reel_type_evidence',
    'type_details',
    'what_this_is',
    'key_points',
    'user_ask',
    'actionable_entities',
    'inferred_possible_intents',
    'suggested_actions',
    'purpose',
    'note_grounding',
  ],
};

function detectNoteLanguage(note: string | null): 'hindi' | 'hinglish' | 'english' | 'none' {
  if (!note) return 'none';
  if (/[\u0900-\u097F]/.test(note)) return 'hindi';
  if (/\b(hai|hain|ko|ke|ki|ka|wala|wali|se|subah|raat|banana|jaana|pichle|mahine)\b/i.test(note)) {
    return 'hinglish';
  }
  return 'english';
}

/** DM notes other than the one shown as `note`, exactly as sent. */
export function laterDmNotes(memory: Memory): string[] {
  return (memory.dmNotes ?? [])
    .filter((n) => n.deliveryId !== memory.dm?.primaryNoteId)
    .map((n) => n.text);
}

export function buildEmbeddingText(memory: Memory): string {
  const observedLabels =
    memory.analysis?.observed_objects.map((o) => o.label).join(', ') || '';
  const summary = memory.analysis?.source_summary || '';
  return [
    memory.title || '',
    memory.caption || '',
    summary,
    observedLabels,
    memory.note ? `YOUR WORDS: ${memory.note}` : '',
    ...laterDmNotes(memory).map((n) => `YOUR WORDS: ${n}`),
  ]
    .filter((s) => s.trim().length > 0)
    .join(' | ');
}

export interface GeminiService {
  analyzeMemory(memory: Memory): Promise<MemoryAnalysis | null>;
  embedText(text: string): Promise<number[] | null>;
  rewriteSearchQuery(q: string): Promise<SearchQueryUnderstanding>;
  suggestCategory(
    memory: Memory,
    existingCategories: Category[]
  ): Promise<{ categoryName: string; why: string } | null>;
  buildOutcome(
    outcomeType: OutcomeType,
    projectName: string,
    projectDescription: string,
    memories: Memory[]
  ): Promise<OutcomeSection[]>;
}

/** The part of the @google/genai client this service uses; injectable so tests can capture the request. */
export type GenAiClient = Pick<GoogleGenAI, 'models'>;

export class VertexGeminiService implements GeminiService {
  private ai: GenAiClient | null = null;

  constructor(options?: { client?: GenAiClient }) {
    this.ai = options?.client ?? null;
  }

  private getClient(): GenAiClient | null {
    if (this.ai) return this.ai;
    if (!config.project) return null;
    if (!this.ai) {
      this.ai = new GoogleGenAI({
        vertexai: true,
        project: config.project,
        location: config.location,
      });
    }
    return this.ai;
  }

  async analyzeMemory(memory: Memory): Promise<MemoryAnalysis | null> {
    if (memory.privateNoAI) return null;
    if (memory.ingest === 'unsupported') {
      return guardAnalysis({}, { ingest: 'unsupported', note: memory.note });
    }

    const client = this.getClient();
    if (!client) return null;

    const parts: Array<
      | { fileData: { fileUri: string; mimeType: string } }
      | { text: string }
    > = [];

    if (
      memory.ingest === 'full_media' &&
      memory.media?.gcsPath &&
      memory.media.gcsPath.startsWith('gs://')
    ) {
      parts.push({
        fileData: {
          fileUri: memory.media.gcsPath,
          mimeType: memory.media.mime,
        },
      });
    }

    parts.push({
      text: JSON.stringify({
        url: memory.url,
        caption: memory.caption,
        ingest: memory.ingest,
        mediaProvided: memory.ingest === 'full_media',
        userNote: memory.note,
        laterUserNotes: laterDmNotes(memory),
        userChip: memory.chip,
        noteLanguage: detectNoteLanguage(memory.note),
      }),
    });

    const response = await client.models.generateContent({
      model: config.analysisModel,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 512 },
        // A full transcript or recipe is long; leave room for it.
        maxOutputTokens: 32000,
      },
    });

    const text = response.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as unknown;
    return guardAnalysis(parsed, { ingest: memory.ingest, note: memory.note, caption: memory.caption ?? null });
  }

  async embedText(text: string): Promise<number[] | null> {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const client = this.getClient();
    if (!client) return null;

    const response = await client.models.embedContent({
      model: config.embeddingModel,
      contents: trimmed,
      config: {
        outputDimensionality: config.embeddingDims,
      },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values || values.length === 0) return null;
    return values;
  }

  async rewriteSearchQuery(q: string): Promise<SearchQueryUnderstanding> {
    const fallback: SearchQueryUnderstanding = {
      english: q,
      hindi: q,
      hinglish: q,
      keywords: q
        .toLowerCase()
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1),
      timeHint: null,
    };

    const client = this.getClient();
    if (!client) return fallback;

    try {
      const response = await client.models.generateContent({
        model: config.analysisModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Rewrite this personal memory search query (which may be English, Hindi, or Hinglish) into JSON with keys: english, hindi, hinglish, keywords (array of lowercase search terms), timeHint ("last_week" | "last_month" | null). Query: ${JSON.stringify(q)}`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              english: { type: Type.STRING },
              hindi: { type: Type.STRING },
              hinglish: { type: Type.STRING },
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              timeHint: { type: Type.STRING, nullable: true },
            },
            required: ['english', 'hindi', 'hinglish', 'keywords', 'timeHint'],
          },
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const parsed = JSON.parse(response.text || '{}') as Partial<SearchQueryUnderstanding>;
      return {
        english: parsed.english || q,
        hindi: parsed.hindi || q,
        hinglish: parsed.hinglish || q,
        keywords: Array.isArray(parsed.keywords) && parsed.keywords.length > 0 ? parsed.keywords : fallback.keywords,
        timeHint:
          parsed.timeHint === 'last_week' || parsed.timeHint === 'last_month'
            ? parsed.timeHint
            : null,
      };
    } catch {
      return fallback;
    }
  }

  async suggestCategory(
    memory: Memory,
    existingCategories: Category[]
  ): Promise<{ categoryName: string; why: string } | null> {
    if (memory.privateNoAI) return null;
    const client = this.getClient();
    if (!client) return null;

    try {
      const response = await client.models.generateContent({
        model: config.analysisModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: JSON.stringify({
                  existingCategories: existingCategories.map((c) => c.name),
                  title: memory.title,
                  caption: memory.caption,
                  note: memory.note,
                  summary: memory.analysis?.source_summary ?? '',
                }),
              },
            ],
          },
        ],
        config: {
          systemInstruction:
            'Pick the best matching existing category name or suggest a short 2-3 word category name, plus a one-line "why" citing the note or caption.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              categoryName: { type: Type.STRING },
              why: { type: Type.STRING },
            },
            required: ['categoryName', 'why'],
          },
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const parsed = JSON.parse(response.text || '{}') as { categoryName?: string; why?: string };
      if (!parsed.categoryName) return null;
      return {
        categoryName: parsed.categoryName,
        why: parsed.why || 'Matched from your saved text.',
      };
    } catch {
      return null;
    }
  }

  async buildOutcome(
    outcomeType: OutcomeType,
    projectName: string,
    projectDescription: string,
    memories: Memory[]
  ): Promise<OutcomeSection[]> {
    const validIds = new Set(memories.map((m) => m.id));
    const client = this.getClient();

    const sectionTitles =
      outcomeType === 'itinerary'
        ? ['Morning', 'Breakfast', 'Before sunset']
        : ['Hook', 'Shots', 'Caption structure', 'References'];

    const fallback = (): OutcomeSection[] =>
      sectionTitles.map((title, idx) => {
        const m = memories[idx % Math.max(1, memories.length)];
        return {
          title,
          lines: m
            ? [
                {
                  text: m.note || m.caption || m.title,
                  sourceMemoryId: m.id,
                  sourceField: m.note ? 'note' : m.caption ? 'caption' : 'ai_reading',
                },
              ]
            : [],
        };
      });

    if (!client || memories.length === 0) return fallback();

    try {
      const payload = memories.map((m) => ({
        id: m.id,
        title: m.title,
        note: m.note,
        caption: m.caption,
        aiSummary: m.analysis?.source_summary ?? null,
        observed: m.analysis?.observed_objects.map((o) => o.label) ?? [],
      }));

      const response = await client.models.generateContent({
        model: config.analysisModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: JSON.stringify({
                  outcomeType,
                  projectName,
                  projectDescription,
                  requiredSections: sectionTitles,
                  memories: payload,
                }),
              },
            ],
          },
        ],
        config: {
          systemInstruction:
            'Build a draft outcome strictly from the provided project memories. Every line MUST cite a sourceMemoryId from the input and sourceField ("note" | "caption" | "ai_reading"). Never look anything up, and never invent prices, opening hours, distances, or place names.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    lines: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          text: { type: Type.STRING },
                          sourceMemoryId: { type: Type.STRING },
                          sourceField: { type: Type.STRING },
                        },
                        required: ['text', 'sourceMemoryId', 'sourceField'],
                      },
                    },
                  },
                  required: ['title', 'lines'],
                },
              },
            },
            required: ['sections'],
          },
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 256 },
        },
      });

      const parsed = JSON.parse(response.text || '{}') as { sections?: OutcomeSection[] };
      if (!Array.isArray(parsed.sections)) return fallback();

      // Drop any line whose sourceMemoryId is not in the project
      return parsed.sections.map((sec) => ({
        title: sec.title || 'Section',
        lines: (Array.isArray(sec.lines) ? sec.lines : [])
          .filter((l) => validIds.has(l.sourceMemoryId))
          .map((l) => ({
            text: l.text,
            sourceMemoryId: l.sourceMemoryId,
            sourceField:
              l.sourceField === 'note' || l.sourceField === 'caption' || l.sourceField === 'ai_reading'
                ? l.sourceField
                : 'ai_reading',
          })),
      }));
    } catch {
      return fallback();
    }
  }
}
