import { useState, type ChangeEvent } from 'react';
import type { MediaType, Rating } from '../types';
import { BY_ID } from '../lib/catalog';
import { emptyData, parseBackup, rankedCount, useStore, type Data } from '../lib/store';
import { BookIcon, CheckIcon, DownloadIcon, GearIcon, TrashIcon, UploadIcon, UserIcon } from '../components/Icons';
import { Cards, Empty, PosterCard, Screen, SectionHeader, Shelf, TitleRow } from '../components/ui';

type Pending = { kind: 'import'; data: Data; name: string } | { kind: 'reset' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const PREVIEW = 5;

/** Your logbook: movies and shows each ranked by score, then your watchlist. Backups sit behind the gear. */
export function Profile({ active, onSearch }: { active: boolean; onSearch: () => void }) {
  const { data, ratings, toggleDismissed } = useStore();
  const [settings, setSettings] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const watch = data.watchlist.map((id) => BY_ID.get(id)!);
  const hidden = [...data.dismissed].reverse().map((id) => BY_ID.get(id)).filter((t) => !!t);

  return (
    <Screen title="Profile" active={active} className="profile">
      <div className="profile-head">
        <span className="avatar avatar-lg"><UserIcon size={26} /></span>
        <div>
          <h2>Your logbook</h2>
          <p>{plural(ratings.size, 'title')} ranked · saved on this device</p>
        </div>
        <button className={`icon-btn ${settings ? 'on' : ''}`} onClick={() => setSettings((v) => !v)}
          aria-expanded={settings} aria-label="Backup and settings">
          <GearIcon size={18} />
        </button>
      </div>

      {settings && <Settings />}

      {ratings.size ? (
        <>
          <RankedGroup type="movie" ratings={ratings} />
          <RankedGroup type="tv" ratings={ratings} />
        </>
      ) : (
        <Empty icon={<BookIcon size={34} />} title="Your logbook is empty"
          body="Rate something you've watched and it'll be logged here, ordered by your score."
          action={<button className="primary-btn" onClick={onSearch}>Find something</button>} />
      )}

      {watch.length > 0 && (
        <>
          <SectionHeader title="Watchlist" subtitle={plural(watch.length, 'title')} />
          <Shelf>{watch.map((t) => <PosterCard key={t.id} t={t} caption={String(t.year)} />)}</Shelf>
        </>
      )}

      {hidden.length > 0 && (
        <div className="hidden-titles">
          <button className="text-btn subtle center" onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden}>
            {showHidden ? 'Close' : `${plural(hidden.length, 'title')} marked not interested`}
          </button>
          {showHidden && (
            <Cards>
              {hidden.map((t) => (
                <TitleRow key={t.id} t={t}
                  actions={<button className="secondary-btn small glass" onClick={() => toggleDismissed(t.id)}>Show again</button>} />
              ))}
            </Cards>
          )}
        </div>
      )}
    </Screen>
  );
}

/** One numbered list (movies or shows), best first; long lists open the rest on request. */
function RankedGroup({ type, ratings }: { type: MediaType; ratings: Map<string, Rating> }) {
  const [all, setAll] = useState(false);
  const list = [...ratings.values()].filter((r) => r.type === type).sort((a, b) => b.score - a.score || a.rank - b.rank);
  if (!list.length) return null;
  const avg = list.reduce((s, r) => s + r.score, 0) / list.length;
  return (
    <>
      <SectionHeader title={type === 'movie' ? 'Movies' : 'Shows'} subtitle={`${list.length} ranked · average ${avg.toFixed(1)}`} />
      <Cards>
        {(all ? list : list.slice(0, PREVIEW)).map((r, i) => <TitleRow key={r.id} t={BY_ID.get(r.id)!} rank={i + 1} />)}
      </Cards>
      {list.length > PREVIEW && (
        <button className="secondary-btn more" onClick={() => setAll((v) => !v)}>
          {all ? 'Show top 5' : `Show all ${list.length}`}
        </button>
      )}
    </>
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
