import type {
  Memory,
  SearchQueryUnderstanding,
  SearchResponse,
  SearchResultItem,
} from '../src/types/neophi.js';
import type { GeminiService } from './gemini.js';
import type { NeophiStore } from './store.js';

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function extractLocalFallbackUnderstanding(q: string, base: SearchQueryUnderstanding): SearchQueryUnderstanding {
  const lower = q.toLowerCase();
  let timeHint = base.timeHint;
  if (!timeHint) {
    if (lower.includes('last week') || lower.includes('pichle hafte')) timeHint = 'last_week';
    else if (lower.includes('last month') || lower.includes('pichle mahine')) timeHint = 'last_month';
  }

  const hingeMap: Record<string, string> = {
    laal: 'red',
    lal: 'red',
    subah: 'morning',
    rasta: 'road',
    raste: 'road',
    dance: 'dance',
    shirt: 'shirt',
  };

  const extraKeywords = new Set(base.keywords);
  for (const [k, v] of Object.entries(hingeMap)) {
    if (lower.includes(k)) extraKeywords.add(v);
  }

  return {
    ...base,
    keywords: Array.from(extraKeywords),
    timeHint,
  };
}

function matchesTimeHint(createdAt: string, timeHint: 'last_week' | 'last_month' | null, now: Date): boolean {
  if (!timeHint) return true;
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return true;
  const days = timeHint === 'last_week' ? 7 : 31;
  return now.getTime() - createdMs <= days * 24 * 60 * 60 * 1000;
}

export async function searchMemories(
  uid: string,
  query: string,
  store: NeophiStore,
  gemini: GeminiService,
  now = new Date()
): Promise<SearchResponse> {
  const rawUnderstanding = await gemini.rewriteSearchQuery(query);
  const understoodAs = extractLocalFallbackUnderstanding(query, rawUnderstanding);

  const terms = Array.from(
    new Set(
      [
        ...understoodAs.keywords,
        ...query.toLowerCase().split(/[\s,]+/),
        ...understoodAs.english.toLowerCase().split(/[\s,]+/),
      ]
        .map((t) => t.trim())
        .filter((t) => t.length > 1 && !['last', 'month', 'week', 'wala', 'wali', 'pichle', 'mahine'].includes(t))
    )
  );

  // 1. Vector search (if embedding succeeds)
  const vectorHits = new Map<string, { memory: Memory; distance: number }>();
  const queryVec = await gemini.embedText(understoodAs.english || query).catch(() => null);
  if (queryVec && queryVec.length > 0) {
    const nearest = await store.findNearestMemories(uid, queryVec, 20).catch(() => []);
    for (const hit of nearest) {
      vectorHits.set(hit.memory.id, hit);
    }
  }

  // 2. Keyword match across user's own memories (note, caption, observations, title)
  const allMemories = await store.listMemories(uid);
  const scored: Array<SearchResultItem & { noteMatch: boolean }> = [];

  for (const memory of allMemories) {
    if (!matchesTimeHint(memory.createdAt, understoodAs.timeHint, now)) continue;

    const noteLower = (memory.note || '').toLowerCase();
    const captionLower = (memory.caption || '').toLowerCase();
    const titleLower = (memory.title || '').toLowerCase();
    const observations = memory.analysis?.observed_objects ?? [];
    const summaryLower = (memory.analysis?.source_summary || '').toLowerCase();

    const matchedNoteTerm = terms.find((t) => noteLower.includes(t));
    const matchedCaptionTerm = terms.find((t) => captionLower.includes(t));
    const matchedTitleTerm = terms.find((t) => titleLower.includes(t));
    const matchedObs = observations.find((o) =>
      terms.some((t) => o.label.toLowerCase().includes(t))
    );
    const matchedSummaryTerm = terms.find((t) => summaryLower.includes(t));

    const vecHit = vectorHits.get(memory.id);
    const vecScore = vecHit ? Math.max(0, 1 - vecHit.distance) : 0;

    if (!matchedNoteTerm && !matchedCaptionTerm && !matchedTitleTerm && !matchedObs && !matchedSummaryTerm && vecScore < 0.35) {
      continue;
    }

    let whyMatched = '';
    let noteMatch = false;
    let score = vecScore;

    if (matchedNoteTerm && memory.note) {
      noteMatch = true;
      score += 2.0;
      const snippet = memory.note.length > 48 ? `${memory.note.slice(0, 48)}…` : memory.note;
      whyMatched = `Your words: '${snippet}'`;
    } else if (matchedCaptionTerm) {
      score += 1.0;
      whyMatched = `Caption mentions '${matchedCaptionTerm}'`;
    } else if (matchedObs) {
      score += 0.9;
      const ev = memory.analysis?.evidence.find((e) => matchedObs.evidence.includes(e.id));
      if (ev && typeof ev.t === 'number') {
        whyMatched = `AI reading: ${matchedObs.label} at ${formatSeconds(ev.t)}`;
      } else {
        whyMatched = `AI reading: ${matchedObs.label}`;
      }
    } else if (matchedTitleTerm) {
      score += 0.8;
      whyMatched = `Title mentions '${matchedTitleTerm}'`;
    } else if (matchedSummaryTerm) {
      score += 0.6;
      whyMatched = `AI reading: ${matchedSummaryTerm}`;
    } else {
      whyMatched = 'Matched by semantic similarity';
    }

    scored.push({
      memory,
      whyMatched,
      score,
      noteMatch,
    });
  }

  // User's own words rank first, then by descending score
  scored.sort((a, b) => {
    if (a.noteMatch !== b.noteMatch) return a.noteMatch ? -1 : 1;
    return b.score - a.score;
  });

  return {
    understoodAs,
    results: scored.map(({ memory, whyMatched, score }) => ({ memory, whyMatched, score })),
  };
}
