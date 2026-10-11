import type { Rating, Title } from '../types';
import { BY_ID, CATALOG, GENRES } from './catalog';

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// How often genres appear together across the whole catalog. This fixes the map's shape,
// so genres keep their place as you rate and only their size and color change.
const TOTAL = new Map<string, number>();
const CO = new Map<string, number>();
for (const t of CATALOG) {
  t.genres.forEach((g, i) => {
    TOTAL.set(g, (TOTAL.get(g) ?? 0) + 1);
    for (const h of t.genres.slice(i + 1)) CO.set(pairKey(g, h), (CO.get(pairKey(g, h)) ?? 0) + 1);
  });
}

export interface GenreEdge { a: string; b: string; /** Association strength, 0–1. */ w: number }

/** Genre pairs that commonly go together, scored like cosine similarity so big genres don't dominate. */
export const EDGES: GenreEdge[] = (() => {
  const raw = [...CO.entries()].map(([k, n]) => {
    const [a, b] = k.split('|');
    return { a, b, w: n / Math.sqrt(TOTAL.get(a)! * TOTAL.get(b)!) };
  }).filter((e) => e.w >= 0.07);
  const max = Math.max(...raw.map((e) => e.w));
  return raw.map((e) => ({ ...e, w: e.w / max })).sort((x, y) => y.w - x.w);
})();

export const MAP_W = 360;
export const MAP_H = 420;

/** Deterministic force-directed layout: related genres pull together, everything else pushes apart. */
export const POSITIONS: Map<string, { x: number; y: number }> = (() => {
  const n = GENRES.length;
  const idx = new Map(GENRES.map((g, i) => [g, i]));
  const p = GENRES.map((_, i) => ({ x: Math.cos((i / n) * 2 * Math.PI) * 120, y: Math.sin((i / n) * 2 * Math.PI) * 140 }));
  const steps = 600;
  for (let it = 0; it < steps; it++) {
    const alpha = 1 - it / steps;
    const f = p.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = p[i].x - p[j].x;
        const dy = p[i].y - p[j].y;
        const d = Math.max(Math.hypot(dx, dy), 1);
        const push = 3000 / (d * d);
        f[i].x += (dx / d) * push; f[i].y += (dy / d) * push;
        f[j].x -= (dx / d) * push; f[j].y -= (dy / d) * push;
      }
    }
    for (const e of EDGES) {
      const i = idx.get(e.a)!;
      const j = idx.get(e.b)!;
      const dx = p[j].x - p[i].x;
      const dy = p[j].y - p[i].y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const pull = (d - 60) * 0.025 * e.w;
      f[i].x += (dx / d) * pull; f[i].y += (dy / d) * pull;
      f[j].x -= (dx / d) * pull; f[j].y -= (dy / d) * pull;
    }
    for (let i = 0; i < n; i++) {
      f[i].x -= p[i].x * 0.012;
      f[i].y -= p[i].y * 0.009; // a bit looser vertically to suit a tall phone screen
      p[i].x += Math.max(-8, Math.min(8, f[i].x * alpha * 4));
      p[i].y += Math.max(-8, Math.min(8, f[i].y * alpha * 4));
    }
  }
  // Scale the result to fill the canvas, leaving room for the biggest node and its label.
  const pad = { x: 44, top: 40, bottom: 52 };
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const q = p.map((v) => ({
    x: pad.x + ((v.x - x0) / (x1 - x0 || 1)) * (MAP_W - 2 * pad.x),
    y: pad.top + ((v.y - y0) / (y1 - y0 || 1)) * (MAP_H - pad.top - pad.bottom),
  }));
  // Then nudge apart anything closer than a node plus its label, staying inside the canvas.
  const MIN = 82;
  const SQUASH = 1.25; // labels sit under nodes, so vertical neighbours need more room
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = q[i].x - q[j].x;
        const dy = (q[i].y - q[j].y) * SQUASH;
        const d = Math.max(Math.hypot(dx, dy), 0.1);
        if (d >= MIN) continue;
        const k = ((MIN - d) / d) * 0.25;
        q[i].x += dx * k; q[i].y += (dy * k) / SQUASH;
        q[j].x -= dx * k; q[j].y -= (dy * k) / SQUASH;
      }
    }
    for (const v of q) {
      v.x = Math.max(pad.x, Math.min(MAP_W - pad.x, v.x));
      v.y = Math.max(pad.top, Math.min(MAP_H - pad.bottom, v.y));
    }
  }
  return new Map(GENRES.map((g, i) => [g, q[i]]));
})();

export interface GenreStat {
  genre: string;
  /** Your ranked titles in this genre, best first. */
  rated: Rating[];
  avg: number;
  /** Titles in the catalog with this genre. */
  catalog: number;
}

export function genreStats(ratings: Map<string, Rating>): Map<string, GenreStat> {
  const m = new Map<string, GenreStat>(GENRES.map((g) => [g, { genre: g, rated: [], avg: 0, catalog: TOTAL.get(g) ?? 0 }]));
  for (const r of ratings.values()) for (const g of BY_ID.get(r.id)!.genres) m.get(g)?.rated.push(r);
  for (const s of m.values()) {
    s.rated.sort((a, b) => b.score - a.score);
    s.avg = s.rated.length ? s.rated.reduce((n, r) => n + r.score, 0) / s.rated.length : 0;
  }
  return m;
}

/** Genre pairs you've watched together, e.g. Crime + Drama from Breaking Bad. */
export function yourEdges(ratings: Map<string, Rating>): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of ratings.keys()) {
    const gs = BY_ID.get(id)!.genres;
    gs.forEach((g, i) => gs.slice(i + 1).forEach((h) => m.set(pairKey(g, h), (m.get(pairKey(g, h)) ?? 0) + 1)));
  }
  return m;
}

export const exploredCount = (ratings: Map<string, Rating>) =>
  new Set([...ratings.keys()].flatMap((id) => BY_ID.get(id)!.genres)).size;

/** Genres most often paired with `g`, strongest first. */
export function neighbors(g: string, limit = 5): string[] {
  return EDGES.filter((e) => e.a === g || e.b === g).slice(0, limit).map((e) => (e.a === g ? e.b : e.a));
}

export const genreTitles = (g: string): Title[] => CATALOG.filter((t) => t.genres.includes(g));
