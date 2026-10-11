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

export const exploredCount = (ratings: Map<string, Rating>) =>
  new Set([...ratings.keys()].flatMap((id) => BY_ID.get(id)!.genres)).size;

export interface Bubble { genre: string; x: number; y: number; r: number }

/**
 * Packs genre bubbles into a tight cluster. Each starts at its spot on the catalog map, so related
 * genres end up side by side, then gravity pulls everything in while collisions keep bubbles apart.
 */
export function bubbleLayout(sizes: { genre: string; r: number }[]): { bubbles: Bubble[]; box: [number, number, number, number] } {
  const nodes = sizes.map(({ genre, r }) => {
    const p = POSITIONS.get(genre)!;
    return { genre, r, x: (p.x - MAP_W / 2) * 0.8, y: (p.y - MAP_H / 2) * 0.8 };
  });
  const idx = new Map(nodes.map((n, i) => [n.genre, i]));
  const links = EDGES.filter((e) => idx.has(e.a) && idx.has(e.b));
  const GAP = 5;
  const steps = 360;
  for (let it = 0; it < steps; it++) {
    const alpha = Math.max(0, 1 - it / (steps - 60)); // the last 60 steps only settle collisions
    for (const n of nodes) {
      n.x -= n.x * 0.05 * alpha;
      n.y -= n.y * 0.07 * alpha; // squash vertically: the canvas is wider than tall
    }
    for (const e of links) {
      const a = nodes[idx.get(e.a)!];
      const b = nodes[idx.get(e.b)!];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(Math.hypot(dx, dy), 0.1);
      const k = ((d - a.r - b.r - GAP) / d) * 0.04 * e.w * alpha;
      if (k <= 0) continue;
      a.x += dx * k; a.y += dy * k;
      b.x -= dx * k; b.y -= dy * k;
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.max(Math.hypot(dx, dy), 0.1);
          const overlap = a.r + b.r + GAP - d;
          if (overlap <= 0) continue;
          // The smaller bubble gives way more, so big genres stay near the middle.
          const wa = b.r / (a.r + b.r);
          a.x -= (dx / d) * overlap * wa; a.y -= (dy / d) * overlap * wa;
          b.x += (dx / d) * overlap * (1 - wa); b.y += (dy / d) * overlap * (1 - wa);
        }
      }
    }
  }
  const x0 = Math.min(...nodes.map((n) => n.x - n.r));
  const x1 = Math.max(...nodes.map((n) => n.x + n.r));
  const y0 = Math.min(...nodes.map((n) => n.y - n.r));
  const y1 = Math.max(...nodes.map((n) => n.y + n.r));
  return { bubbles: nodes, box: [x0, y0, x1 - x0, y1 - y0] };
}

/** Unexplored genres ranked by how close they sit to what you already watch, with the reason why. */
export function nextGenres(stats: Map<string, GenreStat>): { genre: string; via: string[] }[] {
  const out: { genre: string; via: string[]; score: number }[] = [];
  for (const s of stats.values()) {
    if (s.rated.length) continue;
    const links = EDGES
      .filter((e) => e.a === s.genre || e.b === s.genre)
      .map((e) => {
        const other = e.a === s.genre ? e.b : e.a;
        return { other, v: e.w * Math.sqrt(stats.get(other)!.rated.length) };
      })
      .filter((l) => l.v > 0)
      .sort((a, b) => b.v - a.v);
    out.push({ genre: s.genre, via: links.slice(0, 2).map((l) => l.other), score: links.reduce((n, l) => n + l.v, 0) });
  }
  return out.sort((a, b) => b.score - a.score);
}

export const genreTitles = (g: string): Title[] => CATALOG.filter((t) => t.genres.includes(g));
