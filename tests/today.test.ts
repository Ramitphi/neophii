import { describe, expect, it } from 'vitest';
import { buildTodayFeed } from '../server/today.js';
import type { Memory } from '../src/types/neophi.js';

function makeMemory(id: string, daysAgo: number, overrides: Partial<Memory> = {}): Memory {
  const created = new Date(Date.UTC(2026, 10, 20 - daysAgo, 10, 0, 0)).toISOString();
  return {
    id,
    createdAt: created,
    updatedAt: created,
    title: `Memory ${id}`,
    platform: 'web',
    url: `https://example.com/${id}`,
    caption: null,
    note: null,
    chip: null,
    ingest: 'link_metadata',
    media: null,
    privateNoAI: false,
    analysis: null,
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
    ...overrides,
  };
}

describe('Today feed selection', () => {
  it('returns empty state when library has no memories', () => {
    const feed = buildTodayFeed({ memories: [], projects: [] });
    expect(feed.isEmptyLibrary).toBe(true);
    expect(feed.justArrived).toEqual([]);
    expect(feed.beforeItFades).toBeNull();
  });

  it('is deterministic for a given date and timezone', () => {
    const now = new Date('2026-11-20T09:00:00Z');
    const memories = Array.from({ length: 12 }, (_, i) =>
      makeMemory(`m-${i}`, 35 + i, { chip: 'Try' })
    );
    const run1 = buildTodayFeed({ memories, projects: [], now, timeZone: 'Asia/Kolkata' });
    const run2 = buildTodayFeed({ memories, projects: [], now, timeZone: 'Asia/Kolkata' });
    expect(run1.beforeItFades?.memory.id).toBe(run2.beforeItFades?.memory.id);
    expect(run1.readyForThisHour.cards.map((c) => c.memory.id)).toEqual(
      run2.readyForThisHour.cards.map((c) => c.memory.id)
    );
  });

  it('enforces the one-card-a-day Before it fades cap only when >= 10 saves and >= 30 days unopened', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    const nineMemories = Array.from({ length: 9 }, (_, i) => makeMemory(`m-${i}`, 40));
    const feed9 = buildTodayFeed({ memories: nineMemories, projects: [], now });
    expect(feed9.beforeItFades).toBeNull();

    const tenMemories = [...nineMemories, makeMemory('m-9', 40)];
    const feed10 = buildTodayFeed({ memories: tenMemories, projects: [], now });
    expect(feed10.beforeItFades).not.toBeNull();
    expect(feed10.beforeItFades?.whySeeing).toContain('never opened');
  });

  it('shows weekly card only between Sunday 09:00 and Monday 12:00 in user timezone', () => {
    // 2026-11-22 is a Sunday.
    // 04:00 UTC = 09:30 IST (inside window), 04:00 UTC in UTC is 04:00 (outside window)
    const sundayMorningIst = new Date('2026-11-22T04:00:00Z');
    const memories = [
      makeMemory('recent-1', 1, { createdAt: '2026-11-21T10:00:00Z' }),
      makeMemory('recent-2', 2, { createdAt: '2026-11-20T10:00:00Z' }),
    ];

    const istFeed = buildTodayFeed({
      memories,
      projects: [],
      now: sundayMorningIst,
      timeZone: 'Asia/Kolkata',
    });
    expect(istFeed.weeklyCard.visible).toBe(true);

    const utcFeed = buildTodayFeed({
      memories,
      projects: [],
      now: sundayMorningIst,
      timeZone: 'UTC',
    });
    expect(utcFeed.weeklyCard.visible).toBe(false);
  });
});
