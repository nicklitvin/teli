import type { MediaType, Title } from '../types';
import { CATALOG } from './catalog';

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

interface Entry {
  t: Title;
  title: string;
  compact: string;
  words: string[];
  acronym: string;
  extra: string;
  order: number;
}

const INDEX: Entry[] = CATALOG.map((t, order) => {
  const title = normalize(t.title);
  return {
    t,
    title,
    compact: title.replace(/ /g, ''),
    words: title.split(' '),
    acronym: title.split(' ').map((w) => w[0]).join(''),
    extra: normalize([t.creator, ...t.genres, ...t.tags.map((x) => x.replace(/-/g, ' '))].join(' ')),
    order,
  };
});

function scoreEntry(e: Entry, q: string, tokens: string[]): number {
  if (e.title === q) return 100;
  if (e.title.startsWith(q)) return 80;
  if (e.words.some((w) => w.startsWith(q))) return 65;
  if (e.title.includes(q)) return 50;
  const qc = q.replace(/ /g, '');
  if (qc.length > 2 && e.compact.includes(qc)) return 45;
  if (tokens.length === 1 && q.length > 2 && e.acronym.includes(q)) return 40; // "lotr", "gotg"
  // Every token must match somewhere: title words, year, director/network, genres or tags.
  let s = 0;
  for (const tok of tokens) {
    if (e.words.some((w) => w.startsWith(tok))) s += 6;
    else if (String(e.t.year) === tok) s += 5;
    else if (e.extra.includes(tok)) s += 3;
    else return 0;
  }
  return 10 + s;
}

export function search(query: string, opts: { type?: MediaType; genre?: string } = {}, limit = 80): Title[] {
  const q = normalize(query);
  const filtered = INDEX.filter(
    (e) => (!opts.type || e.t.type === opts.type) && (!opts.genre || e.t.genres.includes(opts.genre)),
  );
  if (!q) return filtered.slice(0, limit).map((e) => e.t);
  const tokens = q.split(' ');
  return filtered
    .map((e) => ({ e, s: scoreEntry(e, q, tokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.order - b.e.order)
    .slice(0, limit)
    .map((x) => x.e.t);
}
