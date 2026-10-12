import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MediaType, Rating, Sentiment } from '../types';
import { BY_ID, resolveId } from './catalog';
import { SENTIMENTS, scoreFor } from './ranking';

type Buckets = Record<Sentiment, string[]>;

export interface Data {
  /** Per type, per reaction: title ids ordered best → worst. */
  ranks: Record<MediaType, Buckets>;
  watchlist: string[];
  dismissed: string[];
}

const KEY = 'teli:data:v1';
const TYPES: MediaType[] = ['movie', 'tv'];

const emptyBuckets = (): Buckets => ({ liked: [], fine: [], disliked: [] });
export const emptyData = (): Data => ({
  ranks: { movie: emptyBuckets(), tv: emptyBuckets() },
  watchlist: [],
  dismissed: [],
});

/** Accepts anything (localStorage, imported file) and returns a valid Data, dropping unknown ids. */
export function sanitize(x: unknown): Data {
  const d = emptyData();
  const src = (x ?? {}) as Partial<Data>;
  const seen = new Set<string>();
  for (const type of TYPES) {
    for (const s of SENTIMENTS) {
      const arr = src.ranks?.[type]?.[s];
      if (!Array.isArray(arr)) continue;
      d.ranks[type][s] = arr.map((id) => (typeof id === 'string' ? resolveId(id) : id)).filter((id): id is string => {
        if (typeof id !== 'string' || seen.has(id) || BY_ID.get(id)?.type !== type) return false;
        seen.add(id);
        return true;
      });
    }
  }
  const ids = (a: unknown) =>
    Array.isArray(a)
      ? [...new Set(a.filter((id): id is string => typeof id === 'string').map(resolveId).filter((id) => BY_ID.has(id)))]
      : [];
  d.watchlist = ids(src.watchlist).filter((id) => !seen.has(id));
  d.dismissed = ids(src.dismissed);
  return d;
}

export const rankedCount = (d: Data) =>
  TYPES.reduce((n, type) => n + SENTIMENTS.reduce((m, s) => m + d.ranks[type][s].length, 0), 0);

/** Parses an exported backup file; throws if it isn't one or holds nothing we recognize. */
export function parseBackup(text: string): Data {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('ranks' in parsed)) throw new Error('not a backup');
  const d = sanitize(parsed);
  if (!rankedCount(d) && !d.watchlist.length) throw new Error('empty backup');
  return d;
}

function load(): Data {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return sanitize(JSON.parse(s));
  } catch {
    /* storage unavailable or corrupt — start fresh */
  }
  return emptyData();
}

function withoutRanked(d: Data, id: string): Data {
  const strip = (b: Buckets): Buckets => ({
    liked: b.liked.filter((x) => x !== id),
    fine: b.fine.filter((x) => x !== id),
    disliked: b.disliked.filter((x) => x !== id),
  });
  return { ...d, ranks: { movie: strip(d.ranks.movie), tv: strip(d.ranks.tv) } };
}

export function computeRatings(d: Data): Map<string, Rating> {
  const m = new Map<string, Rating>();
  for (const type of TYPES) {
    const b = d.ranks[type];
    const total = b.liked.length + b.fine.length + b.disliked.length;
    let rank = 0;
    for (const s of SENTIMENTS) {
      b[s].forEach((id, i) => {
        m.set(id, { id, type, sentiment: s, score: scoreFor(i, b[s].length, s), rank: ++rank, total });
      });
    }
  }
  return m;
}

interface Store {
  data: Data;
  ratings: Map<string, Rating>;
  /** Insert `id` into its type's `sentiment` bucket at `index` (bucket indices exclude `id` itself). */
  place(id: string, sentiment: Sentiment, index: number): void;
  unrate(id: string): void;
  toggleWatchlist(id: string): void;
  toggleDismissed(id: string): void;
  replace(d: Data): void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* quota / private mode — keep working in memory */
    }
  }, [data]);

  const place = useCallback((id: string, sentiment: Sentiment, index: number) => {
    const t = BY_ID.get(id);
    if (!t) return;
    setData((prev) => {
      const d = withoutRanked(prev, id);
      const arr = [...d.ranks[t.type][sentiment]];
      arr.splice(Math.max(0, Math.min(index, arr.length)), 0, id);
      d.ranks[t.type] = { ...d.ranks[t.type], [sentiment]: arr };
      d.watchlist = d.watchlist.filter((x) => x !== id);
      d.dismissed = d.dismissed.filter((x) => x !== id);
      return d;
    });
  }, []);

  const unrate = useCallback((id: string) => setData((prev) => withoutRanked(prev, id)), []);

  const toggleWatchlist = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      watchlist: prev.watchlist.includes(id) ? prev.watchlist.filter((x) => x !== id) : [id, ...prev.watchlist],
      dismissed: prev.dismissed.filter((x) => x !== id),
    }));
  }, []);

  const toggleDismissed = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      dismissed: prev.dismissed.includes(id) ? prev.dismissed.filter((x) => x !== id) : [...prev.dismissed, id],
      watchlist: prev.watchlist.filter((x) => x !== id),
    }));
  }, []);

  const ratings = useMemo(() => computeRatings(data), [data]);

  const value = useMemo(
    () => ({ data, ratings, place, unrate, toggleWatchlist, toggleDismissed, replace: setData }),
    [data, ratings, place, unrate, toggleWatchlist, toggleDismissed],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
