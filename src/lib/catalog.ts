import raw from '../data/catalog.json';
import images from '../data/images.json';
import aliases from '../data/aliases.json';
import type { Title } from '../types';

const IMAGES = images as unknown as Record<string, Title['image']>;
export const CATALOG: Title[] = (raw as Title[]).map((t) => (IMAGES[t.id] ? { ...t, image: IMAGES[t.id] } : t));
export const BY_ID = new Map(CATALOG.map((t) => [t.id, t]));
const ALIASES = aliases as Record<string, string>;
/** Ids of duplicate entries that were merged away point at the entry that was kept. */
export const resolveId = (id: string) => ALIASES[id] ?? id;
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

export function typeLabel(t: Title) {
  return t.type === 'movie' ? 'Movie' : 'TV Show';
}

export function metaLine(t: Title, genres = 2) {
  return [t.year, typeLabel(t), t.genres.slice(0, genres).join(', ')].filter(Boolean).join(' · ');
}
