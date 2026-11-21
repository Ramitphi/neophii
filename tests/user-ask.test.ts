// The reading follows what the person ASKED in their note, and never claims more than the save contains.
import { describe, expect, it } from 'vitest';
import { guardAnalysis } from '../server/guard.js';
import { asksSomething } from '../src/lib/ask.js';

const CAPTION = 'Happy Diwali to all of you. May Shri Ram protect the ones protecting the country and their families';
const NOTE = 'I want the entire speech by Modi in hindi to get saved.';

const baseRaw = (ask: unknown) => ({
  source_summary: 'A Diwali greeting',
  evidence: [{ id: 'c1', kind: 'caption', ref: 'caption: Happy Diwali' }],
  observed_objects: [],
  visible_text: [],
  transcript_summary: '',
  inferred_possible_intents: [],
  actionable_entities: [],
  suggested_actions: [],
  purpose: 'other',
  note_grounding: { status: 'not_sure', evidence: [], explanation: '' },
  caption_signal: { usefulness: 'informative', useful_parts: [CAPTION], ignored_reason: '' },
  user_ask: ask,
});

const run = (ask: unknown, note: string | null = NOTE, ingest: 'link_metadata' | 'full_media' = 'link_metadata') =>
  guardAnalysis(baseRaw(ask), { ingest, note, caption: CAPTION });

describe('user_ask in the guard', () => {
  it('keeps the person\'s own words exactly, whatever the model says they were', () => {
    const a = run({ kind: 'full_text', status: 'not_in_save', answer: '', answer_evidence: [], missing: 'Send the video as a file.' });
    expect(a.user_ask?.asked).toBe(NOTE);
    expect(a.user_ask).toMatchObject({ kind: 'full_text', status: 'not_in_save', missing: 'Send the video as a file.' });
  });

  it('there is no ask when there is no note', () => {
    expect(run({ kind: 'full_text', status: 'found', answer: 'x', answer_evidence: ['c1'], missing: '' }, null).user_ask).toBeUndefined();
  });

  it('says found or partly only with an answer that cites evidence that survived', () => {
    const noEvidence = run({ kind: 'details', status: 'found', answer: 'It is 250 g paneer', answer_evidence: ['nope'], missing: '' });
    expect(noEvidence.user_ask).toMatchObject({ status: 'not_in_save', answer: '', answer_evidence: [] });
    const noAnswer = run({ kind: 'details', status: 'partly', answer: '', answer_evidence: ['c1'], missing: '' });
    expect(noAnswer.user_ask?.status).toBe('not_in_save');
    const good = run({ kind: 'details', status: 'partly', answer: 'The caption wishes Happy Diwali', answer_evidence: ['c1'], missing: 'No speech text.' });
    expect(good.user_ask).toMatchObject({ status: 'partly', answer_evidence: ['c1'] });
  });

  it('always explains what is missing when the save cannot answer', () => {
    const a = run({ kind: 'full_text', status: 'not_in_save', answer: '', answer_evidence: [], missing: '' });
    expect(a.user_ask?.missing).toMatch(/video/i);
    const read = run({ kind: 'full_text', status: 'not_in_save', answer: '', answer_evidence: [], missing: '' }, NOTE, 'link_metadata');
    expect(read.user_ask?.missing.length).toBeGreaterThan(0);
  });

  it('a label or a reminder asks nothing of the content, so nothing is marked missing', () => {
    for (const kind of ['remember', 'reminder']) {
      const a = run({ kind, status: 'not_in_save', answer: '', answer_evidence: [], missing: 'something' }, 'for Maa');
      expect(a.user_ask).toMatchObject({ kind, status: 'found', missing: '' });
      expect(asksSomething(a.user_ask)).toBe(false);
    }
    expect(asksSomething(run({ kind: 'full_text', status: 'not_in_save', answer: '', answer_evidence: [], missing: 'x' }).user_ask)).toBe(true);
  });

  it('survives junk from the model', () => {
    for (const junk of [null, 'text', 5, [], { kind: 42, status: {}, answer: [], answer_evidence: 'c1', missing: null }]) {
      const a = run(junk);
      expect(a.user_ask?.asked).toBe(NOTE);
      expect(a.user_ask?.status).toBe('not_in_save');
    }
  });
});

describe('long deliverables', () => {
  it('keeps a whole transcript, not a 160-character line', () => {
    const speech = 'भाइयो और बहनो, '.repeat(400);
    const a = run({ kind: 'full_text', status: 'found', answer: speech, answer_evidence: ['c1'], missing: '' }, NOTE, 'full_media');
    expect(a.user_ask?.answer.length).toBeGreaterThan(3000);
    expect(a.user_ask?.status).toBe('found');
  });

  it('a long answer may address "you" without being mistaken for a guess at the reason', () => {
    const text = 'Friends, I know you want to save this. '.repeat(20);
    const a = run({ kind: 'full_text', status: 'found', answer: text, answer_evidence: ['c1'], missing: '' }, NOTE, 'full_media');
    expect(a.user_ask?.answer).not.toBe('');
  });

  it('knows the new kinds and treats junk kinds as other', () => {
    for (const kind of ['summary', 'translate', 'explain']) {
      expect(run({ kind, status: 'not_in_save', answer: '', answer_evidence: [], missing: 'x' }).user_ask?.kind).toBe(kind);
    }
    expect(run({ kind: 'whatever', status: 'not_in_save', answer: '', answer_evidence: [], missing: '' }).user_ask?.kind).toBe('other');
  });
});
