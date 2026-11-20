import type { MemoryAnalysis } from '../types/neophi';

/**
 * A short, AI-labelled line for a save that has no note: what the item is, else its first key point.
 * It describes the item only; it is never shown as the person's reason.
 */
export function aiLine(analysis: Pick<MemoryAnalysis, 'what_this_is' | 'key_points'> | null | undefined): string | null {
  if (!analysis) return null;
  const what = analysis.what_this_is?.trim();
  if (what) return what;
  const first = analysis.key_points?.[0]?.text?.trim();
  return first || null;
}
