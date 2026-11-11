import type { Title } from '../types';
import { CATALOG, GENRES } from './catalog';

/** What the galaxy's filters can highlight titles by. */
export type Dimension = 'genres' | 'themes' | 'decades' | 'makers';

export const decadeOf = (t: Title) => `${Math.floor(t.year / 10) * 10}s`;

export function keysOf(dim: Dimension, t: Title): string[] {
  if (dim === 'genres') return t.genres;
  if (dim === 'themes') return t.tags;
  if (dim === 'decades') return [decadeOf(t)];
  return t.creator ? [t.creator] : [];
}

const COUNTS: Record<'themes' | 'decades' | 'makers', Map<string, number>> = { themes: new Map(), decades: new Map(), makers: new Map() };
for (const t of CATALOG) {
  for (const dim of ['themes', 'decades', 'makers'] as const) {
    for (const k of keysOf(dim, t)) COUNTS[dim].set(k, (COUNTS[dim].get(k) ?? 0) + 1);
  }
}

/**
 * The groups worth picking in each dimension: every genre, every decade with a real
 * selection, and the themes and directors/networks that come up most in the library.
 */
export const UNIVERSE: Record<Dimension, string[]> = {
  genres: GENRES,
  decades: [...COUNTS.decades.entries()].filter(([, n]) => n >= 15).map(([k]) => k).sort(),
  themes: [...COUNTS.themes.entries()].filter(([, n]) => n >= 40).sort((a, b) => b[1] - a[1]).map(([k]) => k),
  makers: [...COUNTS.makers.entries()].filter(([, n]) => n >= 12).sort((a, b) => b[1] - a[1]).map(([k]) => k),
};
