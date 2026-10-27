import type { Rating, Title, Verdict } from '../types';
import { CATALOG } from './catalog';
import { appeal } from './rating';
import { recommend } from './recommend';
import { computeRatings, emptyData, sanitize, type Data } from './store';

export interface Person {
  id: string;
  name: string;
  data: Data;
}

export interface Member {
  name: string;
  ratings: Map<string, Rating>;
  data: Data;
}

export interface GroupPick {
  title: Title;
  /** Members who already have it on their watchlist. */
  wanted: string[];
  /** Members who have rated it, with their verdict and whether they'd watch it again. */
  seenBy: { name: string; verdict: Verdict; again: boolean }[];
}

/**
 * Which titles to consider: ones nobody has rated, ones some (not all) of you have, both, or
 * rewatches: ones at least one of you would happily watch again (even if everyone's seen them).
 */
export type SeenMode = 'none' | 'some' | 'either' | 'rewatch';

export const toMember = (name: string, data: Data): Member => ({ name, data, ratings: computeRatings(data) });

/**
 * Titles scored for everyone at once. Each member's taste is scored with the normal recommender
 * (or, for a title they've rated, by their verdict and whether they'd watch it again), then
 * combined so one person loving a title can't outvote the others: half the average, half the
 * least-happy member. Titles everyone has rated are left out except for rewatches; `seen` picks
 * between unseen titles, ones some of you have seen, both, or rewatches.
 */
export function groupPicks(members: Member[], seen: SeenMode = 'none'): GroupPick[] {
  const dismissed = new Set(members.flatMap((m) => m.data.dismissed));
  const tasters = members.filter((m) => m.ratings.size);
  const fits = tasters.map((m) => {
    const recs = recommend(m.ratings, dismissed);
    const max = recs[0]?.score || 1;
    return new Map(recs.map((r) => [r.title.id, Math.max(0, r.score / max)]));
  });

  const out: (GroupPick & { score: number })[] = [];
  for (const t of CATALOG) {
    if (dismissed.has(t.id)) continue;
    const seenBy = members.filter((m) => m.ratings.has(t.id));
    if (seen === 'rewatch') {
      if (!seenBy.some((m) => m.ratings.get(t.id)!.again)) continue;
    } else if (seenBy.length === members.length || (seen === 'none' && seenBy.length) || (seen === 'some' && !seenBy.length)) continue;
    const wanted = members.filter((m) => m.data.watchlist.includes(t.id)).map((m) => m.name);
    const vals = tasters.map((m, i) => {
      const r = m.ratings.get(t.id);
      return r ? appeal(r) : fits[i].get(t.id) ?? 0;
    });
    if (!wanted.length && !vals.some((v) => v > 0)) continue;
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const min = vals.length ? Math.min(...vals) : 0;
    const score = 0.55 * mean + 0.45 * min + 0.12 * wanted.length;
    out.push({
      title: t,
      score,
      wanted,
      seenBy: seenBy.map((m) => {
        const r = m.ratings.get(t.id)!;
        return { name: m.name, verdict: r.verdict, again: r.again };
      }),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

const KEY = 'teli:group:v1';

export interface GroupState {
  people: Person[];
  includeMe: boolean;
}

export function loadGroup(): GroupState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && Array.isArray(raw.people)) {
      return {
        includeMe: raw.includeMe !== false,
        people: raw.people
          .filter((p: Partial<Person>) => p && typeof p.id === 'string')
          .map((p: Partial<Person>) => ({ id: p.id!, name: String(p.name ?? 'Friend').slice(0, 40), data: sanitize(p.data ?? emptyData()) })),
      };
    }
  } catch {
    /* storage unavailable or corrupt — start with an empty group */
  }
  return { people: [], includeMe: true };
}

export function saveGroup(g: GroupState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* quota / private mode — the group just won't survive a reload */
  }
}

/** "teli-backup-2026-10-11 (2).json" → "" (generic); "sam.json" → "Sam". */
export function nameFromFile(file: string): string {
  const stem = file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  if (!stem || /^teli backup/i.test(stem)) return '';
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}
