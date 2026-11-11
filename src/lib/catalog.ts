import raw from '../data/catalog.json';
import images from '../data/images.json';
import aliases from '../data/aliases.json';
import type { Title } from '../types';

const IMAGES = images as unknown as Record<string, Title['image']>;
/** How many titles ship in the catalog; hand-added ones go after these. */
export const SHIPPED_COUNT = (raw as Title[]).length;
export const CATALOG: Title[] = (raw as Title[]).map((t) => (IMAGES[t.id] ? { ...t, image: IMAGES[t.id] } : t));
export const BY_ID = new Map(CATALOG.map((t) => [t.id, t]));
const ALIASES = aliases as Record<string, string>;
/** Hand-added titles that a catalog update now has, pointing at the real entry. */
const CUSTOM_ALIAS = new Map<string, string>();
/** Ids of duplicate entries that were merged away (or hand-added titles the catalog now has) point at the entry that was kept. */
export const resolveId = (id: string) => ALIASES[id] ?? CUSTOM_ALIAS.get(id) ?? id;
/** Position in the catalog file — used as a weak popularity prior. */
export const ORDER = new Map(CATALOG.map((t, i) => [t.id, i]));

export const GENRES: string[] = (() => {
  const counts = new Map<string, number>();
  for (const t of CATALOG) for (const g of t.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
})();

export const GENRE_COLORS: Record<string, string> = {
  Action: '#F24822', Adventure: '#FF8C1A', Animation: '#FFC700', Comedy: '#FF7262',
  Crime: '#5551FF', Documentary: '#8C8C8C', Drama: '#0D99FF', Family: '#0ACF83',
  Fantasy: '#A259FF', History: '#B07B4F', Horror: '#9B2148', Music: '#FF4FB8',
  Musical: '#D96BE0', Mystery: '#1ABCFE', Reality: '#FFA629', Romance: '#FF5C8A',
  'Sci-Fi': '#00B8A9', Sports: '#14AE5C', Thriller: '#4B3FB8', War: '#7A8A3A', Western: '#C9772F',
};

// Recognizable titles used to bootstrap a brand-new user's ratings.
const STARTER_NAMES = [
  'The Dark Knight', 'Breaking Bad', 'Inception', 'The Office', 'Interstellar', 'Stranger Things',
  'Pulp Fiction', 'Friends', 'Parasite', 'Game of Thrones', 'Spirited Away', 'The Godfather',
  'Toy Story', 'Succession', 'Barbie', 'Oppenheimer', 'The Bear', 'Forrest Gump', 'Severance',
  'Titanic', 'The Matrix', 'Ted Lasso', 'Avengers: Endgame', 'The Social Network', 'Fleabag',
  'La La Land', 'Get Out', 'The Last of Us', 'Squid Game', 'Dune', 'Parks and Recreation',
  'Whiplash', 'The Sopranos', 'Shrek', 'Everything Everywhere All at Once', 'Mad Max: Fury Road',
];
export const STARTERS: Title[] = STARTER_NAMES
  .map((n) => CATALOG.find((t) => t.title === n))
  .filter((t): t is Title => !!t);

// ---- Titles added by hand ----
// Something missing from the catalog can be added from search. It's saved with your data (so
// backups and crewmates carry it) under a "u-" id, and joins the catalog for the session. When a
// catalog update ships the same title (same type and name, year within a year or two), the
// hand-added one merges into it and everything saved under its id moves across.

/** Where your data is saved; read here too so hand-added titles are in the catalog before anything else is built from it. */
export const DATA_KEY = 'teli:data:v2';

const plain = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const SHIPPED = new Map<string, Title[]>();
for (const t of CATALOG) {
  const k = `${t.type}:${plain(t.title)}`;
  SHIPPED.set(k, [...(SHIPPED.get(k) ?? []), t]);
}

/** The catalog's own entry for this title, if it has one. */
export function findShipped(type: Title['type'], title: string, year: number): Title | undefined {
  return SHIPPED.get(`${type}:${plain(title)}`)?.find((t) => Math.abs(t.year - year) <= (type === 'tv' ? 2 : 1));
}

export const isCustom = (id: string) => id.startsWith('u-');
export const customId = (type: Title['type'], title: string, year: number) =>
  `u-${type === 'movie' ? 'm' : 't'}-${plain(title).replace(/ /g, '-').slice(0, 100).replace(/-$/, '') || 'untitled'}-${year}`;
export const MAX_YEAR = new Date().getFullYear() + 1;

/** A hand-added title from storage, a backup or a crewmate, checked field by field; null if it isn't one. */
export function cleanCustom(x: unknown): Title | null {
  const t = (x ?? {}) as Partial<Title>;
  if (typeof t.id !== 'string' || !/^u-[mt]-[a-z0-9-]{1,140}$/.test(t.id)) return null;
  if (t.type !== 'movie' && t.type !== 'tv') return null;
  const title = typeof t.title === 'string' ? t.title.trim().slice(0, 120) : '';
  if (!title || !Number.isInteger(t.year) || t.year! < 1870 || t.year! > MAX_YEAR) return null;
  const genres = Array.isArray(t.genres) ? [...new Set(t.genres.filter((g) => typeof g === 'string' && g in GENRE_COLORS))].slice(0, 3) : [];
  const creator = typeof t.creator === 'string' ? t.creator.trim().slice(0, 80) : '';
  return { id: t.id, title, year: t.year!, type: t.type, genres, tags: [], creator };
}

/**
 * Adds hand-made titles to the catalog for this session and returns the ones that are still
 * hand-made. Any the catalog now has itself are left out, and their ids point at the real entry.
 */
export function addCustom(list: Title[]): Title[] {
  const kept: Title[] = [];
  for (const t of list) {
    const real = findShipped(t.type, t.title, t.year);
    if (real) {
      CUSTOM_ALIAS.set(t.id, real.id);
      continue;
    }
    if (!BY_ID.has(t.id)) {
      ORDER.set(t.id, CATALOG.length);
      CATALOG.push(t);
      BY_ID.set(t.id, t);
    }
    if (!kept.some((k) => k.id === t.id)) kept.push(BY_ID.get(t.id)!);
  }
  return kept;
}

try {
  const saved = JSON.parse(localStorage.getItem(DATA_KEY) ?? '{}') as { custom?: unknown };
  if (Array.isArray(saved.custom)) addCustom(saved.custom.map(cleanCustom).filter((t) => !!t));
} catch {
  /* storage unavailable or corrupt; the store starts fresh too */
}

export function typeLabel(t: Title) {
  return t.type === 'movie' ? 'Movie' : 'TV Show';
}

export function metaLine(t: Title, genres = 2) {
  return [t.year, typeLabel(t), t.genres.slice(0, genres).join(', ')].filter(Boolean).join(' · ');
}
