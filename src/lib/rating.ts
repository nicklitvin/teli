import type { Review, Verdict } from '../types';

export const VERDICTS: Verdict[] = ['good', 'ok', 'bad'];

export const VERDICT_LABEL: Record<Verdict, string> = { good: 'Good', ok: 'Ok', bad: 'Bad' };

/** A short keyword for what stood out. Ratings store the id, so renaming one keeps it on them. */
export interface Tag { id: string; label: string }

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The keywords you start with; Settings can rename, remove and add to them. */
export const DEFAULT_TAGS: Tag[] = [
  'silly', 'sad', 'quirky', 'slog', 'cozy', 'tense', 'funny', 'beautiful', 'hype', 'hopeful', 'creepy',
].map((id) => ({ id, label: capital(id) }));
/** Enough to choose from on one screen without the rating page scrolling. */
export const MAX_TAGS = 16;
export const MAX_TAG_LENGTH = 16;
/** Tags from the first tag list that have a close match in the current one. */
export const OLD_TAGS: Record<string, string> = {
  gripping: 'tense', comfort: 'cozy', scary: 'creepy', slow: 'slog', long: 'slog', visuals: 'beautiful', moving: 'sad',
};

/** The id for a new keyword: its label, lowercase and hyphenated. */
export const tagId = (label: string) =>
  label.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
export const isTagId = (x: unknown): x is string => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(x);

/** A keyword's name: from your list, else the default list, else made from its id (one you've since removed). */
export const tagLabel = (id: string, tags: Tag[]) =>
  tags.find((t) => t.id === id)?.label ?? DEFAULT_TAGS.find((t) => t.id === id)?.label ?? capital(id.replace(/-/g, ' '));

/** A valid keyword list from anything (a backup, a crewmate's row), or undefined to use the defaults. */
export function cleanTags(x: unknown): Tag[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out: Tag[] = [];
  for (const t of x as Partial<Tag>[]) {
    const label = typeof t?.label === 'string' ? t.label.trim().slice(0, MAX_TAG_LENGTH) : '';
    if (!label || !isTagId(t.id) || out.some((o) => o.id === t.id || o.label.toLowerCase() === label.toLowerCase())) continue;
    out.push({ id: t.id, label });
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** How strongly a rating pulls similar titles up (positive) or pushes them down (negative) in recommendations. */
export const pull = (r: Pick<Review, 'verdict' | 'again'>) => ({ good: 0.75, ok: -0.1, bad: -0.9 })[r.verdict] + (r.again ? 0.25 : 0);

/**
 * How glad you'd be to watch it with the crew, 0–1. Having seen it already, whether you'd watch it
 * again matters as much as whether it was good.
 */
export const appeal = (r: Pick<Review, 'verdict' | 'again'>) => ({ good: 0.6, ok: 0.3, bad: 0 })[r.verdict] + (r.again ? 0.4 : 0);

const tier = (r: Pick<Review, 'verdict' | 'again'>) => VERDICTS.indexOf(r.verdict) * 2 + (r.again ? 0 : 1);

/** Logbook order: good, then ok, then bad; within each, ones you'd watch again first, then newest. */
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
  const n: Record<Verdict, number> = { good: 0, ok: 0, bad: 0 };
  for (const r of rs) n[r.verdict]++;
  return n;
};

/** "12 good · 4 ok · 1 bad", leaving out verdicts with none. */
export const verdictSummary = (n: Record<Verdict, number>) =>
  VERDICTS.filter((v) => n[v]).map((v) => `${n[v]} ${v}`).join(' · ');
