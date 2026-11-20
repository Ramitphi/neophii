// The Journey view: every save, in one tree that grows. Pure functions, no network and no AI call: the shape
// comes from what the person and the readings already decided (categories, purposes, topics), so it gets richer on
// its own as saves arrive. Nothing here invents a reason or rewrites a word.
import type { Category, Memory, MemoryChip, MemoryPurpose } from '../types/neophi';

export type JourneyLens = 'themes' | 'time';

export interface JourneyLabels {
  purposes: Record<MemoryPurpose, string>;
  unsorted: string;
  /** Month heading for the time lens, from a 'YYYY-MM' key. */
  month: (key: string) => string;
}

export interface JourneyNode {
  id: string;
  kind: 'branch' | 'twig' | 'leaf';
  label: string;
  /** Saves under this node (1 for a leaf). */
  count: number;
  /** Saves under this node made in the last 7 days. */
  newCount: number;
  latestAt: string;
  /** The most used "why I saved it" chips under a branch, most used first. */
  chips: MemoryChip[];
  /** Index into the colour palette, stable for the same branch. */
  tone: number;
  children: JourneyNode[];
  memory?: Memory;
}

export interface JourneyTree {
  branches: JourneyNode[];
  totals: { saves: number; branches: number; newThisWeek: number; withWords: number };
}

export const NEW_WINDOW_MS = 7 * 24 * 3_600_000;
export const TONES = 8;

function hashTone(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % TONES;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** What the branch is called: the person's (or the AI's) category if there is one, else the kind of save it is. */
function branchOf(m: Memory, cats: Map<string, Category>, labels: JourneyLabels): { key: string; label: string } {
  const cat = m.categoryId ? cats.get(m.categoryId) : undefined;
  if (cat) return { key: `cat:${norm(cat.name)}`, label: cat.name };
  const purpose = m.analysis?.purpose;
  if (purpose && purpose !== 'other') return { key: `purpose:${purpose}`, label: labels.purposes[purpose] };
  return { key: 'unsorted', label: labels.unsorted };
}

function entitiesOf(m: Memory): { key: string; label: string }[] {
  const seen = new Set<string>();
  const out: { key: string; label: string }[] = [];
  for (const e of m.analysis?.actionable_entities ?? []) {
    const name = (e.name ?? '').trim();
    const key = norm(name);
    if (name.length < 2 || name.length > 40 || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: name });
  }
  return out;
}

function matches(m: Memory, query: string, cats: Map<string, Category>): boolean {
  const q = norm(query);
  if (!q) return true;
  const hay = [
    m.title,
    m.note,
    m.caption,
    m.categoryId ? cats.get(m.categoryId)?.name : null,
    ...entitiesOf(m).map((e) => e.label),
    m.analysis?.source_summary,
  ]
    .filter((x): x is string => typeof x === 'string')
    .map(norm)
    .join(' ');
  return q.split(' ').every((word) => hay.includes(word));
}

function leaf(m: Memory, nowMs: number, parent: string): JourneyNode {
  const isNew = nowMs - new Date(m.createdAt).getTime() < NEW_WINDOW_MS;
  return {
    id: `${parent}/m:${m.id}`,
    kind: 'leaf',
    label: m.title,
    count: 1,
    newCount: isNew ? 1 : 0,
    latestAt: m.createdAt,
    chips: m.chip ? [m.chip] : [],
    tone: 0,
    children: [],
    memory: m,
  };
}

const byNewest = (a: { latestAt: string }, b: { latestAt: string }) => b.latestAt.localeCompare(a.latestAt);

function leavesOf(n: JourneyNode): JourneyNode[] {
  return n.kind === 'leaf' ? [n] : n.children.flatMap(leavesOf);
}

