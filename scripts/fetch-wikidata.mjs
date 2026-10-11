// Pulls well-known films and TV series from Wikidata into data/wikidata.json, which
// build-catalog.mjs merges with the hand-written data/catalog.txt.
//
// "Well-known" means the title has an English Wikipedia article and articles in many
// other languages (Wikidata "sitelinks"), which works well as a popularity signal.
// Like the image script, this only runs when you rebuild the catalog; the app itself
// never calls Wikidata.
//
//   npm run wikidata
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'TeliCatalogBuilder/0.3 (https://github.com/nicklitvin/teli)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KINDS = {
  movie: { classes: ['wd:Q11424'], minLinks: 20, date: 'P577', creator: 'P57' },
  // TV series, miniseries, animated series, anime series
  tv: { classes: ['wd:Q5398426', 'wd:Q1259759', 'wd:Q581714', 'wd:Q63952888'], minLinks: 10, date: 'P580', creator: 'P449' },
};

async function sparql(query) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query }),
    });
    if (res.ok) return (await res.json()).results.bindings;
    if (attempt < 5 && (res.status === 429 || res.status >= 500)) {
      await sleep(4000 * attempt);
      continue;
    }
    throw new Error(`Wikidata ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

const qid = (uri) => uri.slice(uri.lastIndexOf('/') + 1);

function scope(k) {
  return `VALUES ?cls { ${k.classes.join(' ')} }
    ?item wdt:P31 ?cls; wikibase:sitelinks ?sl. FILTER(?sl >= ${k.minLinks})
    ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>.`;
}

/** item → values of one property, for every title in scope. */
async function property(k, prop) {
  const rows = await sparql(`SELECT DISTINCT ?item ?v WHERE { ${scope(k)} ?item wdt:${prop} ?v. }`);
  const m = new Map();
  for (const r of rows) {
    const id = qid(r.item.value);
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(r.v.value);
  }
  return m;
}

async function labels(ids) {
  const out = new Map();
  const list = [...ids];
  for (let i = 0; i < list.length; i += 1500) {
    const rows = await sparql(`SELECT ?x ?l WHERE { VALUES ?x { ${list.slice(i, i + 1500).map((q) => 'wd:' + q).join(' ')} }
      ?x rdfs:label ?l. FILTER(LANG(?l) = "en") }`);
    for (const r of rows) out.set(qid(r.x.value), r.l.value);
  }
  return out;
}

// Wikidata has hundreds of fine-grained genres ("heist film", "space opera"). Each maps onto
// Teli's 21 broad genres by keyword, and the specific ones are also kept as theme tags.
const RULES = [
  ['Musical', /musical/],
  ['Music', /\bmusic\b|concert|rockumentary|music video/],
  ['Action', /action|martial arts|superhero|swashbuckler|disaster|spy|wuxia|kung fu|samurai/],
  ['Adventure', /adventure|swashbuckler|sword-and-sandal|survival/],
  ['Animation', /anim|anime|cartoon|stop-motion|claymation/],
  ['Comedy', /comedy|comedic|sitcom|parody|satire|satirical|mockumentary|slapstick|sketch/],
  ['Crime', /crime|gangster|heist|police|detective|noir|legal|mafia|procedural|caper|prison/],
  ['Documentary', /documentary|docuseries/],
  ['Drama', /drama|melodrama|soap opera|tragedy/],
  ['Family', /family|children|kids/],
  ['Fantasy', /fantasy|fairy tale|sword and sorcery|supernatural|magic/],
  ['History', /histor|period piece|biograph|biopic|costume|peplum|epic film/],
  ['Horror', /horror|slasher|zombie|vampire|monster|splatter|found footage|werewolf|ghost/],
  ['Mystery', /mystery|whodunit|detective/],
  ['Reality', /reality|game show|talent show|dating show|competition/],
  ['Romance', /romance|romantic/],
  ['Sci-Fi', /science fiction|sci-fi|cyberpunk|space opera|dystopia|post-apocalyptic|time travel|tokusatsu|mecha|kaiju|alien invasion|apocalyptic/],
  ['Sports', /sport|boxing|baseball|football|basketball|wrestling|racing/],
  ['Thriller', /thriller|suspense|spy|conspiracy|psychological horror/],
  ['War', /\bwar\b|world war|military|anti-war/],
  ['Western', /western/],
];
// Broad labels that only restate a genre, so they make poor themes.
const PLAIN = /^(?:(?:action|adventure|animated|anime|comedy|crime|documentary|drama|family|fantasy|historical|horror|musical|music|mystery|reality|romance|romantic|science fiction|sports?|thriller|war|western|television|feature|live-action|children's|teen)\s*)+(?:film|series|television series|television program|show|fiction|genre|story|movie|anime|works?)?$/;
const SKIP_TV = /talk show|news|award ceremony|variety show|sports broadcast|late-night|morning show|television special/;

// Format and production labels ("silent film", "3D film") describe how a title was made, not what it's about.
const NOT_THEME = /^(?:silent|independent|black-and-white|3d|imax|short|feature|speculative|live-action|remake|sequel|prequel|anthology|television|serial|web|cinéma vérité|art|experimental|exploitation|b|direct-to-video)$/;
const SAME = { 'lgbt-related': 'LGBTQ', 'lgbtq-related': 'LGBTQ', 'lgbtq+-related': 'LGBTQ', 'time-travel': 'time travel', dystopian: 'dystopia', 'utopian and dystopian': 'dystopia', biographical: 'biopic', noir: 'neo-noir', 'buddy cop': 'buddy', 'coming of age': 'coming-of-age' };

function themeOf(label) {
  if (/anime and manga/.test(label)) return '';
  const t = label
    .replace(/\b(?:films?|movies?|television series|tv series|television programs?|series|fiction|genre)\b/g, '')
    .replace(/\s+/g, ' ').trim();
  return NOT_THEME.test(t) ? '' : SAME[t] ?? t;
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const out = [];
for (const [type, k] of Object.entries(KINDS)) {
  console.log(`${type}: querying…`);
  const base = await sparql(`SELECT ?item ?article (MAX(?sl) AS ?links) WHERE { ${scope(k)} } GROUP BY ?item ?article`);
  const dates = await property(k, k.date);
  const pub = type === 'tv' ? await property(k, 'P577') : new Map();
  const genres = await property(k, 'P136');
  const subjects = await property(k, 'P921');
  const series = await property(k, 'P179');
  const creators = await property(k, k.creator);
  const ids = new Set();
  for (const m of [genres, subjects, series, creators]) for (const v of m.values()) for (const u of v) ids.add(qid(u));
  const L = await labels(ids);
  console.log(`${type}: ${base.length} titles, ${ids.size} labels`);

  const seen = new Set();
  for (const r of base) {
    const item = qid(r.item.value);
    if (seen.has(item)) continue;
    seen.add(item);
    const wiki = decodeURIComponent(r.article.value.replace('https://en.wikipedia.org/wiki/', '')).replace(/_/g, ' ');
    const title = wiki.replace(/\s*\([^)]*\)\s*$/, '');
    const years = [...(dates.get(item) ?? []), ...(pub.get(item) ?? [])].map((d) => Number(d.slice(0, 4))).filter((y) => y > 1900);
    if (!years.length) continue;
    const year = Math.min(...years);
    const glabels = (genres.get(item) ?? []).map((u) => L.get(qid(u))).filter(Boolean).map((s) => s.toLowerCase());
    if (type === 'tv' && glabels.length && glabels.every((g) => SKIP_TV.test(g))) continue;
    const g = RULES.filter(([, re]) => glabels.some((l) => re.test(l))).map(([name]) => name);
    if (!g.length) continue;
    // Animated features are usually tagged "animated film" plus little else; give them Family.
    if (g.length === 1 && g[0] === 'Animation') g.push('Family');
    const themes = [
      ...(series.get(item) ?? []).map((u) => L.get(qid(u))).filter(Boolean),
      ...glabels.filter((l) => !PLAIN.test(l)).map(themeOf),
      ...(subjects.get(item) ?? []).map((u) => L.get(qid(u))).filter(Boolean).map((l) => SAME[l] ?? l),
    ].filter((t) => t && t.length <= 32 && !/^Q\d+$/.test(t));
    const creator = (creators.get(item) ?? []).map((u) => L.get(qid(u))).filter(Boolean).sort()[0] ?? '';
    out.push({
      id: `${type === 'movie' ? 'm' : 't'}-${slug(title)}-${year}`,
      title, year, type,
      genres: g.slice(0, 4),
      tags: [...new Set(themes)].slice(0, 6),
      creator,
      wiki,
      links: Number(r.links.value),
    });
  }
}

out.sort((a, b) => b.links - a.links);
writeFileSync(join(root, 'data/wikidata.json'), '[\n' + out.map((t) => JSON.stringify(t)).join(',\n') + '\n]\n');
console.log(`Wrote ${out.length} titles to data/wikidata.json`);
