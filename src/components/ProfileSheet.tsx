import { useState, type ChangeEvent } from 'react';
import { GENRES } from '../lib/catalog';
import { emptyData, parseBackup, rankedCount, useStore, type Data } from '../lib/store';
import { exploredCount } from '../lib/taste';
import { CheckIcon, DownloadIcon, TrashIcon, UploadIcon, UserIcon, XIcon } from './Icons';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type Pending = { kind: 'import'; data: Data; name: string } | { kind: 'reset' };

export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { data, ratings, replace } = useStore();
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  const movies = [...ratings.values()].filter((r) => r.type === 'movie').length;
  const explored = exploredCount(ratings);

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
    <div className="profile">
      <div className="sheet-toolbar">
        <span />
        <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
      </div>

      <div className="profile-head">
        <span className="avatar avatar-lg"><UserIcon size={30} /></span>
        <h2>Your profile</h2>
        <p>Saved on this device only</p>
      </div>

      <div className="stats">
        <div><strong>{movies}</strong><span>Movies</span></div>
        <div><strong>{ratings.size - movies}</strong><span>Shows</span></div>
        <div><strong>{data.watchlist.length}</strong><span>Watchlist</span></div>
        <div><strong>{explored}<small>/{GENRES.length}</small></strong><span>Genres</span></div>
      </div>

      <h3 className="panel-label">Data</h3>
      <div className="list settings">
        <button className="setting" onClick={exportData}>
          <DownloadIcon size={18} />
          <span><strong>Export backup</strong><small>Download your rankings and watchlist as JSON</small></span>
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
