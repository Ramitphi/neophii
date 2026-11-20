import { GoogleGenAI, Type } from '@google/genai';
import type {
  Category,
  Memory,
  MemoryAnalysis,
  OutcomeSection,
  OutcomeType,
  SearchQueryUnderstanding,
} from '../src/types/neophi.js';
import { config } from './config.js';
import { guardAnalysis } from './guard.js';

export const ANALYSIS_SYSTEM_INSTRUCTION =
  "You read one saved item for a personal memory app. Return only JSON in the given schema. Rules: (1) Never write the user's reason; the user's note is given separately and is handled by code. (2) Every observation, suggestion and entity must cite an evidence id from your evidence list; if you cannot, leave evidence empty. (3) Only describe what you can actually see or hear in the media provided. If no media is provided, describe only the caption text; never guess what a video shows. (4) A fact that appears only in the user's note must not cite media or caption evidence. (5) Suggestions are possibilities with a confidence from 0 to 1, not facts. (6) Evidence for video uses seconds (t, tEnd); for images use a region in percent (bbox x, y, w, h).";

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

export class VertexGeminiService implements GeminiService {
  private ai: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI | null {
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
        userNote: memory.note,
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
      },
    });

    const text = response.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as unknown;
    return guardAnalysis(parsed, { ingest: memory.ingest, note: memory.note });
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
