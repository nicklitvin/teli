// Pulls well-known films and TV series from Wikidata into data/wikidata.json, which
// build-catalog.mjs merges with the hand-written data/catalog.txt.
//
// "Well-known" means the title has an English Wikipedia article and articles in many
// other languages (Wikidata "sitelinks"), which works well as a popularity signal. Shows
// get a second way in: plenty of popular ones (reality, British panel shows, new streaming
// series) are only written up in a few languages, so a show with fewer sitelinks still
// counts if its English article gets enough page views. Anime series without an article of
// their own come in under the article of the manga they're based on.
// Like the image script, this only runs when you rebuild the catalog; the app itself
// never calls Wikidata.
//
//   npm run wikidata             # films and shows
//   npm run wikidata -- --only tv  # just shows, keeping the films already in data/wikidata.json
//
// Titles already in data/wikidata.json keep their ids, and none are dropped, so ratings
// saved under them stay attached.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'data/wikidata.json');
const UA = 'TeliCatalogBuilder/0.4 (https://github.com/nicklitvin/teli)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KINDS = {
  movie: { classes: ['wd:Q11424'], minLinks: 20, date: 'P577', creator: 'P57' },
  // TV series, miniseries, animated series (old and new class), anime series, television
  // programs (most reality and game shows), web series, entertainment programs.
  // Shows with 3–9 sitelinks need `minViews` English page views a day.
  tv: {
    classes: ['wd:Q5398426', 'wd:Q1259759', 'wd:Q581714', 'wd:Q117467246', 'wd:Q63952888', 'wd:Q15416', 'wd:Q526877', 'wd:Q1407245'],
    minLinks: 10, floorLinks: 3, minViews: 120, date: 'P580', creator: 'P449',
  },
};
const ANIME = 'wd:Q63952888';
// What an anime can borrow an article from: manga, light novels, manhwa, webtoons (not novels or games).
const SOURCES = ['wd:Q21198342', 'wd:Q104213567', 'wd:Q865484', 'wd:Q74262765', 'wd:Q7978994', 'wd:Q213369'];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];

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
    ?item wdt:P31 ?cls; wikibase:sitelinks ?sl. FILTER(?sl >= ${k.floorLinks ?? k.minLinks})
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

/** item → values of one property, for a list of items (in batches, so big lists don't time out). */
async function propertyOf(items, prop) {
  const m = new Map();
  for (let i = 0; i < items.length; i += 400) {
    const rows = await sparql(`SELECT ?item ?v WHERE { VALUES ?item { ${items.slice(i, i + 400).map((q) => 'wd:' + q).join(' ')} } ?item wdt:${prop} ?v. }`);
    for (const r of rows) {
      const id = qid(r.item.value);
      if (!m.has(id)) m.set(id, []);
      m.get(id).push(r.v.value);
    }
  }
  return m;
}

/** Average daily views over the last 60 days for English Wikipedia articles. */
async function pageviews(titles) {
  const out = new Map();
  const list = [...titles];
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const alias = new Map();
    let cont = {};
    for (let guard = 0; guard < 60; guard++) {
      const params = new URLSearchParams({
        action: 'query', format: 'json', formatversion: '2', prop: 'pageviews', pvipdays: '60', redirects: '1', titles: batch.join('|'), ...cont,
      });
      let j;
      for (let attempt = 1; ; attempt++) {
        const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { 'User-Agent': UA } });
        if (res.ok) { j = await res.json(); break; }
        if (attempt < 5) { await sleep(2000 * attempt); continue; }
        throw new Error(`Wikipedia ${res.status}`);
      }
      for (const n of [...(j.query?.normalized ?? []), ...(j.query?.redirects ?? [])]) alias.set(n.to, n.from);
      for (const p of j.query?.pages ?? []) {
        if (!p.pageviews) continue;
        let t = p.title;
        for (let hops = 0; alias.has(t) && hops < 3; hops++) t = alias.get(t);
        out.set(t, Object.values(p.pageviews).reduce((a, b) => a + (b ?? 0), 0) / 60);
      }
      if (!j.continue) break;
      cont = j.continue;
    }
    if ((i / 50) % 50 === 49) console.log(`  page views: ${i + 50}/${list.length}`);
  }
  return out;
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
  ['Drama', /drama|melodrama|soap opera|tragedy|limited-run/],
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

