// Finds a poster for each title and writes src/data/images.json as { id: [path, width, height] }.
//
// Shows get their poster from TVmaze when it knows them (Wikipedia often only has a title card,
// a logo or a manga cover). Everything else gets the lead image of its Wikipedia article.
// Paths are kept short ("en/8/81/File.jpg", "tvm/1/4600.jpg"); the app turns them into
// thumbnail URLs (src/lib/catalog.ts, imageSrc) and falls back to generated art when one
// can't load. This only runs when you build the catalog; the app never calls either API.
//
//   npm run images          # look up titles that don't have an image yet
//   npm run images -- --all # look up every title again
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'src/data/images.json');
const catalog = JSON.parse(readFileSync(join(root, 'src/data/catalog.json'), 'utf8'));
const images = !process.argv.includes('--all') && existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'TeliCatalogBuilder/0.2 (https://github.com/nicklitvin/teli)';
const THUMB = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const body = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API, { method: 'POST', body, headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (attempt < 5 && (res.status === 429 || res.status >= 500)) {
      await sleep(1500 * attempt);
      continue;
    }
    throw new Error(`Wikipedia API ${res.status}`);
  }
}

const norm = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const base = (wikiTitle) => wikiTitle.replace(/\s*\([^)]*\)\s*$/, '');

function candidates(t) {
  const T = t.title;
  return t.type === 'movie'
    ? [`${T} (${t.year} film)`, `${T} (film)`, T]
    : [`${T} (TV series)`, `${T} (${t.year} TV series)`, `${T} (American TV series)`,
      `${T} (British TV series)`, `${T} (miniseries)`, T];
}

const NOT_SCREEN = /manga|novel|\bbook|comic|video game|franchise|album|\bsong\b|\bband\b|musical\b|\bplay\b|character|soundtrack|disambiguation/;

/** Is this Wikipedia page really about this title? Checks the short description for kind and year. */
function fits(t, page, specific) {
  if (!page || page.missing || page.invalid || page.pageprops?.disambiguation !== undefined) return false;
  const d = (page.description ?? '').toLowerCase();
  if (!d) return specific; // "Foo (2004 film)" is safe without a description; a bare "Foo" isn't
  if (NOT_SCREEN.test(d)) return false;
  const kind = t.type === 'movie'
    ? /\bfilm\b|\bmovie\b/.test(d) && !/\bseries\b/.test(d)
    : /series|sitcom|television|\btv\b|\bshow\b|miniseries|anime|soap opera|docuseries|programme|program/.test(d) && !/\bfilm\b/.test(d);
  if (!kind) return false;
  const years = [...d.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  return !years.length || years.some((y) => Math.abs(y - t.year) <= 1);
}

/** Looks up a batch of page titles and returns a resolver from requested title → page. */
async function lookup(titles) {
  const pages = new Map();
  const alias = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const j = await api({
      action: 'query', redirects: '1', titles: titles.slice(i, i + 50).join('|'),
      prop: 'pageimages|description|pageprops', ppprop: 'disambiguation',
      piprop: 'thumbnail', pithumbsize: String(THUMB), pilicense: 'any',
    });
    for (const n of j.query?.normalized ?? []) alias.set(n.from, n.to);
    for (const r of j.query?.redirects ?? []) alias.set(r.from, r.to);
    for (const p of j.query?.pages ?? []) pages.set(p.title, p);
  }
  return (title) => {
    let k = title;
    for (let hops = 0; alias.has(k) && hops < 3; hops++) k = alias.get(k);
    return pages.get(k);
  };
}

