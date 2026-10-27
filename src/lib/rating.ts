import type { Review, Verdict } from '../types';

export const VERDICTS: Verdict[] = ['good', 'mid', 'bad'];

export const VERDICT_LABEL: Record<Verdict, string> = { good: 'Good', mid: 'Mid', bad: 'Bad' };

/** Optional tags for what stood out. The upbeat ones come first. */
export const TAGS: { id: string; label: string }[] = [
  { id: 'gripping', label: 'Gripping' },
  { id: 'funny', label: 'Funny' },
  { id: 'moving', label: 'Moving' },
  { id: 'smart', label: 'Smart' },
  { id: 'acting', label: 'Great acting' },
  { id: 'visuals', label: 'Stunning visuals' },
  { id: 'soundtrack', label: 'Great soundtrack' },
  { id: 'comfort', label: 'Comfort watch' },
  { id: 'scary', label: 'Scary' },
  { id: 'slow', label: 'Slow' },
  { id: 'long', label: 'Too long' },
  { id: 'predictable', label: 'Predictable' },
  { id: 'confusing', label: 'Confusing' },
  { id: 'overhyped', label: 'Overhyped' },
];
export const TAG_LABEL = new Map(TAGS.map((t) => [t.id, t.label]));

/** How strongly a rating pulls similar titles up (positive) or pushes them down (negative) in recommendations. */
export const pull = (r: Pick<Review, 'verdict' | 'again'>) => ({ good: 0.75, mid: -0.1, bad: -0.9 })[r.verdict] + (r.again ? 0.25 : 0);

/**
 * How glad you'd be to watch it with the crew, 0–1. Having seen it already, whether you'd watch it
 * again matters as much as whether it was good.
 */
export const appeal = (r: Pick<Review, 'verdict' | 'again'>) => ({ good: 0.6, mid: 0.3, bad: 0 })[r.verdict] + (r.again ? 0.4 : 0);

const tier = (r: Pick<Review, 'verdict' | 'again'>) => VERDICTS.indexOf(r.verdict) * 2 + (r.again ? 0 : 1);

/** Logbook order: good, then mid, then bad; within each, ones you'd watch again first, then newest. */
export const byVerdict = (a: Review, b: Review) => tier(a) - tier(b) || b.at - a.at;

/** The logbook and galaxy filters on your ratings. Several verdicts or tags mean any of them. */
export interface ReviewFilter {
  verdicts: Verdict[];
  tags: string[];
  again: boolean;
}

export const NO_FILTER: ReviewFilter = { verdicts: [], tags: [], again: false };

export const filtering = (f: ReviewFilter) => f.verdicts.length > 0 || f.tags.length > 0 || f.again;

export const passes = (r: Review, f: ReviewFilter) =>
  (!f.verdicts.length || f.verdicts.includes(r.verdict)) && (!f.tags.length || f.tags.some((t) => r.tags.includes(t))) && (!f.again || r.again);

export const countVerdicts = (rs: Iterable<Review>) => {
  const n: Record<Verdict, number> = { good: 0, mid: 0, bad: 0 };
  for (const r of rs) n[r.verdict]++;
  return n;
};

/** "12 good · 4 mid · 1 bad", leaving out verdicts with none. */
export const verdictSummary = (n: Record<Verdict, number>) =>
  VERDICTS.filter((v) => n[v]).map((v) => `${n[v]} ${v}`).join(' · ');
