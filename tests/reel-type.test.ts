import { describe, expect, it, vi } from 'vitest';
import { ANALYSIS_SYSTEM_INSTRUCTION, REEL_TYPE_RUBRIC, VertexGeminiService } from '../server/gemini.js';
import { guardAnalysis, MAX_TYPE_DETAILS } from '../server/guard.js';
import { REEL_TYPES, type Memory } from '../src/types/neophi.js';

const captionEvidence = [
  { id: 'c1', kind: 'caption', ref: 'caption line 1' },
  { id: 'f1', kind: 'frame', ref: '00:03', t: 3 },
];

describe('Reel type and type details', () => {
  it('keeps a listed type with evidence and enough confidence', () => {
    const g = guardAnalysis(
      {
        evidence: captionEvidence,
        reel_type: 'recipe',
        reel_type_confidence: 0.9,
        reel_type_evidence: ['c1'],
      },
      { ingest: 'full_media', note: null }
    );
    expect(g.reel_type).toBe('recipe');
    expect(g.reel_type_confidence).toBe(0.9);
    expect(g.reel_type_evidence).toEqual(['c1']);
    expect(g.reel_type_uncertain).toBe(false);
  });

  it('turns an unknown type into personal_other and marks low confidence or no evidence as uncertain', () => {
    const unknown = guardAnalysis(
      { evidence: captionEvidence, reel_type: 'cooking', reel_type_confidence: 0.9, reel_type_evidence: ['c1'] },
      { ingest: 'full_media', note: null }
    );
    expect(unknown.reel_type).toBe('personal_other');

    const low = guardAnalysis(
      { evidence: captionEvidence, reel_type: 'fitness', reel_type_confidence: 0.3, reel_type_evidence: ['c1'] },
      { ingest: 'full_media', note: null }
    );
    expect(low.reel_type).toBe('fitness');
    expect(low.reel_type_uncertain).toBe(true);

    const dangling = guardAnalysis(
      { evidence: captionEvidence, reel_type: 'fitness', reel_type_confidence: 0.95, reel_type_evidence: ['nope'] },
      { ingest: 'full_media', note: null }
    );
    expect(dangling.reel_type_evidence).toEqual([]);
    expect(dangling.reel_type_uncertain).toBe(true);
  });

  it('drops details with no evidence, an unknown field, or a repeat, and caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ field: 'ingredient', value: `item ${i}`, evidence: ['c1'] }));
    const g = guardAnalysis(
      {
        evidence: captionEvidence,
        reel_type: 'recipe',
        reel_type_confidence: 0.8,
        reel_type_evidence: ['c1'],
        type_details: [
          { field: 'price', value: '₹250', evidence: [] },
          { field: 'calories', value: '300', evidence: ['c1'] },
          { field: 'dish', value: 'Paneer tikka', evidence: ['c1'] },
          { field: 'dish', value: 'paneer tikka', evidence: ['c1'] },
          { field: 'step', value: '   ', evidence: ['c1'] },
          ...many,
        ],
      },
      { ingest: 'full_media', note: null }
    );
    const details = g.type_details ?? [];
    expect(details[0]).toEqual({ field: 'dish', value: 'Paneer tikka', evidence: ['c1'] });
    expect(details.some((d) => d.field === ('calories' as never))).toBe(false);
    expect(details.some((d) => d.field === 'price')).toBe(false);
    expect(details.filter((d) => d.value.toLowerCase() === 'paneer tikka')).toHaveLength(1);
    expect(details).toHaveLength(MAX_TYPE_DETAILS);
  });

  it('on a caption-only save, drops details and type evidence that rest only on frames', () => {
    const g = guardAnalysis(
      {
        evidence: captionEvidence,
        reel_type: 'travel_place',
        reel_type_confidence: 0.9,
        reel_type_evidence: ['f1'],
        type_details: [
          { field: 'hours', value: '9 to 5', evidence: ['f1'] },
          { field: 'place', value: 'Fort Kochi', evidence: ['c1'] },
        ],
      },
      { ingest: 'link_metadata', note: null }
    );
    expect(g.reel_type_evidence).toEqual([]);
    expect(g.reel_type_uncertain).toBe(true);
    expect(g.type_details).toEqual([{ field: 'place', value: 'Fort Kochi', evidence: ['c1'] }]);
  });

  it('keeps nothing about an unreadable source', () => {
    const g = guardAnalysis(
      { reel_type: 'recipe', reel_type_confidence: 1, type_details: [{ field: 'dish', value: 'x', evidence: ['c1'] }] },
      { ingest: 'unsupported', note: 'for Sunday' }
    );
    expect(g.reel_type).toBe('personal_other');
    expect(g.reel_type_uncertain).toBe(true);
    expect(g.type_details).toEqual([]);
  });

  it('asks the model for every listed type as an enum and lists each in the instructions', async () => {
    expect(Object.keys(REEL_TYPE_RUBRIC).sort()).toEqual([...REEL_TYPES].sort());
    for (const type of REEL_TYPES) expect(ANALYSIS_SYSTEM_INSTRUCTION).toContain(`${type} = `);
    expect(ANALYSIS_SYSTEM_INSTRUCTION).toContain("Never write the user's reason");

    let captured: { config?: { responseSchema?: Record<string, unknown>; systemInstruction?: string } } = {};
    const client = {
      models: {
        generateContent: vi.fn(async (req: typeof captured) => {
          captured = req;
          return {
            text: JSON.stringify({
              evidence: [{ id: 'c1', kind: 'caption', ref: 'caption' }],
              reel_type: 'fitness',
              reel_type_confidence: 0.8,
              reel_type_evidence: ['c1'],
              type_details: [{ field: 'exercise', value: 'Plank', evidence: ['c1'] }],
            }),
          };
        }),
      },
    };
    const gemini = new VertexGeminiService({ client: client as never });
    const memory = {
      id: 'm1',
      url: 'https://www.instagram.com/reel/x/',
      caption: '30-second plank, 3 rounds',
      note: 'core routine',
      ingest: 'link_metadata',
    } as unknown as Memory;
    const result = await gemini.analyzeMemory(memory);

    const schema = captured.config?.responseSchema as {
      properties: Record<string, { enum?: string[] }>;
      required: string[];
      propertyOrdering: string[];
    };
    expect(schema.properties.reel_type.enum).toEqual([...REEL_TYPES]);
    expect(schema.required).toContain('reel_type');
    expect(schema.propertyOrdering.indexOf('evidence')).toBeLessThan(schema.propertyOrdering.indexOf('reel_type'));
    expect(result?.reel_type).toBe('fitness');
    expect(result?.type_details).toEqual([{ field: 'exercise', value: 'Plank', evidence: ['c1'] }]);
  });
});
