import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaType } from '../types';
import { GENRES, GENRE_COLORS } from '../lib/catalog';
import { search } from '../lib/search';
import { useStore } from '../lib/store';
import { useNav } from '../nav';
import { BookmarkIcon, FilterIcon, SearchIcon, XIcon } from '../components/Icons';
import { Cards, Empty, Screen, TitleRow } from '../components/ui';

type Filter = 'all' | MediaType;

const TYPES: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'Shows' },
];

export function Search({ active, focusKey }: { active: boolean; focusKey: number }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [genre, setGenre] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [panel, setPanel] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { data, toggleWatchlist, ratings } = useStore();
  const nav = useNav();

  // Focus the field when another screen sends the user here.
  useEffect(() => {
    if (focusKey) input.current?.focus();
  }, [focusKey]);

  const filtered = filter !== 'all' || !!genre;
  const browsing = !q.trim() && !filtered;
  const results = useMemo(
    () => (browsing ? [] : search(q, { type: filter === 'all' ? undefined : filter, genre: genre ?? undefined })),
    [q, filter, genre, browsing],
  );

  return (
    <Screen title="Search" active={active} className="search">
      {/* Pinned above the tab bar: filters open upward from the button beside the search box. */}
      <div className="search-dock">
        {panel ? (
          <div className="search-panel filter-panel">
            <div className="filter-group" role="group" aria-label="Type">
              <p className="filter-label">Type</p>
              <div className="genre-wrap">
                {TYPES.map((o) => (
                  <button key={o.value} className={`chip toggle any ${filter === o.value ? 'on' : ''}`}
                    onClick={() => setFilter(o.value)} aria-pressed={filter === o.value}>{o.label}</button>
                ))}
              </div>
            </div>
            <div className="filter-group" role="group" aria-label="Genre">
              <p className="filter-label">Genre</p>
              <div className="genre-wrap">
                <button className={`chip toggle any ${genre ? '' : 'on'}`} onClick={() => setGenre(null)} aria-pressed={!genre}>Any genre</button>
                {GENRES.map((g) => (
                  <button key={g} className={`chip toggle ${genre === g ? 'on' : ''}`} style={{ ['--c' as string]: GENRE_COLORS[g] }}
                    onClick={() => { setGenre(genre === g ? null : g); setPanel(false); }} aria-pressed={genre === g}>{g}</button>
                ))}
              </div>
            </div>
          </div>
        ) : filtered && (
          <div className="genre-wrap dock-chips">
            {filter !== 'all' && (
              <button className="chip removable" style={{ ['--c' as string]: 'var(--accent-2)' }} onClick={() => setFilter('all')}>
                {filter === 'movie' ? 'Movies' : 'Shows'} <XIcon size={12} strokeWidth={3} />
              </button>
            )}
            {genre && (
              <button className="chip removable" style={{ ['--c' as string]: GENRE_COLORS[genre] }} onClick={() => setGenre(null)}>
                {genre} <XIcon size={12} strokeWidth={3} />
              </button>
            )}
          </div>
        )}
        <div className="search-bar">
          <label className={`search-field ${focused ? 'focused' : ''}`}>
            <SearchIcon size={17} />
            <input ref={input} type="search" placeholder="Movies, shows, directors…" value={q}
              onChange={(e) => setQ(e.target.value)} onFocus={() => { setFocused(true); setPanel(false); }} onBlur={() => setFocused(false)}
              enterKeyHint="search" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
            {q && (
              <button className="clear-btn" onClick={() => { setQ(''); input.current?.focus(); }} aria-label="Clear">
                <XIcon size={12} strokeWidth={3} />
              </button>
            )}
          </label>
          <button className={`icon-btn tool ${panel || filtered ? 'on' : ''}`} onClick={() => setPanel((v) => !v)}
            aria-expanded={panel} aria-label="Filters">
            <FilterIcon size={18} />
          </button>
          {(q || filtered) && (
            <button className="cancel-btn" onClick={() => { setQ(''); setGenre(null); setFilter('all'); setPanel(false); input.current?.blur(); }}>Cancel</button>
          )}
        </div>
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
            <Empty icon={<SearchIcon size={34} />} title="No results" body={q.trim() ? `Nothing matches “${q}”${filtered ? " with these filters" : ""}. Try a title, director, or genre.` : "Nothing matches these filters."} />
          )}
        </>
      )}
    </Screen>
  );
}
