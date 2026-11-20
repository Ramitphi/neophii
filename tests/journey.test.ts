import { describe, expect, it } from 'vitest';
import { buildJourney, expandableIds, NEW_WINDOW_MS, type JourneyLabels } from '../src/lib/journey.js';
import type { Category, Memory } from '../src/types/neophi.js';

const NOW = Date.UTC(2026, 10, 21, 3, 0, 0);
const labels: JourneyLabels = {
  purposes: { shop: 'Shopping', learn: 'Learning', create: 'Making', travel: 'Places', food: 'Food', try_later: 'To try', other: 'Other' },
  unsorted: 'Not sorted yet',
  month: (k) => `M ${k}`,
};

let n = 0;
function mem(o: Partial<Memory> & { entities?: string[]; purpose?: Memory['analysis'] extends infer A ? (A extends { purpose: infer P } ? P : never) : never }): Memory {
  const id = o.id ?? `m${++n}`;
  const { entities, purpose, ...rest } = o;
  return {
    id,
    createdAt: new Date(NOW - 3_600_000).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    title: `Title ${id}`,
    platform: 'instagram',
    url: null,
    caption: null,
    note: null,
    chip: null,
    ingest: 'link_metadata',
    media: null,
    privateNoAI: false,
    analysis:
      entities || purpose
        ? ({
            source_summary: '',
            evidence: [],
            observed_objects: [],
            visible_text: [],
            transcript_summary: '',
            inferred_possible_intents: [],
            actionable_entities: (entities ?? []).map((name) => ({ type: 'other', name, evidence: [] })),
            suggested_actions: [],
            purpose: purpose ?? 'other',
            note_grounding: { status: 'no_note', evidence: [], explanation: '' },
          } as Memory['analysis'])
        : null,
    analysisStatus: 'done',
    categoryId: null,
    categoryWhy: null,
    categoryByAI: false,
    projectIds: [],
    remindAt: null,
    doneAt: null,
    snoozedUntil: null,
    lastOpenedAt: null,
    ledger: [],
    sample: false,
    ...rest,
  } as Memory;
}

const cats: Category[] = [{ id: 'c1', name: 'Recipes', createdAt: '2026-11-01T00:00:00.000Z' }];

describe('Journey tree', () => {
  it('groups by category first, then by purpose, then "not sorted yet"; counts every save once', () => {
    const memories = [
      mem({ categoryId: 'c1' }),
      mem({ categoryId: 'c1' }),
      mem({ purpose: 'travel' }),
      mem({}),
    ];
    const t = buildJourney(memories, cats, labels, { now: NOW });
    expect(t.branches.map((b) => [b.label, b.count]).sort()).toEqual([['Not sorted yet', 1], ['Places', 1], ['Recipes', 2]]);
    expect(t.totals).toMatchObject({ saves: 4, branches: 3 });
    const leaves = t.branches.flatMap((b) => b.children);
    expect(leaves.every((c) => c.kind === 'leaf')).toBe(true);
  });

  it('makes a topic twig only when two or more saves in a branch share it, case-insensitively', () => {
    const memories = [
      mem({ categoryId: 'c1', entities: ['Paneer tikka'] }),
      mem({ categoryId: 'c1', entities: ['paneer  Tikka', 'Mint chutney'] }),
      mem({ categoryId: 'c1', entities: ['Dosa'] }),
    ];
    const [branch] = buildJourney(memories, cats, labels, { now: NOW }).branches;
    const twigs = branch.children.filter((c) => c.kind === 'twig');
    expect(twigs).toHaveLength(1);
    expect(twigs[0].label.toLowerCase()).toContain('paneer');
    expect(twigs[0].count).toBe(2);
    expect(branch.children.filter((c) => c.kind === 'leaf')).toHaveLength(1);
    expect(branch.count).toBe(3);
  });

  it('marks what grew this week, counts saves with the person\'s words, and orders the newest branch first', () => {
    const old = new Date(NOW - NEW_WINDOW_MS - 86_400_000).toISOString();
    const memories = [
      mem({ categoryId: 'c1', createdAt: old, note: 'for Maa' }),
      mem({ purpose: 'travel' }),
    ];
    const t = buildJourney(memories, cats, labels, { now: NOW });
    expect(t.branches[0].label).toBe('Places');
    expect(t.branches[0].newCount).toBe(1);
    expect(t.branches[1].newCount).toBe(0);
    expect(t.totals).toMatchObject({ newThisWeek: 1, withWords: 1 });
  });

  it('shows the most used reasons for a branch', () => {
    const memories = [
      mem({ categoryId: 'c1', chip: 'Try' }),
      mem({ categoryId: 'c1', chip: 'Try' }),
      mem({ categoryId: 'c1', chip: 'Learn' }),
    ];
    expect(buildJourney(memories, cats, labels, { now: NOW }).branches[0].chips).toEqual(['Try', 'Learn']);
  });

  it('filters by words in the title, the note, the caption, the category or a topic, and drops empty branches', () => {
    const memories = [
      mem({ categoryId: 'c1', title: 'Crispy dosa' }),
      mem({ purpose: 'travel', note: 'Jaipur rooftop cafe' }),
      mem({ purpose: 'shop', caption: 'standing desk' }),
    ];
    const t = buildJourney(memories, cats, labels, { now: NOW, query: 'jaipur cafe' });
    expect(t.branches.map((b) => b.label)).toEqual(['Places']);
    expect(buildJourney(memories, cats, labels, { now: NOW, query: 'recipes' }).totals.saves).toBe(1);
    expect(buildJourney(memories, cats, labels, { now: NOW, query: 'nothing like this' }).branches).toEqual([]);
  });

  it('has a time lens: one branch per month, newest first', () => {
    const memories = [
      mem({ createdAt: '2026-10-05T10:00:00.000Z' }),
      mem({ createdAt: '2026-11-02T10:00:00.000Z' }),
      mem({ createdAt: '2026-11-09T10:00:00.000Z' }),
    ];
    const t = buildJourney(memories, cats, labels, { now: NOW, lens: 'time' });
    expect(t.branches.map((b) => [b.label, b.count])).toEqual([['M 2026-11', 2], ['M 2026-10', 1]]);
    expect(expandableIds(t)).toHaveLength(2);
  });

  it('is empty for no saves and never mutates its input', () => {
    expect(buildJourney([], cats, labels).branches).toEqual([]);
    const memories = [mem({ categoryId: 'c1' })];
    const before = JSON.stringify(memories);
    buildJourney(memories, cats, labels, { now: NOW });
    expect(JSON.stringify(memories)).toBe(before);
  });
});
