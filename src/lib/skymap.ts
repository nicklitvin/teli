import raw from '../data/map.json';
import type { Title } from '../types';
import { CATALOG, GENRE_COLORS, ORDER, SHIPPED_COUNT } from './catalog';

/**
 * The sky: every title placed so similar ones sit together (built offline by
 * scripts/build-map.mjs). Positions run 0–1 on both axes. Neighbourhoods are the clusters the
 * build found, each with a name, a colour from its main genre and a centre.
 */
export interface Hood { id: number; label: string; color: string; x: number; y: number; n: number }

const MAP = raw as { n: number; clusters: ({ label: string; genre: string; x: number; y: number; n: number } | null)[]; points: string };
const SCALE = 65535;
/** The map lines up with the catalog by position; if they've drifted apart, there's no map until it's rebuilt. */
export const HAS_MAP = MAP.n === SHIPPED_COUNT;

export const HOODS: Hood[] = MAP.clusters.flatMap((c, id) =>
  c ? [{ id, label: c.label, color: GENRE_COLORS[c.genre] ?? '#8C8C8C', x: c.x / SCALE, y: c.y / SCALE, n: c.n }] : []);
const HOOD_BY_ID = new Map(HOODS.map((h) => [h.id, h]));
export const hoodOf = (i: number) => HOOD_BY_ID.get(sky.c[i]);

export const sky = { x: new Float32Array(0), y: new Float32Array(0), c: new Uint8Array(0), n: 0 };

(() => {
  if (!HAS_MAP) return;
  const bin = atob(MAP.points);
  const n = MAP.n;
  sky.x = new Float32Array(n);
  sky.y = new Float32Array(n);
  sky.c = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 5;
    sky.x[i] = (bin.charCodeAt(o) | (bin.charCodeAt(o + 1) << 8)) / SCALE;
    sky.y[i] = (bin.charCodeAt(o + 2) | (bin.charCodeAt(o + 3) << 8)) / SCALE;
    sky.c[i] = bin.charCodeAt(o + 4);
  }
  sky.n = n;
})();

const hash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
};

/**
 * Titles added by hand aren't on the built map, so each goes next to the catalog titles most like
 * it: same director or network if there are any, otherwise the best-known titles sharing its genres.
 */
function place(t: Title): [number, number, number] {
  const shipped = CATALOG.slice(0, sky.n);
  let near = t.creator ? shipped.filter((c) => c.creator === t.creator && c.type === t.type) : [];
  if (!near.length) {
    const key = t.genres.slice(0, 2).join('|');
    near = shipped.filter((c) => c.type === t.type && c.genres.slice(0, 2).join('|') === key).slice(0, 40);
  }
  if (!near.length) near = shipped.filter((c) => c.genres.includes(t.genres[0])).slice(0, 40);
  if (!near.length) return [0.5, 0.5, HOODS[0]?.id ?? 0];
  const idx = near.map((c) => ORDER.get(c.id)!);
  const xs = idx.map((i) => sky.x[i]).sort((a, b) => a - b);
  const ys = idx.map((i) => sky.y[i]).sort((a, b) => a - b);
  const a = hash(t.id) * Math.PI * 2;
  return [xs[xs.length >> 1] + Math.cos(a) * 0.004, ys[ys.length >> 1] + Math.sin(a) * 0.004, sky.c[idx[0]]];
}

/** The part of the map that holds nearly everything (the outermost 1% left out), for fitting it to the screen. */
export const EXTENT = (() => {
  if (!sky.n) return { x: 0.5, y: 0.5, w: 1, h: 1 };
  const xs = Array.from(sky.x).sort((a, b) => a - b);
  const ys = Array.from(sky.y).sort((a, b) => a - b);
  const [x0, x1, y0, y1] = [xs[Math.floor(sky.n * 0.01)], xs[Math.floor(sky.n * 0.99)], ys[Math.floor(sky.n * 0.01)], ys[Math.floor(sky.n * 0.99)]];
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
})();

/** Makes sure every title in the catalog (hand-added ones join at the end) has a spot. */
export function syncSky() {
  if (!HAS_MAP || sky.n === CATALOG.length) return;
  const n = CATALOG.length;
  const grow = <T extends Float32Array | Uint8Array>(a: T, make: (n: number) => T) => {
    const b = make(n);
    b.set(a);
    return b;
  };
  sky.x = grow(sky.x, (k) => new Float32Array(k));
  sky.y = grow(sky.y, (k) => new Float32Array(k));
  sky.c = grow(sky.c, (k) => new Uint8Array(k));
  for (let i = sky.n; i < n; i++) [sky.x[i], sky.y[i], sky.c[i]] = place(CATALOG[i]);
  sky.n = n;
  grid = null;
}

// ---- Finding the title under a tap: a coarse grid over the map ----
const G = 160;
let grid: number[][] | null = null;
function buildGrid() {
  grid = Array.from({ length: G * G }, () => []);
  for (let i = 0; i < sky.n; i++) {
    const gx = Math.min(G - 1, Math.max(0, Math.floor(sky.x[i] * G)));
    const gy = Math.min(G - 1, Math.max(0, Math.floor(sky.y[i] * G)));
    grid[gy * G + gx].push(i);
  }
  return grid;
}

/** Titles within `r` (in map units) of a point, nearest first. */
export function near(x: number, y: number, r: number): number[] {
  const g = grid ?? buildGrid();
  const out: [number, number][] = [];
  const x0 = Math.max(0, Math.floor((x - r) * G));
  const x1 = Math.min(G - 1, Math.floor((x + r) * G));
  const y0 = Math.max(0, Math.floor((y - r) * G));
  const y1 = Math.min(G - 1, Math.floor((y + r) * G));
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      for (const i of g[gy * G + gx]) {
        const d = Math.hypot(sky.x[i] - x, sky.y[i] - y);
        if (d <= r) out.push([d, i]);
      }
    }
  }
  return out.sort((a, b) => a[0] - b[0]).map(([, i]) => i);
}

/** The middle and extent of a set of titles (ignoring the farthest tenth), for flying the view to them. */
export function frame(ids: number[]): { x: number; y: number; w: number; h: number } | null {
  if (!ids.length) return null;
  const xs = ids.map((i) => sky.x[i]).sort((a, b) => a - b);
  const ys = ids.map((i) => sky.y[i]).sort((a, b) => a - b);
  const lo = Math.floor(ids.length * 0.05);
  const hi = Math.max(lo, Math.ceil(ids.length * 0.95) - 1);
  return { x: xs[ids.length >> 1], y: ys[ids.length >> 1], w: xs[hi] - xs[lo], h: ys[hi] - ys[lo] };
}