/** A Wikimedia file URL (the original or any thumbnail of it) as "en/8/81/File.jpg". */
function short(url) {
  const m = url.match(/\/wikipedia\/(en|commons)\/(?:thumb\/)?([0-9a-f]\/[0-9a-f]{2})\/([^/?]+)/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : null;
}


/** Pages without a page image: take the infobox `image =` field instead. */
async function infoboxImage(page) {
  const j = await api({ action: 'parse', pageid: String(page.pageid), prop: 'wikitext', section: '0' });
  const text = j.parse?.wikitext ?? '';
  const m = text.match(/\|\s*image\s*=\s*(?:\[\[)?(?:File:|Image:)?\s*([^|\]\n}<]+?\.(?:jpe?g|png|gif|svg|webp))/i);
  if (!m) return null;
  const info = await api({
    action: 'query', titles: `File:${m[1].trim()}`, prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: String(THUMB),
  });
  const ii = info.query?.pages?.[0]?.imageinfo?.[0];
  if (!ii) return null;
  return [short(ii.url), ii.width, ii.height];
}

async function imageFor(page) {
  if (page.thumbnail) return [short(page.thumbnail.source), page.thumbnail.width, page.thumbnail.height];
  return infoboxImage(page);
}

// Titles imported from Wikidata already know their exact article.
const WIKI = new Map();
try {
  for (const w of JSON.parse(readFileSync(join(root, 'data/wikidata.json'), 'utf8'))) WIKI.set(w.id, w.wiki);
} catch { /* no Wikidata import yet */ }

// Older runs stored full URLs.
for (const [id, v] of Object.entries(images)) {
  if (/^https?:/.test(v[0])) {
    const p = short(v[0]);
    if (p) images[id] = [p, v[1], v[2]];
    else delete images[id];
  }
}

// ---- TVmaze: its whole show index is a few hundred pages, so fetch it all and match locally ----
const TVM_CACHE = join(root, 'node_modules/.cache/teli-tvmaze.json');
async function tvmazeIndex() {
  try {
    const c = JSON.parse(readFileSync(TVM_CACHE, 'utf8'));
    if (Date.now() - c.at < 7 * 864e5) return c.shows;
  } catch { /* no cache yet */ }
  const shows = [];
  for (let page = 0; ; page++) {
    const res = await fetch(`https://api.tvmaze.com/shows?page=${page}`, { headers: { 'User-Agent': UA } });
    if (res.status === 404) break;
    if (res.status === 429) {
      await sleep(5000);
      page--;
      continue;
    }
    if (!res.ok) throw new Error(`TVmaze ${res.status}`);
    for (const s of await res.json()) {
      const year = Number(s.premiered?.slice(0, 4));
      const m = s.image?.medium?.match(/\/images\/[a-z_]+\/(\d+\/\d+\.\w+)$/);
      if (m && year) shows.push([s.name, year, m[1], s.weight ?? 0]);
    }
    if (page % 50 === 0) console.log(`  TVmaze index: page ${page}, ${shows.length} shows with posters`);
    await sleep(550); // they allow about 20 requests every 10 seconds
  }
  mkdirSync(dirname(TVM_CACHE), { recursive: true });
  writeFileSync(TVM_CACHE, JSON.stringify({ at: Date.now(), shows }));
  return shows;
}

{
  const exact = new Map();
  const loose = new Map();
  const add = (m, k, s) => {
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  };
  for (const s of await tvmazeIndex()) {
    add(exact, norm(s[0]), s);
    // TVmaze often names a show with its brand or subtitle: "Marvel's Daredevil",
    // "Tom Clancy's Jack Ryan", "Arcane: League of Legends".
    const bare = s[0].replace(/^[A-Z][\w.]*(?: [A-Z][\w.]*)?['’]s /, '');
    if (bare !== s[0]) add(loose, norm(bare), s);
    if (s[0].includes(':')) add(loose, norm(s[0].slice(0, s[0].indexOf(':'))), s);
  }
  // Same name and starting within a year of ours (or a few years, for an exact name); if a few
  // fit, the one more people follow.
  const pick = (m, k, years, year) =>
    (m.get(k) ?? []).filter((s) => Math.abs(s[1] - year) <= years).sort((a, b) => b[3] - a[3])[0];
  let matched = 0;
  for (const t of catalog) {
    if (t.type !== 'tv' || images[t.id]?.[0].startsWith('tvm/')) continue;
    const k = norm(t.title);
    const k2 = norm(t.title.replace(/\s*\([^)]*\)\s*$/, '')); // "The Office (UK)"
    const best = pick(exact, k, 1, t.year) ?? pick(exact, k2, 1, t.year) ?? pick(loose, k, 1, t.year)
      ?? pick(exact, k, 3, t.year);
    if (!best) continue;
    images[t.id] = [`tvm/${best[2]}`, 210, 295];
    matched++;
  }
  console.log(`TVmaze posters for ${matched} more shows`);

  // The rest may go by another name there ("Money Heist" is "La Casa de Papel"): its search knows
  // other names. Take one of the top few results that started within a year of ours.
  const SEARCH_CACHE = join(root, 'node_modules/.cache/teli-tvmaze-search.json');
  let seen = {};
  try { seen = JSON.parse(readFileSync(SEARCH_CACHE, 'utf8')); } catch { /* none yet */ }
  const left = catalog.filter((t) => t.type === 'tv' && !images[t.id]?.[0].startsWith('tvm/'));
  console.log(`searching TVmaze for ${left.length} shows by their other names`);
  let found = 0;
  for (const [i, t] of left.entries()) {
    if (!seen[t.id]) {
      const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(t.title)}`, { headers: { 'User-Agent': UA } });
      if (res.status === 429) {
        await sleep(5000);
        continue; // picked up next run
      }
      if (!res.ok) continue;
      seen[t.id] = (await res.json()).slice(0, 3).flatMap(({ score, show }) => {
        const m = show.image?.medium?.match(/\/images\/[a-z_]+\/(\d+\/\d+\.\w+)$/);
        return m && show.premiered ? [[Number(show.premiered.slice(0, 4)), m[1], score]] : [];
      });
      await sleep(550);
      if (i % 200 === 0) writeFileSync(SEARCH_CACHE, JSON.stringify(seen));
    }
    const hit = seen[t.id].find(([year, , score]) => Math.abs(year - t.year) <= 1 && score >= 0.4);
    if (hit) {
      images[t.id] = [`tvm/${hit[1]}`, 210, 295];
      found++;
    }
  }
  writeFileSync(SEARCH_CACHE, JSON.stringify(seen));
  console.log(`  found ${found} that way`);
}

const todo = catalog.filter((t) => !images[t.id]);
console.log(`${todo.length} of ${catalog.length} titles need an image`);
const found = new Map();

// Pass 0: known articles.
const known = todo.filter((t) => WIKI.has(t.id));
const resolveKnown = await lookup(known.map((t) => WIKI.get(t.id)));
for (const t of known) {
  const page = resolveKnown(WIKI.get(t.id));
  if (page && !page.missing && !page.invalid) found.set(t.id, page);
}
console.log(`found ${found.size} of ${known.length} known articles`);

// Pass 1: guess article titles for the rest, look them all up in batches of 50.
const guess = todo.filter((t) => !WIKI.has(t.id));
const resolve = await lookup([...new Set(guess.flatMap(candidates))]);
const missing = [];
for (const t of guess) {
  const cands = candidates(t);
  const page = cands.map((c, i) => [resolve(c), i < cands.length - 1]).find(([p, specific]) => fits(t, p, specific))?.[0];
  if (page) found.set(t.id, page);
  else missing.push(t);
}
console.log(`matched ${found.size} by title, searching for ${missing.length}`);

// Pass 2: full-text search for whatever the guesses missed.
for (const t of missing) {
  const j = await api({
    action: 'query', list: 'search', srnamespace: '0', srlimit: '5',
    srsearch: `${t.title} ${t.year} ${t.type === 'movie' ? 'film' : 'television series'}`,
  });
  const hits = (j.query?.search ?? []).map((s) => s.title)
    .filter((h) => { const a = norm(base(h)), b = norm(t.title); return a && b && (a.includes(b) || b.includes(a)); });
  if (!hits.length) continue;
  const r = await lookup(hits);
  const page = hits.map(r).find((p) => fits(t, p, true));
  if (page) found.set(t.id, page);
}

// Most pages already came back with a thumbnail; the rest need a couple of requests each,
// so run a few at a time.
let done = 0;
const queue = [...found];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [id, page] = next;
    try {
      const img = await imageFor(page);
      if (img?.[0]) images[id] = img;
    } catch (e) {
      console.warn(`  ${id}: ${e.message}`);
    }
    if (++done % 500 === 0) console.log(`  images: ${done}/${found.size}`);
  }
}));

// Keep only ids that still exist, in catalog order, one per line. Ids merged into another
// title (aliases.json) keep their image too: the catalog build spots those duplicates by it.
const ALIASES_FILE = join(root, 'src/data/aliases.json');
const merged = existsSync(ALIASES_FILE) ? Object.keys(JSON.parse(readFileSync(ALIASES_FILE, 'utf8'))) : [];
const ids = [...catalog.map((t) => t.id), ...merged].filter((id) => images[id]);
writeFileSync(OUT, '{\n' + ids.map((id) => `${JSON.stringify(id)}:${JSON.stringify(images[id])}`).join(',\n') + '\n}\n');
const without = catalog.filter((t) => !images[t.id]);
console.log(`Wrote ${ids.length}/${catalog.length} images. Without one: ${without.length}`);
if (without.length && without.length <= 50) console.log(without.map((t) => `  ${t.title} (${t.year})`).join('\n'));
