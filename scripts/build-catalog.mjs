// Compiles data/catalog.txt into src/data/catalog.json.
import { readFileSync, writeFileSync } from 'node:fs';
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

// One title per line keeps diffs readable without bloating the file.
const json = '[\n' + out.map((t) => JSON.stringify(t)).join(',\n') + '\n]\n';
writeFileSync(join(root, 'src/data/catalog.json'), json);
const movies = out.filter((t) => t.type === 'movie').length;
console.log(`Wrote ${out.length} titles (${movies} movies, ${out.length - movies} shows), ${(json.length / 1024).toFixed(1)} KB`);