const articleOf = (uri) => decodeURIComponent(uri.replace('https://en.wikipedia.org/wiki/', '')).replace(/_/g, ' ');

/** Shows: everything with a few sitelinks, then page views decide for the ones with fewer than `minLinks`. */
async function showCandidates(k) {
  const rows = await sparql(`SELECT ?item ?article (MAX(?sl) AS ?links) WHERE { ${scope(k)} } GROUP BY ?item ?article`);
  const base = rows.map((r) => ({ item: qid(r.item.value), wiki: articleOf(r.article.value), links: Number(r.links.value) }));
  // Anime series with no English article of their own, written up in their manga's article instead.
  const anime = await sparql(`SELECT ?item ?src ?article (MAX(?sl) AS ?links) WHERE {
    VALUES ?kind { ${SOURCES.join(' ')} }
    ?item wdt:P31 ${ANIME}; wdt:P144 ?src. ?src wdt:P31 ?kind.
    FILTER NOT EXISTS { ?own schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }
    ?src wikibase:sitelinks ?sl. FILTER(?sl >= ${k.floorLinks})
    ?article schema:about ?src; schema:isPartOf <https://en.wikipedia.org/>.
  } GROUP BY ?item ?src ?article`);
  const have = new Set(base.map((b) => b.wiki));
  for (const r of anime) {
    const wiki = articleOf(r.article.value);
    if (!have.has(wiki)) base.push({ item: qid(r.item.value), src: qid(r.src.value), wiki, links: Number(r.links.value) });
  }
  // Anime with a small article of their own: most readers go to the manga's article, so count those views too.
  const sourced = await sparql(`SELECT ?item ?article WHERE {
    VALUES ?kind { ${SOURCES.join(' ')} }
    ?item wdt:P31 ${ANIME}; wdt:P144 ?src. ?src wdt:P31 ?kind.
    ?own schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>.
    ?article schema:about ?src; schema:isPartOf <https://en.wikipedia.org/>.
  }`);
  const srcWiki = new Map(sourced.map((r) => [qid(r.item.value), articleOf(r.article.value)]));
  const few = base.filter((b) => b.links < k.minLinks);
  const toCheck = [...new Set(few.flatMap((b) => (srcWiki.has(b.item) ? [b.wiki, srcWiki.get(b.item)] : [b.wiki])))];
  console.log(`tv: ${base.length} candidates (${anime.length} anime via their manga); checking page views for ${toCheck.length}`);
  const views = await pageviews(toCheck);
  const viewsOf = (b) => Math.max(views.get(b.wiki) ?? 0, srcWiki.has(b.item) ? views.get(srcWiki.get(b.item)) ?? 0 : 0);
  const kept = base.filter((b) => b.links >= k.minLinks || viewsOf(b) >= k.minViews);
  // Popularity for ordering: sitelinks, or what the page views are worth in sitelinks (500 a day ≈ 10).
  for (const b of kept) b.pop = b.links >= k.minLinks ? b.links : Math.max(b.links, Math.round(10 * Math.sqrt(viewsOf(b) / 500)));
  console.log(`tv: kept ${kept.length}`);
  return kept;
}

