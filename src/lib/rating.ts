import type { Review, Verdict } from '../types';

export const VERDICTS: Verdict[] = ['good', 'ok', 'bad', 'dnf'];

export const VERDICT_LABEL: Record<Verdict, string> = { good: 'Good', ok: 'Ok', bad: 'Bad', dnf: 'Didn’t finish' };

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

/** How long a rating's note can be: a line, not a review. */
export const MAX_NOTE = 100;

/** A note from anything (a backup, a crewmate's row): one line, trimmed, at most MAX_NOTE characters. */
export const cleanNote = (x: unknown) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE) : '');

/**
 * Ratings from before notes had keywords ("cozy", "tense", or ones you'd renamed in `labels`);
 * they carry over as the note, "Cozy, tense".
 */
export function noteFromTags(tags: unknown, labels: unknown): string {
  if (!Array.isArray(tags)) return '';
  const named = new Map<string, string>();
  if (Array.isArray(labels)) {
    for (const t of labels as { id?: unknown; label?: unknown }[]) if (typeof t?.id === 'string' && typeof t.label === 'string') named.set(t.id, t.label);
  }
  const words = tags.filter((t): t is string => typeof t === 'string' && !!t)
    .map((id, i) => {
      const w = named.get(id) ?? id.replace(/-/g, ' ');
      return i ? w.toLowerCase() : capital(w);
    });
  return cleanNote([...new Set(words)].join(', '));
}

/**
 * How strongly a rating pulls similar titles up (positive) or pushes them down (negative) in
 * recommendations. Giving up on something counts against titles like it, but less than bad.
 */
export const pull = (r: Pick<Review, 'verdict' | 'again'>) => ({ good: 0.75, ok: -0.1, bad: -0.9, dnf: -0.5 })[r.verdict] + (r.again ? 0.25 : 0);

/**
 * How glad you'd be to watch it with the crew, 0–1. Having seen it already, whether you'd watch it
 * again matters as much as whether it was good.
 */
export const appeal = (r: Pick<Review, 'verdict' | 'again'>) => ({ good: 0.6, ok: 0.3, bad: 0, dnf: 0.1 })[r.verdict] + (r.again ? 0.4 : 0);

const tier = (r: Pick<Review, 'verdict' | 'again'>) => VERDICTS.indexOf(r.verdict) * 2 + (r.again ? 0 : 1);

/** Logbook order: good, then ok, then bad, then didn't finish; within each, ones you'd watch again first, then newest. */
export const byVerdict = (a: Review, b: Review) => tier(a) - tier(b) || b.at - a.at;

/** The logbook and galaxy filters on your ratings. Several verdicts mean any of them. */
export interface ReviewFilter {
  verdicts: Verdict[];
  again: boolean;
}

export const NO_FILTER: ReviewFilter = { verdicts: [], again: false };

export const filtering = (f: ReviewFilter) => f.verdicts.length > 0 || f.again;

export const passes = (r: Review, f: ReviewFilter) =>
  (!f.verdicts.length || f.verdicts.includes(r.verdict)) && (!f.again || r.again);

export const countVerdicts = (rs: Iterable<Review>) => {
  const n: Record<Verdict, number> = { good: 0, ok: 0, bad: 0, dnf: 0 };
  for (const r of rs) n[r.verdict]++;
  return n;
};

/** "12 good · 4 ok · 1 bad · 2 didn't finish", leaving out verdicts with none. */
export const verdictSummary = (n: Record<Verdict, number>) =>
  VERDICTS.filter((v) => n[v]).map((v) => `${n[v]} ${VERDICT_LABEL[v].toLowerCase()}`).join(' · ');
