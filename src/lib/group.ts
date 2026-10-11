import type { Rating, Title } from '../types';
import { CATALOG } from './catalog';
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
  /** 55–99, relative to the best pick. */
  match: number;
  /** Each member's own match for this title, or null when we know nothing about their taste here. */
  per: { name: string; match: number | null }[];
  /** Members who already have it on their watchlist. */
  wanted: string[];
}

export const toMember = (name: string, data: Data): Member => ({ name, data, ratings: computeRatings(data) });

/**
 * Titles nobody in the group has ranked, scored for everyone at once. Each member's taste is
 * scored with the normal recommender, then combined so one person loving a title can't outvote
 * the others: half the average, half the least-happy member.
 */
export function groupPicks(members: Member[]): GroupPick[] {
  const watched = new Set(members.flatMap((m) => [...m.ratings.keys()]));
  const dismissed = new Set(members.flatMap((m) => m.data.dismissed));
  const tasters = members.filter((m) => m.ratings.size);
  const fits = tasters.map((m) => {
    const recs = recommend(m.ratings, dismissed);
    const max = recs[0]?.score || 1;
    return new Map(recs.map((r) => [r.title.id, Math.max(0, r.score / max)]));
  });

  const out: (GroupPick & { score: number })[] = [];
  for (const t of CATALOG) {
    if (watched.has(t.id) || dismissed.has(t.id)) continue;
    const wanted = members.filter((m) => m.data.watchlist.includes(t.id)).map((m) => m.name);
    const vals = fits.map((f) => f.get(t.id) ?? 0);
    if (!wanted.length && !vals.some((v) => v > 0)) continue;
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const min = vals.length ? Math.min(...vals) : 0;
    const score = 0.55 * mean + 0.45 * min + 0.12 * wanted.length;
    out.push({
      title: t,
      score,
      match: 0,
      wanted,
      per: tasters.map((m, i) => ({ name: m.name, match: vals[i] > 0 ? Math.round(55 + 44 * vals[i]) : null })),
    });
  }
  out.sort((a, b) => b.score - a.score);
  const max = out[0]?.score || 1;
  for (const p of out) p.match = Math.round(55 + 44 * Math.min(1, p.score / max));
  return out;
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
