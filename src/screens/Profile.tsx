import { useMemo, useState, type ChangeEvent } from 'react';
import type { MediaType } from '../types';
import { BY_ID, GENRES } from '../lib/catalog';
import { emptyData, parseBackup, rankedCount, useStore, type Data } from '../lib/store';
import { exploredCount } from '../lib/taste';
import {
  BookIcon, BookmarkIcon, CheckIcon, DownloadIcon, EyeSlashIcon, GearIcon, TrashIcon, UploadIcon, UserIcon,
} from '../components/Icons';
import { Cards, Empty, Screen, Segmented, TitleRow } from '../components/ui';

type View = 'ranked' | 'watchlist' | 'hidden';
type Filter = 'all' | MediaType;
type Pending = { kind: 'import'; data: Data; name: string } | { kind: 'reset' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** You: your stats, everything you've ranked, saved or hidden, and backup settings behind the gear. */
export function Profile({ active, onSearch }: { active: boolean; onSearch: () => void }) {
  const { data, ratings, toggleDismissed } = useStore();
  const [view, setView] = useState<View>('ranked');
  const [filter, setFilter] = useState<Filter>('all');
  const [settings, setSettings] = useState(false);

  const of = (type: MediaType) => filter === 'all' || type === filter;
  const ranked = useMemo(
    () => [...ratings.values()]
      .filter((r) => filter === 'all' || r.type === filter)
      .sort((a, b) => b.score - a.score || a.rank - b.rank),
    [ratings, filter],
  );
  const watch = data.watchlist.map((id) => BY_ID.get(id)!).filter((t) => of(t.type));
  const hidden = [...data.dismissed].reverse().map((id) => BY_ID.get(id)).filter((t) => !!t).filter((t) => of(t.type));
  const movies = [...ratings.values()].filter((r) => r.type === 'movie').length;
  const avg = ranked.length ? ranked.reduce((s, r) => s + r.score, 0) / ranked.length : 0;

  return (
    <Screen title="Profile" active={active} className="profile">
      <div className="profile-head">
        <span className="avatar avatar-lg"><UserIcon size={26} /></span>
        <div>
          <h2>Your logbook</h2>
          <p>Saved on this device only</p>
        </div>
        <button className={`icon-btn ${settings ? 'on' : ''}`} onClick={() => setSettings((v) => !v)}
          aria-expanded={settings} aria-label="Backup and settings">
          <GearIcon size={18} />
        </button>
      </div>

      {settings && <Settings />}

      <div className="stats">
        <div><strong>{movies}</strong><span>Movies</span></div>
        <div><strong>{ratings.size - movies}</strong><span>Shows</span></div>
        <div><strong>{data.watchlist.length}</strong><span>Saved</span></div>
        <div><strong>{exploredCount(ratings)}<small>/{GENRES.length}</small></strong><span>Planets</span></div>
      </div>

      <div className="filter-bar stacked">
        <Segmented<View> value={view} onChange={setView} options={[
          { value: 'ranked', label: 'Ranked' },
          { value: 'watchlist', label: 'Watchlist' },
          { value: 'hidden', label: 'Hidden' },
        ]} />
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
      ) : view === 'watchlist' ? (
        watch.length ? (
          <Cards>{watch.map((t) => <TitleRow key={t.id} t={t} />)}</Cards>
        ) : (
          <Empty icon={<BookmarkIcon size={34} />} title="Your watchlist is empty"
            body="Save titles you want to watch from For You, search or any title page." />
        )
      ) : hidden.length ? (
        <Cards>
          {hidden.map((t) => (
            <TitleRow key={t.id} t={t}
              actions={<button className="secondary-btn small glass" onClick={() => toggleDismissed(t.id)}>Show again</button>} />
          ))}
        </Cards>
      ) : (
        <Empty icon={<EyeSlashIcon size={34} />} title="Nothing hidden"
          body="Titles you mark “Not interested” land here, so you can bring them back." />
      )}
    </Screen>
  );
}

/** Backups: export, import (replaces everything) and reset, each confirmed first. */
function Settings() {
  const { data, replace } = useStore();
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `teli-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setNote({ text: `Saved ${a.download}` });
  };

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPending(null);
    try {
      const d = parseBackup(await f.text());
      setPending({ kind: 'import', data: d, name: f.name });
      setNote(null);
    } catch {
      setNote({ text: `“${f.name}” isn't a Teli backup. Use a file saved with Export backup.`, error: true });
    }
  };

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'import') {
      replace(pending.data);
      setNote({ text: `Imported ${plural(rankedCount(pending.data), 'ranking')} and ${plural(pending.data.watchlist.length, 'watchlist title')}.` });
    } else {
      replace(emptyData());
      setNote({ text: 'Everything was erased.' });
    }
    setPending(null);
  };

  return (
    <div className="settings-panel">
      <div className="list settings">
        <button className="setting" onClick={exportData}>
          <DownloadIcon size={18} />
          <span><strong>Export backup</strong><small>Download your rankings and watchlist, or send it to your crew</small></span>
        </button>
        <label className="setting">
          <UploadIcon size={18} />
          <span><strong>Import backup</strong><small>Replace everything here with a backup file</small></span>
          <input type="file" className="visually-hidden" onChange={pickFile} />
        </label>
        <button className="setting danger" onClick={() => { setPending({ kind: 'reset' }); setNote(null); }}>
          <TrashIcon size={18} />
          <span><strong>Reset everything</strong><small>Erase all rankings, watchlist and hidden titles</small></span>
        </button>
      </div>

      {pending && (
        <div className={`confirm ${pending.kind === 'reset' ? 'danger' : ''}`} role="alertdialog" aria-label="Confirm">
          <p>
            {pending.kind === 'import'
              ? <>Replace your {plural(rankedCount(data), 'ranking')} with {plural(rankedCount(pending.data), 'ranking')} and {plural(pending.data.watchlist.length, 'watchlist title')} from <b>{pending.name}</b>?</>
              : <>Erase {plural(rankedCount(data), 'ranking')} and {plural(data.watchlist.length, 'watchlist title')}? This can't be undone.</>}
          </p>
          <div className="confirm-actions">
            <button className="secondary-btn" onClick={() => setPending(null)}>Cancel</button>
            <button className={pending.kind === 'reset' ? 'danger-btn' : 'primary-btn'} onClick={confirm}>
              {pending.kind === 'import' ? 'Import' : 'Erase'}
            </button>
          </div>
        </div>
      )}
      {note && (
        <p className={`note ${note.error ? 'error' : ''}`} role="status">
          {!note.error && <CheckIcon size={15} />} {note.text}
        </p>
      )}
    </div>
  );
}
