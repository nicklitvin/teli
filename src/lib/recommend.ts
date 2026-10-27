import type { MediaType, Rating, Title } from '../types';
import { BY_ID, CATALOG, ORDER } from './catalog';
import { UNIVERSE } from './taste';

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
  /** Discover mode: the genres and themes in it you haven't ranked anything from yet. */
  frontier?: string[];
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

/** A number in [0, 1) fixed for a seed and title, so a feed keeps its order when one title drops out of it. */
function jitter(seed: number, id: string): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** A fresh seed for `shuffle` and `discover`. */
export const newSeed = () => Math.floor(Math.random() * 2 ** 32);

/**
 * Gumbel noise for a seed and title. Adding it to log-weights and always taking the highest draws
 * titles at random in proportion to their weight, without replacement.
 */
const gumbel = (seed: number, id: string) => -Math.log(-Math.log(Math.min(1 - 1e-12, Math.max(1e-12, jitter(seed, id)))));

const MIX = 200;
/** Titles from your last few feeds are five times less likely to come up again soon. */
const SEEN = Math.log(0.2);

/**
 * Your picks in a new order for each seed. Each next card is drawn at random with odds that grow
 * with the cube of its score, so strong matches lead most feeds without always being the same
 * ones. Titles in `seen` (shown in recent feeds) sit lower, and titles picked because of the same
 * favorite, by the same director or network, or sharing a main genre with the last few shown are
 * pushed back so the feed keeps changing subject.
 */
export function shuffle(recs: Rec[], seed: number, seen: Set<string> = new Set()): Rec[] {
  const max = recs[0]?.score || 1;
  const left = recs.slice(0, MIX).map((r) => ({
    r,
    k: 3 * Math.log(Math.max(1e-6, r.score / max)) + gumbel(seed, r.title.id) + (seen.has(r.title.id) ? SEEN : 0),
  }));
  const because = new Map<string, number>();
  const creators = new Map<string, number>();
  const out: Rec[] = [];
  while (left.length) {
    const recent = out.slice(-3).map((r) => r.title.genres[0]);
    let best = 0;
    let bestScore = -Infinity;
    left.forEach((x, i) => {
      let s = x.k + Math.log(0.6) * ((because.get(x.r.because?.id ?? '') ?? 0) + (creators.get(x.r.title.creator) ?? 0));
      if (recent.includes(x.r.title.genres[0])) s += Math.log(0.75);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    const [{ r }] = left.splice(best, 1);
    if (r.because) because.set(r.because.id, (because.get(r.because.id) ?? 0) + 1);
    if (r.title.creator) creators.set(r.title.creator, (creators.get(r.title.creator) ?? 0) + 1);
    out.push(r);
  }
  return [...out, ...recs.slice(MIX)];
}

const THEMES = new Set(UNIVERSE.themes);

/**
 * Discover mode: well-known titles from genres and themes you haven't ranked anything in.
 * Your taste still breaks ties, so the first Western you're shown is one you're likely to enjoy,
 * and the feed rotates through frontiers instead of showing five Westerns in a row. Like `shuffle`,
 * the order is drawn at random (weighted by score) for each seed, and titles in `seen` sit lower.
 */
export function discover(ratings: Map<string, Rating>, dismissed: Set<string>, recs: Rec[], seed = 0, seen: Set<string> = new Set()): Rec[] {
  if (!ratings.size) return [];
  const seenGenres = new Map<string, number>();
  const seenThemes = new Set<string>();
  for (const r of ratings.values()) {
    const t = BY_ID.get(r.id)!;
    for (const g of t.genres) seenGenres.set(g, (seenGenres.get(g) ?? 0) + 1);
    for (const x of t.tags) seenThemes.add(x);
  }
  const fit = new Map(recs.map((r) => [r.title.id, r.score]));
  const maxFit = recs[0]?.score || 1;
  const home = Math.max(3, ratings.size / 4);
  const N = CATALOG.length;

  const pool: Rec[] = [];
  for (const t of CATALOG) {
    if (ratings.has(t.id) || dismissed.has(t.id) || !t.genres.length) continue;
    const newGenres = t.genres.filter((g) => !seenGenres.has(g));
    const newThemes = t.tags.filter((x) => THEMES.has(x) && !seenThemes.has(x));
    if (!newGenres.length && !newThemes.length) continue;
    // Genres you rank a lot are home turf and make a title feel less new.
    const familiar = t.genres.reduce((s, g) => s + Math.min(1, (seenGenres.get(g) ?? 0) / home), 0) / t.genres.length;
    const novelty = newGenres.length + 0.6 * newThemes.length + 0.5 * (1 - familiar);
    const known = 1 - ORDER.get(t.id)! / N;
    const f = Math.max(0, (fit.get(t.id) ?? 0) / maxFit);
    const score = novelty * (0.15 + known * known) * (0.6 + 0.8 * f) * (t.image ? 1 : 0.5);
    pool.push({ title: t, score, match: Math.round(55 + 44 * Math.min(1, f)), frontier: [...newGenres, ...newThemes].slice(0, 3) });
  }
  pool.sort((a, b) => b.score - a.score);

  const max = pool[0]?.score || 1;
  const left = pool.slice(0, 600).map((r) => ({
    r,
    k: 1.5 * Math.log(Math.max(1e-6, r.score / max)) + gumbel(seed, r.title.id) + (seen.has(r.title.id) ? SEEN : 0),
  }));
  const used = new Map<string, number>();
  const out: Rec[] = [];
  while (left.length && out.length < 200) {
    let best = 0;
    let bestScore = -Infinity;
    left.forEach((x, i) => {
      const s = x.k + Math.log(0.55) * (used.get(x.r.frontier![0]) ?? 0);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    const [{ r }] = left.splice(best, 1);
    used.set(r.frontier![0], (used.get(r.frontier![0]) ?? 0) + 1);
    out.push(r);
  }
  return out;
}
