import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/index.js';
import type { GeminiService } from '../server/gemini.js';
import { guardAnalysis, normalizeUserNote } from '../server/guard.js';
import { InMemoryMediaStorage } from '../server/storage.js';
import { InMemoryStore } from '../server/store.js';

describe('guardAnalysis & note immutability', () => {
  it('keeps Hindi and Hinglish notes byte-for-byte and turns whitespace-only into null', () => {
    const hindi = 'बालकनी के लिए';
    const hinglish = '  Sunday ko banana hai,   kasuri methi wala step  ';
    expect(normalizeUserNote(hindi)).toBe(hindi);
    expect(normalizeUserNote(hinglish)).toBe(hinglish);
    expect(normalizeUserNote('   \n\t  ')).toBeNull();
    expect(normalizeUserNote('')).toBeNull();
    expect(normalizeUserNote(null)).toBeNull();
  });

  it('discards any model-supplied user reason and tags all intents as AI suggestion', () => {
    const guarded = guardAnalysis(
      {
        user_reason: 'Model invented reason',
        explicit_user_intent: 'Model invented intent',
        source_summary: 'A short clip',
        evidence: [{ id: 'ev1', kind: 'frame', ref: '00:07', t: 7, tEnd: 12 }],
        observed_objects: [
          {
            label: 'Red shirt',
            where: 'Center',
            bbox: { x: -10, y: 20, w: 150, h: 40 },
            confidence: 1.4,
            evidence: ['ev1'],
          },
        ],
        visible_text: [],
        transcript_summary: '',
        inferred_possible_intents: [
          {
            intent: 'Buy red shirt',
            confidence: 0.8,
            evidence: ['ev1'],
            origin: 'you',
            label: 'User fact',
          },
        ],
        actionable_entities: [{ type: 'unknown_type', name: 'Shirt', evidence: ['ev1'] }],
        suggested_actions: ['set_reminder', 'invented_action'],
        purpose: 'not_a_purpose',
        note_grounding: { status: 'grounded', evidence: ['ev1'], explanation: 'Matches frame' },
      },
      { ingest: 'full_media', note: 'the red shirt' }
    );

    expect((guarded as unknown as Record<string, unknown>).user_reason).toBeUndefined();
    expect((guarded as unknown as Record<string, unknown>).explicit_user_intent).toBeUndefined();
    expect(guarded.inferred_possible_intents[0].origin).toBe('ai');
    expect(guarded.inferred_possible_intents[0].label).toBe('AI suggestion');
    expect(guarded.observed_objects[0].confidence).toBe(1);
    expect(guarded.observed_objects[0].bbox).toEqual({ x: 0, y: 20, w: 100, h: 40 });
    expect(guarded.actionable_entities[0].type).toBe('other');
    expect(guarded.suggested_actions).toEqual(['set_reminder']);
    expect(guarded.purpose).toBe('other');
  });

  it('marks dangling evidence ids and low confidence (<0.45) as uncertain', () => {
    const guarded = guardAnalysis(
      {
        source_summary: 'Summary',
        evidence: [
          { id: 'ev1', kind: 'caption', ref: 'caption text' },
          { id: 'ev1', kind: 'caption', ref: 'duplicate id' },
          { id: 'ev2', kind: 'invalid_kind', ref: 'bad kind' },
        ],
        observed_objects: [
          { label: 'Dangling', where: 'x', bbox: null, confidence: 0.9, evidence: ['missing'] },
          { label: 'LowConf', where: 'y', bbox: null, confidence: 0.44, evidence: ['ev1'] },
        ],
        visible_text: [],
        transcript_summary: '',
        inferred_possible_intents: [],
        actionable_entities: [],
        suggested_actions: [],
        purpose: 'learn',
        note_grounding: { status: 'grounded', evidence: ['missing'], explanation: 'Claimed' },
      },
      { ingest: 'link_metadata', note: 'test note' }
    );

    expect(guarded.evidence).toHaveLength(1);
    expect(guarded.observed_objects[0].uncertain).toBe(true);
    expect(guarded.observed_objects[0].evidence).toEqual([]);
    expect(guarded.observed_objects[1].uncertain).toBe(true);
    expect(guarded.note_grounding.status).toBe('not_sure');
  });

  it('drops invented frame/quote evidence on link_metadata', () => {
    const guarded = guardAnalysis(
      {
        source_summary: 'Caption only',
        evidence: [
          { id: 'ev1', kind: 'frame', ref: '00:05', t: 5 },
          { id: 'ev2', kind: 'caption', ref: 'caption: paneer' },
        ],
        observed_objects: [
          { label: 'Invented visual', where: 'frame', bbox: null, confidence: 0.9, evidence: ['ev1'] },
          { label: 'Paneer', where: 'caption', bbox: null, confidence: 0.9, evidence: ['ev2'] },
        ],
        visible_text: ['OCR should be dropped'],
        transcript_summary: 'Transcript should be dropped',
        inferred_possible_intents: [],
        actionable_entities: [],
        suggested_actions: [],
        purpose: 'food',
        note_grounding: { status: 'grounded', evidence: ['ev2'], explanation: 'Matches caption' },
      },
      { ingest: 'link_metadata', note: 'paneer' }
    );

    expect(guarded.evidence).toHaveLength(1);
    expect(guarded.evidence[0].kind).toBe('caption');
    expect(guarded.observed_objects).toHaveLength(1);
    expect(guarded.observed_objects[0].label).toBe('Paneer');
    expect(guarded.visible_text).toEqual([]);
    expect(guarded.transcript_summary).toBe('');
  });

  it('keeps nothing about the source on unsupported and sets not_attempted with note', () => {
    const withNote = guardAnalysis(
      { source_summary: 'Should not appear', evidence: [{ id: 'ev1', kind: 'caption', ref: 'x' }] },
      { ingest: 'unsupported', note: 'caption idea' }
    );
    expect(withNote.source_summary).toBe('');
    expect(withNote.evidence).toEqual([]);
    expect(withNote.note_grounding.status).toBe('not_attempted');
    expect(withNote.note_grounding.explanation).toBe(
      'The source could not be read, so your note was not matched against it.'
    );

    const noNote = guardAnalysis({}, { ingest: 'unsupported', note: null });
    expect(noNote.note_grounding.status).toBe('no_note');
  });

  it('stores Hindi and Hinglish notes byte-identical end-to-end via API', async () => {
    const store = new InMemoryStore();
    const storage = new InMemoryMediaStorage();
    const mockGemini: GeminiService = {
      analyzeMemory: vi.fn(async () => null),
      embedText: vi.fn(async () => null),
      rewriteSearchQuery: vi.fn(async (q) => ({
        english: q,
        hindi: q,
        hinglish: q,
        keywords: [],
        timeHint: null,
      })),
      suggestCategory: vi.fn(async () => null),
      buildOutcome: vi.fn(async () => []),
    };

    const app = createApp({
      store,
      storage,
      gemini: mockGemini,
      authVerifier: async (t) => t,
    });

    const exactHindi = 'बालकनी के लिए';
    const res = await request(app)
      .post('/api/memories')
      .set('Authorization', 'Bearer user-1')
      .send({
        url: 'https://instagram.com/p/123',
        caption: 'Plant shelf',
        note: exactHindi,
      });

    expect(res.status).toBe(201);
    expect(res.body.note).toBe(exactHindi);

    const fetched = await request(app)
      .get(`/api/memories/${res.body.id}`)
      .set('Authorization', 'Bearer user-1');
    expect(fetched.status).toBe(200);
    expect(fetched.body.note).toBe(exactHindi);
  });
});
