import type { MediaType, Rating, Title } from '../types';
import { BY_ID, CATALOG, ORDER } from './catalog';
import { pull } from './rating';
import { UNIVERSE } from './taste';

/*
 * Content-based recommender. Each title becomes a weighted feature vector
 * (genres, tags, director/network, type, decade) and similarity is cosine.
 * A candidate's score comes from its similarity to what you've rated, weighted by your verdict
 * (good pulls it up, bad pushes it down, and would-watch-again counts extra). Agreeing ratings add
 * up with diminishing returns: the closest one counts in full, the next half, the next a quarter,
 * so liking five Marvel films doesn't make every Marvel film outscore everything else.
 */

const W = { genre: 1, tag: 1.6, creator: 2.2, type: 0.6, decade: 0.4 };

/** The catalog spells some themes more than one way ("mcu" and "Marvel Cinematic Universe", "Paris" and "paris"). */
const TAG_ALIAS: Record<string, string> = { 'marvel cinematic universe': 'mcu', 'dc extended universe': 'dc' };
const tagKey = (tag: string) => {
  const k = tag.toLowerCase().replace(/-/g, ' ');
  return TAG_ALIAS[k] ?? k;
};
/** How many titles have each theme: a rare one (a franchise, a character) ties titles together. */
let tagCounts: Map<string, number> | null = null;
const tagCount = (k: string) => {
  if (!tagCounts) {
    tagCounts = new Map();
    for (const t of CATALOG) for (const x of new Set(t.tags.map(tagKey))) tagCounts.set(x, (tagCounts.get(x) ?? 0) + 1);
  }
  return tagCounts.get(k) ?? 0;
};

/** Close enough that hiding one should keep the other away for a while: alike overall, or sharing a rare theme. */
export function related(a: Title, b: Title): boolean {
  if (similarity(a, b) >= 0.35) return true;
  const ka = new Set(a.tags.map(tagKey));
  return b.tags.some((x) => {
    const k = tagKey(x);
    return ka.has(k) && tagCount(k) <= 60;
  });
}

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
  for (const tag of t.tags) w.set('t:' + tagKey(tag), W.tag);
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

// For scoring the whole catalog at once: every feature lists the titles that have it (and
// their weight for it), so a rated title's similarity to all titles is a few passes over those
// lists instead of one comparison per title. Hand-added titles join on the end as they appear.
const FEATURE = new Map<string, number>();
let posts: { t: number[]; w: number[] }[] = [];
let norms = new Float64Array(0);
let indexed = 0;
function index() {
  if (indexed === CATALOG.length) return;
  const n = CATALOG.length;
  const grown = new Float64Array(n);
  grown.set(norms);
  norms = grown;
  for (let i = indexed; i < n; i++) {
    const v = vec(CATALOG[i]);
    norms[i] = v.norm;
    for (const [k, x] of v.w) {
      let f = FEATURE.get(k);
      if (f === undefined) {
        FEATURE.set(k, (f = posts.length));
        posts.push({ t: [], w: [] });
      }
      posts[f].t.push(i);
      posts[f].w.push(x);
    }
  }
  indexed = n;
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
  /** The title you rated good that contributed most to this pick. */
  because?: Title;
  /** Discover mode: the genres and themes in it you haven't rated anything from yet. */
  frontier?: string[];
  /** Discover mode: close to things you liked, even though it's new ground. */
  close?: boolean;
}

/** The last result for each ratings map, so screens asking with the same ratings and hidden titles share one pass. */
const recent = new WeakMap<Map<string, Rating>, { key: string; size: number; recs: Rec[] }>();

export function recommend(ratings: Map<string, Rating>, dismissed: Set<string>, type?: MediaType): Rec[] {
  const key = [...dismissed].sort().join('|');
  let hit = recent.get(ratings);
  if (!hit || hit.key !== key || hit.size !== CATALOG.length) {
    hit = { key, size: CATALOG.length, recs: score(ratings, dismissed) };
    recent.set(ratings, hit);
  }
  return type ? hit.recs.filter((r) => r.title.type === type) : hit.recs;
}

