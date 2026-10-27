import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Rating, Review, Verdict } from '../types';
import { BY_ID, resolveId } from './catalog';
import { TAG_LABEL, VERDICTS } from './rating';

export interface Data {
  /** Your rating for each title you've watched. */
  reviews: Record<string, Review>;
  watchlist: string[];
  dismissed: string[];
}

const KEY = 'teli:data:v2';
/** Rankings from before ratings were good / mid / bad. Read once to carry them over, then left alone. */
const OLD_KEY = 'teli:data:v1';
const OLD_VERDICT: Record<string, Verdict> = { liked: 'good', fine: 'mid', disliked: 'bad' };

export const emptyData = (): Data => ({ reviews: {}, watchlist: [], dismissed: [] });

/**
 * Accepts anything (localStorage, an imported file, a crewmate's row) and returns a valid Data,
 * dropping unknown ids and tags. Old ranked backups come in as pending reviews: liked, fine and
 * didn't like become good, mid and bad, in their old order, until you look at them again.
 */
export function sanitize(x: unknown): Data {
  const d = emptyData();
  const src = (x ?? {}) as { reviews?: unknown; ranks?: unknown; watchlist?: unknown; dismissed?: unknown };
  const add = (raw: string, r: Review) => {
    const id = resolveId(raw);
    if (BY_ID.has(id) && !d.reviews[id]) d.reviews[id] = r;
  };
  if (src.reviews && typeof src.reviews === 'object') {
    for (const [id, v] of Object.entries(src.reviews as Record<string, Partial<Review>>)) {
      if (!v || !VERDICTS.includes(v.verdict as Verdict)) continue;
      add(id, {
        verdict: v.verdict!,
        tags: Array.isArray(v.tags) ? [...new Set(v.tags.filter((t) => typeof t === 'string' && TAG_LABEL.has(t)))] : [],
        again: v.again === true,
        at: typeof v.at === 'number' && Number.isFinite(v.at) ? v.at : 0,
        ...(v.pending === true ? { pending: true } : {}),
      });
    }
  } else if (src.ranks && typeof src.ranks === 'object') {
    // Best ranked gets the latest time, so the logbook keeps the old order.
    let at = Date.now();
    for (const type of ['movie', 'tv']) {
      for (const [s, verdict] of Object.entries(OLD_VERDICT)) {
        const ids = (src.ranks as Record<string, Record<string, unknown>>)[type]?.[s];
        if (!Array.isArray(ids)) continue;
        for (const id of ids) {
          if (typeof id === 'string' && BY_ID.get(resolveId(id))?.type === type) add(id, { verdict, tags: [], again: false, at: at--, pending: true });
        }
      }
    }
  }
  const ids = (a: unknown) =>
    Array.isArray(a)
      ? [...new Set(a.filter((id): id is string => typeof id === 'string').map(resolveId).filter((id) => BY_ID.has(id)))]
      : [];
  d.watchlist = ids(src.watchlist).filter((id) => !d.reviews[id]);
  d.dismissed = ids(src.dismissed);
  return d;
}

export const ratedCount = (d: Data) => Object.keys(d.reviews).length;

/** Titles carried over from the old rankings that still need a look, best first, movies before shows. */
export const pendingIds = (d: Data) =>
  Object.entries(d.reviews).filter(([, r]) => r.pending)
    .sort(([a, x], [b, y]) => (BY_ID.get(a)!.type === BY_ID.get(b)!.type ? y.at - x.at : BY_ID.get(a)!.type === 'movie' ? -1 : 1))
    .map(([id]) => id);

/** Parses an exported backup file (old ranked ones too); throws if it isn't one or holds nothing we recognize. */
export function parseBackup(text: string): Data {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('reviews' in parsed || 'ranks' in parsed)) throw new Error('not a backup');
  const d = sanitize(parsed);
  if (!ratedCount(d) && !d.watchlist.length) throw new Error('empty backup');
  return d;
}

function load(): Data {
  try {
    const s = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    if (s) return sanitize(JSON.parse(s));
  } catch {
    /* storage unavailable or corrupt — start fresh */
  }
  return emptyData();
}

export function computeRatings(d: Data): Map<string, Rating> {
  const m = new Map<string, Rating>();
  for (const [id, r] of Object.entries(d.reviews)) m.set(id, { ...r, id, type: BY_ID.get(id)!.type });
  return m;
}

interface Store {
  data: Data;
  ratings: Map<string, Rating>;
  /** Save your rating for `id`, keeping when you first logged it. */
  rate(id: string, r: Pick<Review, 'verdict' | 'tags' | 'again'>): void;
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

  const rate = useCallback((id: string, r: Pick<Review, 'verdict' | 'tags' | 'again'>) => {
    if (!BY_ID.has(id)) return;
    setData((prev) => ({
      reviews: { ...prev.reviews, [id]: { verdict: r.verdict, tags: r.tags, again: r.again, at: prev.reviews[id]?.at ?? Date.now() } },
      watchlist: prev.watchlist.filter((x) => x !== id),
      dismissed: prev.dismissed.filter((x) => x !== id),
    }));
  }, []);

  const unrate = useCallback((id: string) => setData((prev) => {
    const reviews = { ...prev.reviews };
    delete reviews[id];
    return { ...prev, reviews };
  }), []);

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
    () => ({ data, ratings, rate, unrate, toggleWatchlist, toggleDismissed, replace: setData }),
    [data, ratings, rate, unrate, toggleWatchlist, toggleDismissed],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
