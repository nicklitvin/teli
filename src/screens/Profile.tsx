import { useMemo, useState, type ChangeEvent } from 'react';
import type { MediaType } from '../types';
import { BY_ID, GENRES } from '../lib/catalog';
import { normalize } from '../lib/search';
import { emptyData, parseBackup, rankedCount, useStore, type Data } from '../lib/store';
import {
  BookIcon, CheckIcon, ChevronLeft, ChevronRight, DownloadIcon, EyeSlashIcon, GearIcon, SearchIcon, TrashIcon, UploadIcon, UserIcon,
} from '../components/Icons';
import { Cards, Empty, ListTools, PosterCard, Screen, SectionHeader, Shelf, TitleRow } from '../components/ui';

type Pending = { kind: 'import'; data: Data; name: string } | { kind: 'reset' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Your logbook: movies or shows ranked by score, with genre and search filters. Backups and hidden titles sit behind the gear. */
export function Profile({ active, onSearch }: { active: boolean; onSearch: () => void }) {
  const { data, ratings } = useStore();
  const [settings, setSettings] = useState(false);
  const [hiddenPage, setHiddenPage] = useState(false);
  const [tab, setTab] = useState<MediaType>('movie');
  const [genre, setGenre] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Numbers are your overall rank in movies or shows, so they stay put while filtering.
  const list = useMemo(
    () => [...ratings.values()].filter((r) => r.type === tab)
      .sort((a, b) => b.score - a.score || a.rank - b.rank)
      .map((r, i) => ({ r, t: BY_ID.get(r.id)!, n: i + 1 })),
    [ratings, tab],
  );
  const genres = GENRES.filter((g) => list.some((x) => x.t.genres.includes(g)));
  const q = normalize(query.trim());
  const shown = list.filter((x) => (!genre || x.t.genres.includes(genre))
    && (!q || normalize(`${x.t.title} ${x.t.creator} ${x.t.year}`).includes(q)));
  const filtering = !!genre || !!q;
  const avg = list.length ? list.reduce((s, x) => s + x.r.score, 0) / list.length : 0;
  const saved = data.watchlist.map((id) => BY_ID.get(id)!).filter((t) => t.type === tab);
  const noun = tab === 'movie' ? 'movies' : 'shows';

  if (hiddenPage) {
    return (
      <Screen title="Not interested" active={active} className="profile">
        <HiddenTitles onBack={() => setHiddenPage(false)} />
      </Screen>
    );
  }

  return (
    <Screen title="Profile" active={active} className="profile">
      <div className="profile-head">
        <span className="avatar avatar-lg"><UserIcon size={26} /></span>
        <div>
          <h2>Your logbook</h2>
          <p>{plural(ratings.size, 'title')} ranked · saved on this device</p>
        </div>
        <button className={`icon-btn ${settings ? 'on' : ''}`} onClick={() => setSettings((v) => !v)}
          aria-expanded={settings} aria-label="Settings">
          <GearIcon size={18} />
        </button>
      </div>

      {settings && <Settings onHidden={() => setHiddenPage(true)} />}

      {ratings.size ? (
        <>
          <ListTools<MediaType> tab={tab} onTab={(t) => { setTab(t); setGenre(null); }}
            tabs={[{ value: 'movie', label: 'Movies' }, { value: 'tv', label: 'Shows' }]}
            genre={genre} genres={genres} onGenre={setGenre} query={query} onQuery={setQuery} placeholder={`Search your ${noun}`} />
          {list.length ? (
            shown.length ? (
              <>
                <p className="list-caption">
                  {filtering ? `${shown.length} of ${list.length} ${noun}` : `${list.length} ranked · average ${avg.toFixed(1)}`}
                </p>
                <Cards>{shown.map((x) => <TitleRow key={x.r.id} t={x.t} rank={x.n} />)}</Cards>
              </>
            ) : (
              <Empty icon={<SearchIcon size={30} />} title="Nothing matches" body={`None of your ranked ${noun} match that filter.`} />
            )
          ) : (
            <Empty icon={<BookIcon size={30} />} title={`No ${noun} yet`} body={`Rate a few ${noun} and they'll be ranked here.`}
              action={<button className="primary-btn" onClick={onSearch}>Find {noun}</button>} />
          )}
          {!filtering && saved.length > 0 && (
            <>
              <SectionHeader title="Watchlist" subtitle={plural(saved.length, tab === 'movie' ? 'movie' : 'show')} />
              <Shelf>{saved.map((t) => <PosterCard key={t.id} t={t} caption={String(t.year)} />)}</Shelf>
            </>
          )}
        </>
      ) : (
        <Empty icon={<BookIcon size={34} />} title="Your logbook is empty"
          body="Rate something you've watched and it'll be logged here, ordered by your score."
          action={<button className="primary-btn" onClick={onSearch}>Find something</button>} />
      )}
    </Screen>
  );
}

/** Titles you marked "Not interested", on a page of their own, each with a way back into your picks. */
function HiddenTitles({ onBack }: { onBack: () => void }) {
  const { data, toggleDismissed } = useStore();
  const hidden = [...data.dismissed].reverse().map((id) => BY_ID.get(id)).filter((t) => !!t);
  return (
    <>
      <div className="subpage-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back to your logbook"><ChevronLeft size={18} /></button>
        <div>
          <h2>Not interested</h2>
          <p>{hidden.length ? `${plural(hidden.length, 'title')} kept out of your picks` : 'Nothing hidden'}</p>
        </div>
      </div>
      {hidden.length ? (
        <Cards>
          {hidden.map((t) => (
            <TitleRow key={t.id} t={t}
              actions={<button className="secondary-btn small glass" onClick={() => toggleDismissed(t.id)}>Show again</button>} />
          ))}
        </Cards>
      ) : (
        <Empty icon={<EyeSlashIcon size={30} />} title="Nothing hidden" body="Titles you mark “Not interested” land here." />
      )}
    </>
  );
}

/** Backups: export, import (replaces everything) and reset, each confirmed first. Also the way into hidden titles. */
function Settings({ onHidden }: { onHidden: () => void }) {
  const { data, replace } = useStore();
  const [pending, setPending] = useState<Pending | null>(null);
  const hiddenCount = data.dismissed.length;
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
        <button className="setting" onClick={onHidden}>
          <EyeSlashIcon size={18} />
          <span><strong>Not interested</strong><small>{hiddenCount ? plural(hiddenCount, 'hidden title') : 'Nothing hidden'}</small></span>
          <ChevronRight size={16} className="setting-go" />
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