function score(ratings: Map<string, Rating>, dismissed: Set<string>): Rec[] {
  const rated = [...ratings.values()].map((r) => ({ t: BY_ID.get(r.id)!, w: pull(r), good: r.verdict === 'good' }));
  if (!rated.length) return [];
  index();
  const N = CATALOG.length;
  const scale = Math.sqrt(rated.length);
  const total = new Float64Array(N);
  // Each title's three biggest pulls from titles you liked, biggest first.
  const top = new Float64Array(N * 3);
  const best = new Float64Array(N);
  const because = new Int32Array(N).fill(-1);
  const dot = new Float64Array(N);
  const touched: number[] = [];

  rated.forEach((r, ri) => {
    // Dot product of this rated title with every title that shares a feature with it.
    const v = vec(r.t);
    for (const [k, x] of v.w) {
      const p = posts[FEATURE.get(k)!];
      for (let j = 0; j < p.t.length; j++) {
        const i = p.t[j];
        if (!dot[i]) touched.push(i);
        dot[i] += x * p.w[j];
      }
    }
    for (const i of touched) {
      const s = dot[i] / (norms[i] * v.norm);
      dot[i] = 0;
      if (s < 0.15) continue;
      const c = s * s * r.w;
      if (c > 0) {
        let k = i * 3;
        let x = c;
        for (let j = 0; j < 3; j++, k++) if (x > top[k]) [top[k], x] = [x, top[k]];
      } else total[i] += c;
      if (r.good && c > best[i]) {
        best[i] = c;
        because[i] = ri;
      }
    }
    touched.length = 0;
  });

  const out: Rec[] = [];
  for (let i = 0; i < N; i++) {
    total[i] += top[i * 3] + 0.5 * top[i * 3 + 1] + 0.25 * top[i * 3 + 2];
    if (total[i] <= 0) continue;
    const t = CATALOG[i];
    if (ratings.has(t.id) || dismissed.has(t.id)) continue;
    const prior = 0.04 * (1 - i / N);
    out.push({ title: t, score: total[i] / scale + prior, because: because[i] >= 0 ? rated[because[i]].t : undefined });
  }
  return out.sort((a, b) => b.score - a.score);
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

const MIX = 300;
/** Titles from your last few feeds are five times less likely to come up again soon. */
const SEEN = Math.log(0.2);
/** Two titles this alike (same franchise, same director and kind of film) count as more of the same. */
const ALIKE = 0.45;
/** Each title already in the feed that's alike makes the next one this much less likely. */
const REPEAT = Math.log(0.35);
/** The first page of a feed: titles like ones you just said you're not interested in stay out of it. */
export const FIRST_PAGE = 8;

/**
 * Your picks in a new order for each seed. Each next card is drawn at random with odds that grow
 * with the square of its score, so strong matches lead most feeds without always being the same
 * ones. Titles in `seen` (shown in recent feeds) sit lower. To keep the feed varied, a title alike
 * to ones already in it (or picked because of the same favorite, by the same director or network,
 * or sharing a main genre with the last few shown) is pushed back. Titles alike to any in `avoid`
 * (ones you marked not interested, most recent first) stay out of the next page of cards and sit
 * lower after it. `start` is the feed so far, kept as it is (the cards you've already scrolled past).
 */
export function shuffle(recs: Rec[], seed: number, seen: Set<string> = new Set(), avoid: string[] = [], start: Rec[] = []): Rec[] {
  const max = recs[0]?.score || 1;
  const kept = new Set(start.map((r) => r.title.id));
  const avoided = avoid.slice(0, 30).map((id) => BY_ID.get(id)).filter((t): t is Title => !!t);
  const left = recs.slice(0, MIX).filter((r) => !kept.has(r.title.id)).map((r) => ({
    r,
    k: 2 * Math.log(Math.max(1e-6, r.score / max)) + gumbel(seed, r.title.id) + (seen.has(r.title.id) ? SEEN : 0),
    alike: 0,
    shunned: avoided.some((t) => related(t, r.title)),
  }));
  const because = new Map<string, number>();
  const creators = new Map<string, number>();
  const out: Rec[] = [];
  const add = (r: Rec) => {
    if (r.because) because.set(r.because.id, (because.get(r.because.id) ?? 0) + 1);
    if (r.title.creator) creators.set(r.title.creator, (creators.get(r.title.creator) ?? 0) + 1);
    // Variety matters most near the top; further down, skip the cost of comparing.
    if (out.length < 60) for (const x of left) if (similarity(r.title, x.r.title) >= ALIKE) x.alike++;
    out.push(r);
  };
  for (const r of start) add(r);
  while (left.length) {
    const recent = out.slice(-3).map((r) => r.title.genres[0]);
    // The next page's worth of cards (the first page, for a new feed) leaves out titles like ones you hid.
    const early = out.length < start.length + FIRST_PAGE && left.some((x) => !x.shunned);
    let best = -1;
    let bestScore = -Infinity;
    left.forEach((x, i) => {
      if (early && x.shunned) return;
      let s = x.k + REPEAT * Math.min(4, x.alike) + Math.log(0.6) * ((because.get(x.r.because?.id ?? '') ?? 0) + (creators.get(x.r.title.creator) ?? 0));
      if (recent.includes(x.r.title.genres[0])) s += Math.log(0.75);
      if (x.shunned) s += Math.log(0.25);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    const [{ r }] = left.splice(best, 1);
    add(r);
  }
  return [...out, ...recs.slice(MIX).filter((r) => !kept.has(r.title.id))];
}

const THEMES = new Set(UNIVERSE.themes);

/**
 * Discover mode: well-known titles from genres and themes you haven't rated anything in.
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
    // Genres you rate a lot are home turf and make a title feel less new.
    const familiar = t.genres.reduce((s, g) => s + Math.min(1, (seenGenres.get(g) ?? 0) / home), 0) / t.genres.length;
    const novelty = newGenres.length + 0.6 * newThemes.length + 0.5 * (1 - familiar);
    const known = 1 - ORDER.get(t.id)! / N;
    const f = Math.max(0, (fit.get(t.id) ?? 0) / maxFit);
    const score = novelty * (0.15 + known * known) * (0.6 + 0.8 * f) * (t.image ? 1 : 0.5);
    pool.push({ title: t, score, close: f >= 0.35, frontier: [...newGenres, ...newThemes].slice(0, 3) });
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
