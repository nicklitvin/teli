// Lays every catalog title out on a 2D map where similar titles sit together, like Mikey
// Guinness's movie map (mikeyguinness.com/projects/movie-map): each title becomes a vector of
// its genres, themes, director or network, era and type; UMAP flattens those to 2D; k-means on
// the flattened map finds neighbourhoods, each named after what its titles share.
//
//   npm run map   # after `npm run catalog`; writes src/data/map.json
//
// The output lines up with src/data/catalog.json by position, so rebuild it whenever the catalog
// changes (the app checks the count and leaves the map empty if they disagree).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { UMAP } from 'umap-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'src/data/catalog.json'), 'utf8'));
const N = catalog.length;

// Seeded random numbers, so the same catalog always gives the same map.
let seed = 20261110;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

// ---- Features: sparse blocks, weighted so genre and theme drive similarity more than era ----
const count = (f) => {
  const m = new Map();
  for (const t of catalog) for (const k of f(t)) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};
const tagCount = count((t) => t.tags);
const creatorCount = count((t) => (t.creator ? [t.creator] : []));
const genreList = [...count((t) => t.genres).keys()];
const tagList = [...tagCount].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 1500).map(([k]) => k);
const creatorList = [...creatorCount].filter(([, n]) => n >= 3).map(([k]) => k);
const index = new Map();
const add = (k) => index.set(k, index.size);
for (const g of genreList) add(`g:${g}`);
for (const k of tagList) add(`t:${k}`);
for (const k of creatorList) add(`c:${k}`);
const DECADES = Array.from({ length: 14 }, (_, i) => 1900 + i * 10);
for (const d of DECADES) add(`d:${d}`);
add('type:tv');

const W = { g: 1.0, t: 0.75, c: 0.55, d: 0.35, type: 0.45 };
function features(t) {
  const f = new Map();
  const block = (keys, w) => {
    const ks = keys.filter((k) => index.has(k));
    // Spread a block's weight over its entries, so a title with 6 themes isn't 6x as "themey".
    for (const k of ks) f.set(index.get(k), w / Math.sqrt(ks.length));
  };
  block(t.genres.map((g) => `g:${g}`), W.g);
  // Rare themes say more than common ones.
  const tags = t.tags.filter((k) => index.has(`t:${k}`));
  for (const k of tags) f.set(index.get(`t:${k}`), (W.t * Math.log(N / tagCount.get(k))) / 6 / Math.sqrt(tags.length));
  if (t.creator && index.has(`c:${t.creator}`)) f.set(index.get(`c:${t.creator}`), W.c);
  // Era: the title's decade, with some of it spilling into the neighbouring ones.
  const d = Math.min(DECADES.length - 1, Math.max(0, Math.floor((t.year - 1900) / 10)));
  f.set(index.get(`d:${DECADES[d]}`), W.d);
  if (d > 0) f.set(index.get(`d:${DECADES[d - 1]}`), W.d * 0.35);
  if (d < DECADES.length - 1) f.set(index.get(`d:${DECADES[d + 1]}`), W.d * 0.35);
  if (t.type === 'tv') f.set(index.get('type:tv'), W.type);
  return f;
}

// ---- Random projection to 96 dense dimensions (keeps distances, much faster than PCA here) ----
const D = 96;
const proj = Array.from({ length: index.size }, () => Float32Array.from({ length: D }, () => gauss() / Math.sqrt(D)));
const vectors = catalog.map((t) => {
  const v = new Float64Array(D);
  for (const [i, w] of features(t)) for (let j = 0; j < D; j++) v[j] += proj[i][j] * w;
  return Array.from(v);
});
console.log(`${N} titles, ${index.size} features → ${D} dims`);

