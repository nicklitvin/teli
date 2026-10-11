import { useMemo, useRef, useState } from 'react';
import type { MediaType } from '../types';
import { BY_ID } from '../lib/catalog';
import { emptyData, sanitize, useStore } from '../lib/store';
import { BookmarkIcon, ListIcon } from '../components/Icons';
import { Empty, Screen, Segmented, TitleRow } from '../components/ui';

type View = 'ranked' | 'watchlist';
type Filter = 'all' | MediaType;

export function MyList({ active, onSearch }: { active: boolean; onSearch: () => void }) {
  const { data, ratings, replace } = useStore();
  const [view, setView] = useState<View>('ranked');
  const [filter, setFilter] = useState<Filter>('all');
  const file = useRef<HTMLInputElement>(null);

  const ranked = useMemo(
    () => [...ratings.values()]
      .filter((r) => filter === 'all' || r.type === filter)
      .sort((a, b) => b.score - a.score || a.rank - b.rank),
    [ratings, filter],
  );
  const watch = data.watchlist.map((id) => BY_ID.get(id)!).filter((t) => filter === 'all' || t.type === filter);
  const movieCount = [...ratings.values()].filter((r) => r.type === 'movie').length;
  const avg = ranked.length ? ranked.reduce((s, r) => s + r.score, 0) / ranked.length : 0;

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `teli-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importData = async (f: File) => {
    try {
      replace(sanitize(JSON.parse(await f.text())));
    } catch {
      alert("That file couldn't be read as a Teli backup.");
    }
  };

  return (
    <Screen title="My List" active={active}>
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
            <div className="list">
              {ranked.map((r, i) => <TitleRow key={r.id} t={BY_ID.get(r.id)!} rank={i + 1} />)}
            </div>
          </>
        ) : (
          <Empty icon={<ListIcon size={34} />} title="Nothing ranked yet"
            body="Rate something you've watched and it'll show up here, ordered by your score."
            action={<button className="primary-btn" onClick={onSearch}>Find something</button>} />
        )
      ) : watch.length ? (
        <div className="list">{watch.map((t) => <TitleRow key={t.id} t={t} />)}</div>
      ) : (
        <Empty icon={<BookmarkIcon size={34} />} title="Your watchlist is empty"
          body="Save titles you want to watch from search or any title page." />
      )}

      <div className="footer-actions">
        <button className="text-btn" onClick={exportData}>Export data</button>
        <button className="text-btn" onClick={() => file.current?.click()}>Import</button>
        <button className="text-btn danger" onClick={() => {
          if (confirm('Erase all rankings and your watchlist?')) replace(emptyData());
        }}>Reset</button>
        <input ref={file} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }} />
      </div>
    </Screen>
  );
}
