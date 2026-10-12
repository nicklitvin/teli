import { useMemo, useState } from 'react';
import type { MediaType } from '../types';
import { BY_ID } from '../lib/catalog';
import { useStore } from '../lib/store';
import { BookIcon, BookmarkIcon } from '../components/Icons';
import { Cards, Empty, Screen, Segmented, TitleRow } from '../components/ui';

type View = 'ranked' | 'watchlist';
type Filter = 'all' | MediaType;

export function MyList({ active, onSearch }: { active: boolean; onSearch: () => void }) {
  const { data, ratings } = useStore();
  const [view, setView] = useState<View>('ranked');
  const [filter, setFilter] = useState<Filter>('all');

  const ranked = useMemo(
    () => [...ratings.values()]
      .filter((r) => filter === 'all' || r.type === filter)
      .sort((a, b) => b.score - a.score || a.rank - b.rank),
    [ratings, filter],
  );
  const watch = data.watchlist.map((id) => BY_ID.get(id)!).filter((t) => filter === 'all' || t.type === filter);
  const movieCount = [...ratings.values()].filter((r) => r.type === 'movie').length;
  const avg = ranked.length ? ranked.reduce((s, r) => s + r.score, 0) / ranked.length : 0;

  return (
    <Screen title="Logbook" active={active}>
      <div className="stats">
        <div><strong>{movieCount}</strong><span>Movies</span></div>
        <div><strong>{ratings.size - movieCount}</strong><span>Shows</span></div>
        <div><strong>{data.watchlist.length}</strong><span>Watchlist</span></div>
      </div>

      <div className="filter-bar stacked">
        <Segmented<View> value={view} onChange={setView}
          options={[{ value: 'ranked', label: 'Ranked' }, { value: 'watchlist', label: 'Watchlist' }]} />
        <div className="pills">
          {(['all', 'movie', 'tv'] as Filter[]).map((f) => (
            <button key={f} className={`pill ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : 'Shows'}
            </button>
          ))}
        </div>
      </div>

      {view === 'ranked' ? (
        ranked.length ? (
          <>
            <p className="list-caption">{ranked.length} ranked · average {avg.toFixed(1)}</p>
            <Cards>
              {ranked.map((r, i) => <TitleRow key={r.id} t={BY_ID.get(r.id)!} rank={i + 1} />)}
            </Cards>
          </>
        ) : (
          <Empty icon={<BookIcon size={34} />} title="Your logbook is empty"
            body="Rate something you've watched and it'll be logged here, ordered by your score."
            action={<button className="primary-btn" onClick={onSearch}>Find something</button>} />
        )
      ) : watch.length ? (
        <Cards>{watch.map((t) => <TitleRow key={t.id} t={t} />)}</Cards>
      ) : (
        <Empty icon={<BookmarkIcon size={34} />} title="Your watchlist is empty"
          body="Save titles you want to watch from search or any title page." />
      )}
    </Screen>
  );
}