const out = [];
for (const [type, k] of Object.entries(KINDS)) {
  if (only && only !== type) {
    out.push(...previous.filter((t) => t.type === type));
    continue;
  }
  console.log(`${type}: querying…`);
  const base = type === 'tv' ? await showCandidates(k)
    : (await sparql(`SELECT ?item ?article (MAX(?sl) AS ?links) WHERE { ${scope(k)} } GROUP BY ?item ?article`))
      .map((r) => ({ item: qid(r.item.value), wiki: articleOf(r.article.value), links: Number(r.links.value) }));
  const get = type === 'tv' ? (prop) => propertyOf([...new Set(base.flatMap((b) => (b.src ? [b.item, b.src] : [b.item])))], prop) : (prop) => property(k, prop);
  const dates = await get(k.date);
  const pub = type === 'tv' ? await get('P577') : new Map();
  const genres = await get('P136');
  const classes = type === 'tv' ? await get('P31') : new Map();
  const subjects = await get('P921');
  const series = await get('P179');
  const creators = await get(k.creator);
  const ids = new Set();
  for (const m of [genres, subjects, series, creators]) for (const v of m.values()) for (const u of v) ids.add(qid(u));
  const L = await labels(ids);
  console.log(`${type}: ${base.length} titles, ${ids.size} labels`);

  const seen = new Set();
  for (const b of base) {
    const { item, wiki } = b;
    if (seen.has(item)) continue;
    seen.add(item);
    const title = wiki.replace(/\s*\([^)]*\)\s*$/, '');
    const years = [...(dates.get(item) ?? []), ...(pub.get(item) ?? [])].map((d) => Number(d.slice(0, 4))).filter((y) => y > 1900);
    if (!years.length) continue;
    const year = Math.min(...years);
    // An anime without its own genres borrows its manga's.
    const genreIds = genres.get(item) ?? (b.src ? genres.get(b.src) : undefined) ?? [];
    const glabels = genreIds.map((u) => L.get(qid(u))).filter(Boolean).map((s) => s.toLowerCase());
    if (type === 'tv' && glabels.length && glabels.every((g) => SKIP_TV.test(g))) continue;
    const g = RULES.filter(([, re]) => glabels.some((l) => re.test(l))).map(([name]) => name);
    // Shows with no usable genre: animated ones are still Animation, miniseries are Drama.
    if (!g.length && type === 'tv') {
      const cls = (classes.get(item) ?? []).map(qid);
      if (cls.some((c) => ['Q581714', 'Q117467246', 'Q63952888'].includes(c))) g.push('Animation');
      else if (cls.includes('Q1259759')) g.push('Drama');
    }
    if (!g.length) continue;
    // Animated features are usually tagged "animated film" plus little else; give them Family.
    if (type === 'movie' && g.length === 1 && g[0] === 'Animation') g.push('Family');
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
      links: b.links,
      ...(b.pop !== undefined && b.pop !== b.links ? { pop: b.pop } : {}),
    });
  }
}

// Keep ids stable: a title whose article was already imported keeps its old id (its year or
// name may have been corrected since), several anime seasons on one manga article become one
// title, and titles that dropped out this time stay in.
const before = new Map(previous.map((t) => [`${t.type}:${t.wiki}`, t]));
const byArticle = new Map();
for (const t of out) {
  const key = `${t.type}:${t.wiki}`;
  const old = before.get(key);
  if (old) t.id = old.id;
  const other = byArticle.get(key);
  if (!other) byArticle.set(key, t);
  else if (t.year < other.year && !old) byArticle.set(key, { ...t, id: other.id });
}
const merged = [...byArticle.values()];
const kept = new Set(merged.map((t) => `${t.type}:${t.wiki}`));
for (const t of previous) if (!kept.has(`${t.type}:${t.wiki}`)) merged.push(t);

merged.sort((a, b) => (b.pop ?? b.links) - (a.pop ?? a.links));
writeFileSync(OUT, '[\n' + merged.map((t) => JSON.stringify(t)).join(',\n') + '\n]\n');
const added = merged.length - previous.length;
console.log(`Wrote ${merged.length} titles to data/wikidata.json (${added >= 0 ? '+' : ''}${added})`);
