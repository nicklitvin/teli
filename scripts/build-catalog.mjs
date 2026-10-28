// Compiles data/catalog.txt (hand-written) plus data/wikidata.json (from `npm run wikidata`)
// into src/data/catalog.json. Hand-written entries win when both have the same title.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'data/catalog.txt'), 'utf8');

const GENRES = new Set([
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family',
  'Fantasy', 'History', 'Horror', 'Music', 'Musical', 'Mystery', 'Reality', 'Romance',
  'Sci-Fi', 'Sports', 'Thriller', 'War', 'Western',
]);

const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const out = [];
const ids = new Set();
let errors = 0;

src.split(/\r?\n/).forEach((line, i) => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const parts = line.split('|').map((p) => p.trim());
  if (parts.length !== 6) {
    console.error(`line ${i + 1}: expected 6 fields, got ${parts.length}: ${line}`);
    errors++;
    return;
  }
  const [title, yearStr, kind, genres, tags, creator] = parts;
  const year = Number(yearStr);
  const type = kind === 'M' ? 'movie' : kind === 'T' ? 'tv' : null;
  if (!type || !Number.isInteger(year)) {
    console.error(`line ${i + 1}: bad year/type: ${line}`);
    errors++;
    return;
  }
  const g = genres.split(',').map((s) => s.trim()).filter(Boolean);
  for (const x of g) {
    if (!GENRES.has(x)) {
      console.error(`line ${i + 1}: unknown genre "${x}"`);
      errors++;
    }
  }
  const id = `${type === 'movie' ? 'm' : 't'}-${slug(title)}-${year}`;
  if (ids.has(id)) {
    console.error(`line ${i + 1}: duplicate id ${id}`);
    errors++;
    return;
  }
  ids.add(id);
  out.push({
    id,
    title,
    year,
    type,
    genres: g,
    tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
    creator,
  });
});

if (errors) {
  console.error(`${errors} error(s); catalog not written.`);
  process.exit(1);
}
const curated = out.length;

// ---- Wikidata titles ----
// Themes that are too clinical or too vague to show as a taste-map bubble.
const DROP_THEME = new Set([
  'incest', 'rape and revenge', 'prostitution', 'human pregnancy', 'erotic', 'erotic thriller', 'suicide', 'girls with guns',
  'hood', 'arthouse science', 'live-action/animated', 'flashback', 'youth', 'love', 'romantic love', 'human', 'film',
  'television', 'death', 'sexuality', 'human sexuality', 'violence', 'pornographic', 'sexploitation', 'nudity',
]);
const SAME_THEME = { 'police television drama': 'police procedural', 'satirical': 'satire', 'espionage': 'spy', 'female buddy': 'buddy' };
// Match networks to the short names the hand-written list uses.
const SAME_CREATOR = {
  'American Broadcasting Company': 'ABC', 'Fox Broadcasting Company': 'Fox', 'Seoul Broadcasting System': 'SBS', 'SBS TV': 'SBS',
  'Munhwa Broadcasting Corporation': 'MBC', 'MBC TV': 'MBC', 'Korean Broadcasting System': 'KBS', 'KBS 2TV': 'KBS2',
  'Amazon Prime Video': 'Prime Video', 'Apple TV': 'Apple TV+', 'Fuji Television': 'Fuji TV', 'Nippon Television': 'Nippon TV',
  'USA Network': 'USA', 'broadcast syndication': 'Syndication', 'British Broadcasting Corporation': 'BBC', 'BBC One': 'BBC',
  'CBC Television': 'CBC', 'NHK General TV': 'NHK', 'CTV Television Network': 'CTV', 'HBO Max': 'Max', 'ITV1': 'ITV',
};