// ---- UMAP to 2D ----
const t0 = Date.now();
const umap = new UMAP({ nComponents: 2, nNeighbors: 18, minDist: 0.35, spread: 1.4, random: rand });
const epochs = umap.initializeFit(vectors);
for (let e = 0; e < epochs; e++) {
  umap.step();
  if (e % 100 === 0) console.log(`  umap epoch ${e}/${epochs} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const xy = umap.getEmbedding();
console.log(`umap done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

// Stand the map up: turn it so its long side runs top to bottom, to suit a phone screen.
{
  const mx = xy.reduce((a, p) => a + p[0], 0) / N;
  const my = xy.reduce((a, p) => a + p[1], 0) / N;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of xy) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  const long = 0.5 * Math.atan2(2 * sxy, sxx - syy); // angle of the long axis
  const turn = Math.PI / 2 - long;
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  for (const p of xy) {
    const [x, y] = [p[0] - mx, p[1] - my];
    p[0] = x * c - y * s;
    p[1] = x * s + y * c;
  }
}

// Titles with near-identical features land on top of each other. Nudge apart anything closer
// than a dot's width, a few rounds over a grid, so tight clumps open up into readable patches.
{
  const xs0 = xy.map((p) => p[0]).sort((a, b) => a - b);
  const ys0 = xy.map((p) => p[1]).sort((a, b) => a - b);
  const span0 = Math.max(xs0[Math.floor(N * 0.998)] - xs0[Math.floor(N * 0.002)], ys0[Math.floor(N * 0.998)] - ys0[Math.floor(N * 0.002)]);
  const gap = span0 * 0.0032;
  for (let round = 0; round < 40; round++) {
    const cells = new Map();
    const cell = (x, y) => `${Math.floor(x / gap)},${Math.floor(y / gap)}`;
    xy.forEach((p, i) => {
      const k = cell(p[0], p[1]);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(i);
    });
    let moved = 0;
    for (let i = 0; i < N; i++) {
      const [x, y] = xy[i];
      const cx = Math.floor(x / gap);
      const cy = Math.floor(y / gap);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const j of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (j <= i) continue;
            let ddx = xy[j][0] - xy[i][0];
            let ddy = xy[j][1] - xy[i][1];
            let d = Math.hypot(ddx, ddy);
            if (d >= gap) continue;
            if (d < 1e-9) { const a = rand() * Math.PI * 2; ddx = Math.cos(a); ddy = Math.sin(a); d = 1; }
            const push = ((gap - Math.min(d, gap)) / 2) * 0.5;
            const ux = ddx / d;
            const uy = ddy / d;
            xy[i][0] -= ux * push; xy[i][1] -= uy * push;
            xy[j][0] += ux * push; xy[j][1] += uy * push;
            moved++;
          }
        }
      }
    }
    if (moved < N / 200) break;
  }
}

// ---- Neighbourhoods: k-means on the map itself, so each one is a patch you can see ----
const K = Math.round(Math.sqrt(N / 10));
const dist2 = (a, b) => {
  let s = 0;
  for (let j = 0; j < 2; j++) s += (a[j] - b[j]) ** 2;
  return s;
};
// k-means++ start
const cents = [xy[Math.floor(rand() * N)].slice()];
const best = new Float64Array(N).fill(Infinity);
while (cents.length < K) {
  let total = 0;
  for (let i = 0; i < N; i++) {
    best[i] = Math.min(best[i], dist2(xy[i], cents[cents.length - 1]));
    total += best[i];
  }
  let r = rand() * total;
  let i = 0;
  for (; i < N - 1 && r > best[i]; i++) r -= best[i];
  cents.push(xy[i].slice());
}
const cluster = new Uint16Array(N);
for (let it = 0; it < 25; it++) {
  let moved = 0;
  for (let i = 0; i < N; i++) {
    let bi = 0;
    let bd = Infinity;
    for (let c = 0; c < K; c++) {
      const d = dist2(xy[i], cents[c]);
      if (d < bd) { bd = d; bi = c; }
    }
    if (cluster[i] !== bi) { cluster[i] = bi; moved++; }
  }
  const sums = Array.from({ length: K }, () => new Float64Array(2));
  const ns = new Uint32Array(K);
  for (let i = 0; i < N; i++) {
    ns[cluster[i]]++;
    for (let j = 0; j < 2; j++) sums[cluster[i]][j] += xy[i][j];
  }
  for (let c = 0; c < K; c++) if (ns[c]) cents[c] = Array.from(sums[c], (s) => s / ns[c]);
  if (moved < N / 1000) break;
}

