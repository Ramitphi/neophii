import type { CSSProperties } from 'react';

/** Bold per-category colours for the feed. `ink` is the text colour that reads on `bg`. */
export interface Pop {
  bg: string;
  deep: string;
  ink: string;
}

export const POPS = {
  violet: { bg: '#6C47FF', deep: '#4F2BE8', ink: '#FFFFFF' },
  pink: { bg: '#FF4FA3', deep: '#E8338A', ink: '#1A0B14' },
  lime: { bg: '#C6F432', deep: '#9BCB0E', ink: '#132000' },
  tangerine: { bg: '#FF8A3D', deep: '#F26A12', ink: '#1F0C00' },
  cyan: { bg: '#2ED3E6', deep: '#12B5CB', ink: '#00191D' },
  sunshine: { bg: '#FFD23F', deep: '#F0B400', ink: '#1F1600' },
} satisfies Record<string, Pop>;

const ORDER: Pop[] = [POPS.pink, POPS.lime, POPS.tangerine, POPS.cyan, POPS.sunshine, POPS.violet];

/** Colours handed out in order, so neighbouring categories never share one (up to six). */
export function popAt(index: number): Pop {
  return ORDER[index % ORDER.length];
}

/** A stable colour for any key, for things with no position (such as an unsorted save). */
export function popFor(key: string): Pop {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ORDER[h % ORDER.length];
}

export function popVars(p: Pop): CSSProperties {
  return { '--acc': p.bg, '--acc-deep': p.deep, '--acc-ink': p.ink } as CSSProperties;
}