function rollup(id: string, kind: 'branch' | 'twig', label: string, children: JourneyNode[], tone: number): JourneyNode {
  const chipCount = new Map<MemoryChip, number>();
  let count = 0;
  let newCount = 0;
  let latestAt = '';
  for (const c of children) {
    count += c.count;
    newCount += c.newCount;
    if (c.latestAt > latestAt) latestAt = c.latestAt;
    for (const l of leavesOf(c)) for (const chip of l.chips) chipCount.set(chip, (chipCount.get(chip) ?? 0) + 1);
  }
  const chips = [...chipCount.entries()].sort((x, y) => y[1] - x[1]).slice(0, 2).map(([chip]) => chip);
  return { id, kind, label, count, newCount, latestAt, chips, tone, children };
}

export function buildJourney(
  memories: Memory[],
  categories: Category[],
  labels: JourneyLabels,
  opts: { lens?: JourneyLens; query?: string; now?: number } = {}
): JourneyTree {
  const nowMs = opts.now ?? Date.now();
  const lens = opts.lens ?? 'themes';
  const cats = new Map(categories.map((c) => [c.id, c]));
  const shown = memories.filter((m) => matches(m, opts.query ?? '', cats));

  let branches: JourneyNode[];

  if (lens === 'time') {
    const months = new Map<string, Memory[]>();
    for (const m of shown) {
      const key = m.createdAt.slice(0, 7);
      const list = months.get(key) ?? [];
      list.push(m);
      months.set(key, list);
    }
    branches = [...months.entries()].map(([key, list]) =>
      rollup(`time:${key}`, 'branch', labels.month(key), list.map((m) => leaf(m, nowMs, `time:${key}`)).sort(byNewest), hashTone(key))
    );
  } else {
    const groups = new Map<string, { label: string; items: Memory[] }>();
    for (const m of shown) {
      const b = branchOf(m, cats, labels);
      const g = groups.get(b.key) ?? { label: b.label, items: [] };
      g.items.push(m);
      groups.set(b.key, g);
    }
    branches = [...groups.entries()].map(([key, g]) => {
      // A topic becomes its own twig only when at least two saves in this branch share it.
      const topicCount = new Map<string, { label: string; n: number }>();
      for (const m of g.items) {
        for (const e of entitiesOf(m)) {
          const t = topicCount.get(e.key) ?? { label: e.label, n: 0 };
          t.n++;
          topicCount.set(e.key, t);
        }
      }
      const twigs = new Map<string, Memory[]>();
      const loose: Memory[] = [];
      for (const m of g.items) {
        const best = entitiesOf(m)
          .filter((e) => (topicCount.get(e.key)?.n ?? 0) >= 2)
          .sort((a, b) => (topicCount.get(b.key)!.n - topicCount.get(a.key)!.n) || a.key.localeCompare(b.key))[0];
        if (best) twigs.set(best.key, [...(twigs.get(best.key) ?? []), m]);
        else loose.push(m);
      }
      const tone = hashTone(key);
      const children: JourneyNode[] = [
        ...[...twigs.entries()].map(([tk, list]) =>
          rollup(`${key}/t:${tk}`, 'twig', topicCount.get(tk)!.label, list.map((m) => leaf(m, nowMs, `${key}/t:${tk}`)).sort(byNewest), tone)
        ),
        ...loose.map((m) => leaf(m, nowMs, key)),
      ].sort(byNewest);
      return rollup(`branch:${key}`, 'branch', g.label, children, tone);
    });
  }

  branches.sort((a, b) => byNewest(a, b) || b.count - a.count);
  return {
    branches,
    totals: {
      saves: shown.length,
      branches: branches.length,
      newThisWeek: shown.filter((m) => nowMs - new Date(m.createdAt).getTime() < NEW_WINDOW_MS).length,
      withWords: shown.filter((m) => Boolean(m.note)).length,
    },
  };
}

/** Every node id that has children, for "expand all". */
export function expandableIds(tree: JourneyTree): string[] {
  const out: string[] = [];
  const walk = (n: JourneyNode) => {
    if (n.children.length > 0) out.push(n.id);
    n.children.forEach(walk);
  };
  tree.branches.forEach(walk);
  return out;
}