// Each neighbourhood is named after what sets it apart: its most over-represented genre and theme.
const genreTotal = count((t) => t.genres);
const groups = Array.from({ length: K }, () => []);
for (let i = 0; i < N; i++) groups[cluster[i]].push(i);
const lift = (members, keysOf, totals, minShare) => {
  const m = new Map();
  for (const i of members) for (const k of keysOf(catalog[i])) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m]
    .filter(([, n]) => n / members.length >= minShare)
    .map(([k, n]) => [k, (n / members.length) / (totals.get(k) / N) * (n / members.length)])
    .sort((a, b) => b[1] - a[1]);
};
const named = new Map();
const clusters = groups.map((members) => {
  if (!members.length) return null;
  const g = lift(members, (t) => t.genres, genreTotal, 0.3).slice(0, 2).map(([k]) => k);
  const theme = lift(members, (t) => t.tags, tagCount, 0.2)[0]?.[0];
  const tv = members.filter((i) => catalog[i].type === 'tv').length / members.length;
  const years = members.map((i) => catalog[i].year).sort((a, b) => a - b);
  const era = years[Math.floor(years.length / 2)];
  let label = theme ? `${g[0] ?? 'Mixed'} · ${theme[0].toUpperCase()}${theme.slice(1)}` : g.join(' & ') || 'Mixed';
  if (tv > 0.7 && !/series|show/i.test(label)) label += ' shows';
  // Two neighbourhoods with the same name get told apart by era.
  if (named.has(label)) label += ` (${Math.floor(era / 10) * 10}s)`;
  named.set(label, true);
  // Label sits at the middle of the densest part (median, so stragglers don't drag it off).
  const xs = members.map((i) => xy[i][0]).sort((a, b) => a - b);
  const ys = members.map((i) => xy[i][1]).sort((a, b) => a - b);
  return { label, genre: g[0] ?? 'Drama', x: xs[xs.length >> 1], y: ys[ys.length >> 1], n: members.length };
});

// ---- Pack: x, y as 16-bit ints over the bounding box, cluster as 8-bit; base64 ----
const xsAll = xy.map((p) => p[0]).sort((a, b) => a - b);
const ysAll = xy.map((p) => p[1]).sort((a, b) => a - b);
// Trim the farthest 0.2% so a few far-flung strays don't squash everything else.
const lo = (a) => a[Math.floor(a.length * 0.002)];
const hi = (a) => a[Math.floor(a.length * 0.998)];
const [x0, x1, y0, y1] = [lo(xsAll), hi(xsAll), lo(ysAll), hi(ysAll)];
const span = Math.max(x1 - x0, y1 - y0);
const q = (v, a) => Math.max(0, Math.min(65535, Math.round(((v - a) / span) * 60000 + 2767)));
const buf = Buffer.alloc(N * 5);
for (let i = 0; i < N; i++) {
  buf.writeUInt16LE(q(xy[i][0], x0), i * 5);
  buf.writeUInt16LE(q(xy[i][1], y0), i * 5 + 2);
  buf.writeUInt8(cluster[i], i * 5 + 4);
}
const out = {
  n: N,
  clusters: clusters.map((c) => (c ? { label: c.label, genre: c.genre, x: q(c.x, x0), y: q(c.y, y0), n: c.n } : null)),
  points: buf.toString('base64'),
};
writeFileSync(join(root, 'src/data/map.json'), JSON.stringify(out) + '\n');
console.log(`Wrote src/data/map.json: ${K} neighbourhoods, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
for (const c of clusters.filter(Boolean).sort((a, b) => b.n - a.n).slice(0, 12)) console.log(`  ${c.n}\t${c.label}`);
