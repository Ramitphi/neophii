import { describe, expect, it, vi } from 'vitest';
import { ANALYSIS_SYSTEM_INSTRUCTION, VertexGeminiService } from '../server/gemini.js';
import { guardAnalysis, MAX_KEY_POINTS } from '../server/guard.js';
import { CAPTION_USEFULNESS, KEY_POINT_KINDS, type Memory } from '../src/types/neophi.js';
import { aiLine } from '../src/lib/aiLine.js';

const ev = [
  { id: 'c1', kind: 'caption', ref: 'caption' },
  { id: 'f1', kind: 'frame', ref: '00:02', t: 2 },
];

describe('caption signal', () => {
  it('keeps only useful parts that are really in the caption', () => {
    const caption = 'Dal tadka in 20 min 🍲 Toor dal, ghee, jeera. #food #reels';
    const g = guardAnalysis(
      {
        evidence: ev,
        caption_signal: {
          usefulness: 'mixed',
          useful_parts: ['Toor dal, ghee, jeera', 'Dal  tadka in 20 MIN', 'add 2 tomatoes', 'Toor dal, ghee, jeera'],
          ignored_reason: 'hashtags',
        },
      },
      { ingest: 'link_metadata', note: null, caption }
    );
    expect(g.caption_signal).toEqual({
      usefulness: 'mixed',
      useful_parts: ['Toor dal, ghee, jeera', 'Dal  tadka in 20 MIN'],
      ignored_reason: 'hashtags',
    });
  });

  it('never cites a noise caption: details and points that rest on it are dropped', () => {
    const g = guardAnalysis(
      {
        evidence: ev,
        caption_signal: { usefulness: 'noise', useful_parts: ['#viral'], ignored_reason: 'only hashtags and a hook' },
        reel_type: 'humour_meme',
        reel_type_confidence: 0.9,
        reel_type_evidence: ['c1'],
        type_details: [{ field: 'topic', value: 'viral', evidence: ['c1'] }],
        key_points: [{ kind: 'fact', text: 'It is viral', evidence: ['c1'] }],
      },
      { ingest: 'link_metadata', note: null, caption: 'wait for it 😂 #viral #fyp @someone' }
    );
    expect(g.caption_signal?.usefulness).toBe('noise');
    expect(g.caption_signal?.useful_parts).toEqual([]);
    expect(g.evidence.map((e) => e.id)).not.toContain('c1');
    expect(g.reel_type_uncertain).toBe(true);
    expect(g.type_details).toEqual([]);
    expect(g.key_points).toEqual([]);
  });

  it('says none when there is no caption, and treats a missing signal as mixed', () => {
    const none = guardAnalysis({ evidence: ev }, { ingest: 'full_media', note: null, caption: null });
    expect(none.caption_signal?.usefulness).toBe('none');
    const missing = guardAnalysis(
      { evidence: ev, key_points: [{ kind: 'step', text: 'Pressure cook 3 whistles', evidence: ['c1'] }] },
      { ingest: 'link_metadata', note: null, caption: 'Pressure cook 3 whistles' }
    );
    expect(missing.caption_signal?.usefulness).toBe('mixed');
    expect(missing.key_points).toHaveLength(1);
  });
});

describe('what this is and key points', () => {
  it('drops a line that guesses why the person saved it', () => {
    const ok = guardAnalysis(
      { evidence: ev, what_this_is: 'A 20-minute dal tadka recipe' },
      { ingest: 'full_media', note: null, caption: 'dal' }
    );
    expect(ok.what_this_is).toBe('A 20-minute dal tadka recipe');
    const guess = guardAnalysis(
      { evidence: ev, what_this_is: 'You saved this because you want to cook on Sunday' },
      { ingest: 'full_media', note: null, caption: 'dal' }
    );
    expect(guess.what_this_is).toBe('');
  });

  it('keeps points with evidence, fixes unknown kinds, drops repeats, caps at the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ kind: 'step', text: `Step ${i}`, evidence: ['f1'] }));
    const g = guardAnalysis(
      {
        evidence: ev,
        key_points: [
          { kind: 'price', text: '₹180 coffee', evidence: [] },
          { kind: 'vibe', text: 'Garden courtyard', evidence: ['f1'] },
          { kind: 'place', text: 'garden courtyard', evidence: ['f1'] },
          { kind: 'step', text: 'They plan to visit because they want coffee', evidence: ['f1'] },
          ...many,
        ],
      },
      { ingest: 'full_media', note: null, caption: 'cafe' }
    );
    const points = g.key_points ?? [];
    expect(points[0]).toEqual({ kind: 'fact', text: 'Garden courtyard', evidence: ['f1'] });
    expect(points.some((p) => p.text.includes('₹180'))).toBe(false);
    expect(points.some((p) => p.text.startsWith('They plan'))).toBe(false);
    expect(points).toHaveLength(MAX_KEY_POINTS);
  });

  it('keeps nothing for an unreadable source', () => {
    const g = guardAnalysis(
      { what_this_is: 'A recipe', key_points: [{ kind: 'step', text: 'x', evidence: ['c1'] }] },
      { ingest: 'unsupported', note: null, caption: 'x' }
    );
    expect(g.what_this_is).toBe('');
    expect(g.key_points).toEqual([]);
    expect(g.caption_signal?.usefulness).toBe('none');
  });

  it('gives a short AI line for saves without a note: what it is, else the first point', () => {
    expect(aiLine(null)).toBeNull();
    expect(aiLine({ what_this_is: 'A plank routine', key_points: [] } as never)).toBe('A plank routine');
    expect(aiLine({ what_this_is: '', key_points: [{ kind: 'step', text: 'Plank 45s', evidence: ['c1'] }] } as never)).toBe(
      'Plank 45s'
    );
  });

  it('asks the model for the signal and points, with the note optional and no reason guessing', async () => {
    expect(ANALYSIS_SYSTEM_INSTRUCTION).toContain('Never say or guess why the person saved it');
    expect(ANALYSIS_SYSTEM_INSTRUCTION).toContain('Never treat noise as meaning');
    let captured: { config?: { responseSchema?: Record<string, unknown> } } = {};
    const client = {
      models: {
        generateContent: vi.fn(async (req: typeof captured) => {
          captured = req;
          return {
            text: JSON.stringify({
              evidence: [{ id: 'c1', kind: 'caption', ref: 'caption' }],
              caption_signal: { usefulness: 'informative', useful_parts: ['plank 45s'], ignored_reason: '' },
              what_this_is: 'A short core workout',
              key_points: [{ kind: 'step', text: 'Plank 45s', evidence: ['c1'] }],
            }),
          };
        }),
      },
    };
    const gemini = new VertexGeminiService({ client: client as never });
    const memory = { id: 'm', url: 'u', caption: 'Core: plank 45s, 3 rounds', note: null, ingest: 'link_metadata' } as unknown as Memory;
    const result = await gemini.analyzeMemory(memory);
    const schema = captured.config?.responseSchema as {
      properties: Record<string, { properties?: Record<string, { enum?: string[] }>; items?: { properties: Record<string, { enum?: string[] }> } }>;
    };
    expect(schema.properties.caption_signal.properties?.usefulness.enum).toEqual([...CAPTION_USEFULNESS]);
    expect(schema.properties.key_points.items?.properties.kind.enum).toEqual([...KEY_POINT_KINDS]);
    expect(result?.caption_signal?.useful_parts).toEqual(['plank 45s']);
    expect(result?.key_points).toEqual([{ kind: 'step', text: 'Plank 45s', evidence: ['c1'] }]);
    expect(aiLine(result)).toBe('A short core workout');
  });
});
