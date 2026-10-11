import type { MediaType, Rating, Title } from '../types';
import { BY_ID, CATALOG, ORDER } from './catalog';

/*
 * Content-based recommender. Each title becomes a weighted feature vector
 * (genres, tags, director/network, type, decade) and similarity is cosine.
 * A candidate's score is the sum of its similarity to everything you've rated,
 * weighted by how much you liked each one (dislikes push it down).
 */

const W = { genre: 1, tag: 1.6, creator: 2.2, type: 0.6, decade: 0.4 };

interface Vec {
  w: Map<string, number>;
  norm: number;
}
const cache = new Map<string, Vec>();

function vec(t: Title): Vec {
  let v = cache.get(t.id);
  if (v) return v;
  const w = new Map<string, number>();
  for (const g of t.genres) w.set('g:' + g, W.genre);
  for (const tag of t.tags) w.set('t:' + tag, W.tag);
  if (t.creator) w.set('c:' + t.creator, W.creator);
  w.set('type:' + t.type, W.type);
  w.set('d:' + Math.floor(t.year / 10), W.decade);
  let sq = 0;
  for (const x of w.values()) sq += x * x;
  v = { w, norm: Math.sqrt(sq) };
  cache.set(t.id, v);
  return v;
}

export function similarity(a: Title, b: Title): number {
  const A = vec(a);
  const B = vec(b);
  const [small, large] = A.w.size < B.w.size ? [A, B] : [B, A];
  let dot = 0;
  for (const [k, x] of small.w) {
    const y = large.w.get(k);
    if (y) dot += x * y;
  }
  return dot / (A.norm * B.norm);
}

export function similarTitles(id: string, exclude: Set<string> = new Set(), k = 12, minSim = 0.2): Title[] {
  const t = BY_ID.get(id);
  if (!t) return [];
  return CATALOG.filter((c) => c.id !== id && !exclude.has(c.id))
    .map((c) => ({ c, s: similarity(t, c) }))
    .filter((x) => x.s >= minSim)
    .sort((a, b) => b.s - a.s || ORDER.get(a.c.id)! - ORDER.get(b.c.id)!)
    .slice(0, k)
    .map((x) => x.c);
}

export interface Rec {
  title: Title;
  score: number;
  /** 55–99, relative to the best recommendation. */
  match: number;
  /** The rated title that contributed most to this pick. */
  because?: Title;
}

export function recommend(ratings: Map<string, Rating>, dismissed: Set<string>, type?: MediaType): Rec[] {
  const rated = [...ratings.values()].map((r) => ({ t: BY_ID.get(r.id)!, w: (r.score - 5.5) / 4.5 }));
  if (!rated.length) return [];
  const N = CATALOG.length;
  const scale = Math.sqrt(rated.length);
  const out: Rec[] = [];

  for (const t of CATALOG) {
    if (ratings.has(t.id) || dismissed.has(t.id) || (type && t.type !== type)) continue;
    let total = 0;
    let best = 0;
    let because: Title | undefined;
    for (const r of rated) {
      const s = similarity(t, r.t);
      if (s < 0.15) continue;
      const c = s * s * r.w;
      total += c;
      if (c > best) {
        best = c;
        because = r.t;
      }
    }
    if (total <= 0) continue;
    const prior = 0.04 * (1 - ORDER.get(t.id)! / N);
    out.push({ title: t, score: total / scale + prior, match: 0, because });
  }

  out.sort((a, b) => b.score - a.score);
  const max = out[0]?.score ?? 1;
  for (const r of out) r.match = Math.round(55 + 44 * Math.min(1, r.score / max));
  return out;
}
