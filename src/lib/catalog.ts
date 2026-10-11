import raw from '../data/catalog.json';
import type { Title } from '../types';

export const CATALOG = raw as Title[];
export const BY_ID = new Map(CATALOG.map((t) => [t.id, t]));
/** Position in the catalog file — used as a weak popularity prior. */
export const ORDER = new Map(CATALOG.map((t, i) => [t.id, i]));

export const GENRES: string[] = (() => {
  const counts = new Map<string, number>();
  for (const t of CATALOG) for (const g of t.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
})();

export const GENRE_COLORS: Record<string, string> = {
  Action: '#FF3B30', Adventure: '#FF9500', Animation: '#FFCC00', Comedy: '#FF2D55',
  Crime: '#5856D6', Documentary: '#8E8E93', Drama: '#007AFF', Family: '#34C759',
  Fantasy: '#AF52DE', History: '#A2845E', Horror: '#1C1C1E', Music: '#FF6482',
  Musical: '#E85D9A', Mystery: '#30B0C7', Reality: '#FF9F0A', Romance: '#FF375F',
  'Sci-Fi': '#32ADE6', Sports: '#00C7BE', Thriller: '#3A3A8C', War: '#6E6E52', Western: '#C1803A',
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
