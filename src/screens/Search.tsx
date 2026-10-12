import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaType } from '../types';
import { GENRES, GENRE_COLORS } from '../lib/catalog';
import { search } from '../lib/search';
import { useStore } from '../lib/store';
import { useNav } from '../nav';
import { BookmarkIcon, SearchIcon, XIcon } from '../components/Icons';
import { Cards, Empty, Screen, Segmented, TitleRow } from '../components/ui';

type Filter = 'all' | MediaType;

export function Search({ active, focusKey }: { active: boolean; focusKey: number }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [genre, setGenre] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { data, toggleWatchlist, ratings } = useStore();
  const nav = useNav();

  // Focus the field when another screen sends the user here.
  useEffect(() => {
    if (focusKey) input.current?.focus();
  }, [focusKey]);

  const browsing = !q.trim() && !genre;
  const results = useMemo(
    () => (browsing ? [] : search(q, { type: filter === 'all' ? undefined : filter, genre: genre ?? undefined })),
    [q, filter, genre, browsing],
  );

  return (
    <Screen title="Search" active={active} className="search">
      <div className="search-bar">
        <label className={`search-field ${focused ? 'focused' : ''}`}>
          <SearchIcon size={17} />
          <input ref={input} type="search" placeholder="Movies, shows, directors, genres…" value={q}
            onChange={(e) => setQ(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            enterKeyHint="search" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
          {q && (
            <button className="clear-btn" onClick={() => { setQ(''); input.current?.focus(); }} aria-label="Clear">
              <XIcon size={12} strokeWidth={3} />
            </button>
          )}
        </label>
        {(q || genre) && (
          <button className="cancel-btn" onClick={() => { setQ(''); setGenre(null); input.current?.blur(); }}>Cancel</button>
        )}
      </div>

      {browsing ? (
        <>
          <h2 className="browse-title">Visit a genre</h2>
          <div className="genre-grid">
            {GENRES.map((g) => (
              <button key={g} className="genre-tile" style={{ ['--c' as string]: GENRE_COLORS[g] ?? '#8E8E93' }}
                onClick={() => setGenre(g)}>
                <i className="planet" aria-hidden="true" />
                {g}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="filter-bar">
            <Segmented<Filter> value={filter} onChange={setFilter}
              options={[{ value: 'all', label: 'All' }, { value: 'movie', label: 'Movies' }, { value: 'tv', label: 'Shows' }]} />
            {genre && (
              <button className="chip removable" style={{ ['--c' as string]: GENRE_COLORS[genre] }} onClick={() => setGenre(null)}>
                {genre} <XIcon size={12} strokeWidth={3} />
              </button>
            )}
          </div>
          {results.length ? (
            <Cards>
              {results.map((t) => {
                const saved = data.watchlist.includes(t.id);
                return (
                  <TitleRow key={t.id} t={t}
                    actions={ratings.has(t.id) ? undefined : (
                      <>
                        <button className={`icon-btn glass ${saved ? 'on' : ''}`} onClick={() => toggleWatchlist(t.id)}
                          aria-label={saved ? 'Remove from watchlist' : 'Save to watchlist'} aria-pressed={saved}>
                          <BookmarkIcon size={17} filled={saved} />
                        </button>
                        <button className="rate-btn" onClick={() => nav.openRate(t.id)}>Rate</button>
                      </>
                    )} />
                );
              })}
            </Cards>
          ) : (
            <Empty icon={<SearchIcon size={34} />} title="No results" body={`Nothing matches “${q}”. Try a title, director, or genre.`} />
          )}
        </>
      )}
    </Screen>
  );
}