const key = (t) => `${t.type}:${slug(t.title)}`;
const byTitle = new Map();
for (const t of out) {
  if (!byTitle.has(key(t))) byTitle.set(key(t), []);
  byTitle.get(key(t)).push(t.year);
}
let wd = [];
try {
  wd = JSON.parse(readFileSync(join(root, 'data/wikidata.json'), 'utf8'));
} catch {
  console.log('No data/wikidata.json yet: run `npm run wikidata` to add thousands more titles.');
}
// Two entries with the same Wikipedia image are the same title under different names
// (Se7en / Seven, Kill Bill: Vol. 1 / Volume 1), so the later one is dropped. Its id is kept
// as an alias, so rankings saved under it move to the surviving entry.
const IMAGES_FILE = join(root, 'src/data/images.json');
const images = existsSync(IMAGES_FILE) ? JSON.parse(readFileSync(IMAGES_FILE, 'utf8')) : {};
const byImage = new Map();
for (const t of out) if (images[t.id] && !byImage.has(images[t.id][0])) byImage.set(images[t.id][0], t.id);
const aliases = {};

// Different titles can share an id (Big Brother, American and British, both from 2000). The
// one already in the catalog keeps it, matched by network or director so saved ratings stay
// put; the others get the qualifier from their article name ("…-british") or their network.
const CATALOG_FILE = join(root, 'src/data/catalog.json');
const prevCreator = new Map(existsSync(CATALOG_FILE) ? JSON.parse(readFileSync(CATALOG_FILE, 'utf8')).map((t) => [t.id, t.creator]) : []);
const sameId = new Map();
for (const w of wd) sameId.set(w.id, [...(sameId.get(w.id) ?? []), w]);
for (const [id, group] of sameId) {
  if (group.length < 2) continue;
  const keep = group.find((w) => (SAME_CREATOR[w.creator] ?? w.creator) === prevCreator.get(id)) ?? group[0];
  const taken = new Set([id]);
  for (const w of group) {
    if (w === keep) continue;
    const paren = /\(([^)]*)\)\s*$/.exec(w.wiki ?? '')?.[1] ?? '';
    const words = slug(paren).split('-').filter((x) => x && !/^(?:tv|series|serial|miniseries|film|\d{4})$/.test(x)).join('-');
    let next = `${id}-${words || slug(SAME_CREATOR[w.creator] ?? w.creator) || 'b'}`;
    // Say which one it is in the name too ("Big Brother (British)"), or the two look the same in a list.
    if (words) w.title = `${w.title} (${paren.replace(/\s*(?:TV series|TV serial|serial|series|miniseries|film|\d{4})\s*/gi, ' ').trim()})`;
    while (taken.has(next)) next += '-2';
    taken.add(next);
    w.id = next;
  }
}

for (const w of wd) {
  if (w.year > new Date().getFullYear()) continue; // announced, not out yet
  if (/\bseason \d+$/i.test(w.title)) continue; // single seasons of a show
  const same = images[w.id] && byImage.get(images[w.id][0]);
  if (same) {
    if (same !== w.id) aliases[w.id] = same;
    continue;
  }
  // Shows are often dated by their pilot on Wikidata (Columbo: 1968 vs 1971), so allow more slack.
  if ((byTitle.get(key(w)) ?? []).some((y) => Math.abs(y - w.year) <= (w.type === 'tv' ? 3 : 1))) continue;
  if (ids.has(w.id)) continue;
  ids.add(w.id);
  if (images[w.id]) byImage.set(images[w.id][0], w.id);
  out.push({
    id: w.id,
    title: w.title,
    year: w.year,
    type: w.type,
    genres: w.genres,
    tags: [...new Set(w.tags.map((x) => SAME_THEME[x] ?? x).filter((x) => !DROP_THEME.has(x.toLowerCase())))],
    creator: SAME_CREATOR[w.creator] ?? w.creator,
  });
}

// One title per line keeps diffs readable without bloating the file.
const json = '[\n' + out.map((t) => JSON.stringify(t)).join(',\n') + '\n]\n';
writeFileSync(join(root, 'src/data/catalog.json'), json);
writeFileSync(join(root, 'src/data/aliases.json'), JSON.stringify(aliases, null, 1) + '\n');
const movies = out.filter((t) => t.type === 'movie').length;
console.log(`Merged ${Object.keys(aliases).length} duplicates into existing titles`);
console.log(`Wrote ${out.length} titles (${curated} hand-written, ${out.length - curated} from Wikidata; ${movies} movies, ${out.length - movies} shows), ${(json.length / 1024).toFixed(1)} KB`);
