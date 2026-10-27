import { useMemo, useState, type ChangeEvent } from 'react';
import type { MediaType, Title } from '../types';
import { BY_ID, GENRES, metaLine } from '../lib/catalog';
import { setName, useName } from '../lib/name';
import { NO_FILTER, TAG_LABEL, byVerdict, countVerdicts, filtering, passes, verdictSummary, type ReviewFilter } from '../lib/rating';
import { normalize } from '../lib/search';
import { emptyData, parseBackup, pendingIds, ratedCount, useStore, type Data } from '../lib/store';
import { useNav } from '../nav';
import {
  BookIcon, BookmarkIcon, CheckIcon, ChevronLeft, ChevronRight, DownloadIcon, EyeSlashIcon, GearIcon, RefreshIcon, SearchIcon, TrashIcon, UploadIcon, UserIcon,
} from '../components/Icons';
import { ReviewFilterChips, ReviewFilterGroups } from '../components/ReviewFilters';
import { Cards, Empty, ListTools, Screen, TitleRow } from '../components/ui';

type Pending = { kind: 'import'; data: Data; name: string } | { kind: 'reset' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TABS: { value: MediaType; label: string }[] = [
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'Shows' },
];

/**
 * Your logbook: movies or shows, good first, with filters for your verdict, would watch again, tags
 * and genre, plus search. The bookmark button beside the filters swaps in your watchlist. Backups
 * and hidden titles sit behind the gear.
 */
export function Profile({ active, onSearch }: { active: boolean; onSearch: () => void }) {
  const { data, ratings } = useStore();
  const nav = useNav();
  const name = useName().trim();
  const [rf, setRf] = useState<ReviewFilter>(NO_FILTER);
  const toReview = pendingIds(data).length;
  const [settings, setSettings] = useState(false);
  const [hiddenPage, setHiddenPage] = useState(false);
  const [tab, setTab] = useState<MediaType>('movie');
  const [watching, setWatching] = useState(false);
  const [genre, setGenre] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Rated titles: good, then mid, then bad. The watchlist shows what you saved most recently first.
  const list = useMemo(
    () => (watching
      ? data.watchlist.map((id) => ({ id, t: BY_ID.get(id)! })).filter((x) => x.t.type === tab)
      : [...ratings.values()].filter((r) => r.type === tab).sort(byVerdict).map((r) => ({ id: r.id, t: BY_ID.get(r.id)! }))),
    [ratings, data.watchlist, tab, watching],
  );
  const genres = GENRES.filter((g) => list.some((x) => x.t.genres.includes(g)));
  const usedTags = useMemo(() => [...new Set([...ratings.values()].filter((r) => r.type === tab).flatMap((r) => r.tags))], [ratings, tab]);
  const q = normalize(query.trim());
  const reviewing = !watching && filtering(rf);
  const shown = list.filter((x) => (!genre || x.t.genres.includes(genre))
    && (!reviewing || passes(ratings.get(x.id)!, rf))
    && (!q || normalize(`${x.t.title} ${x.t.creator} ${x.t.year}`).includes(q)));
  const narrowed = !!genre || !!q || reviewing;
  const counts = countVerdicts(list.map((x) => ratings.get(x.id)!).filter(Boolean));
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
          <h2>{name ? `${name}’s notebook` : 'Your logbook'}</h2>
          <p>{plural(ratings.size, 'title')} rated · saved on this device</p>
        </div>
        <button className={`icon-btn ${settings ? 'on' : ''}`} onClick={() => setSettings((v) => !v)}
          aria-expanded={settings} aria-label="Settings">
          <GearIcon size={18} />
        </button>
      </div>

      {settings && <Settings onHidden={() => setHiddenPage(true)} />}

      {toReview > 0 && (
        <button className="review-banner" onClick={() => nav.openReview()}>
          <RefreshIcon size={18} />
          <span><strong>{plural(toReview, 'title')} to review</strong><small>Carried over from the old rankings. Give each a quick good, mid or bad.</small></span>
          <ChevronRight size={16} />
        </button>
      )}

      {ratings.size || data.watchlist.length ? (
        <>
          <ListTools<MediaType> tab={tab} onTab={(t) => { setTab(t); setGenre(null); setRf(NO_FILTER); }} tabs={TABS}
            genre={genre} genres={genres} onGenre={setGenre} query={query} onQuery={setQuery}
            placeholder={`Search your ${watching ? 'saved ' : ''}${noun}`}
            more={watching ? undefined : {
              panel: <ReviewFilterGroups value={rf} onChange={setRf} tags={usedTags} />,
              chips: <ReviewFilterChips value={rf} onChange={setRf} />,
              active: filtering(rf),
              onClear: () => setRf(NO_FILTER),
            }}
            extra={
              <button className={`icon-btn tool ${watching ? 'on' : ''}`} onClick={() => { setWatching((v) => !v); setGenre(null); setRf(NO_FILTER); }}
                aria-pressed={watching} aria-label="Watchlist">
                <BookmarkIcon size={17} filled={watching} />
              </button>
            } />
          {list.length ? (
            shown.length ? (
              <>
                <p className="list-caption">
                  {narrowed ? `${shown.length} of ${list.length} ${noun}`
                    : watching ? `${plural(list.length, tab === 'movie' ? 'movie' : 'show')} to watch`
                    : `${list.length} rated · ${verdictSummary(counts)}`}
                </p>
                <Cards>
                  {shown.map((x) => (
                    <TitleRow key={x.id} t={x.t} detail={watching ? undefined : ratedDetail(x.t, ratings.get(x.id)!)}
                      actions={watching ? <Unsave id={x.id} title={x.t.title} /> : undefined} />
                  ))}
                </Cards>
              </>
            ) : (
              <Empty icon={<SearchIcon size={30} />} title="Nothing matches" body={`None of your ${watching ? 'saved' : 'rated'} ${noun} match that filter.`} />
            )
          ) : watching ? (
            <Empty icon={<BookmarkIcon size={30} />} title={`No ${noun} saved`} body={`Tap Save on any of the ${noun} you want to watch and they’ll wait here.`}
              action={<button className="primary-btn" onClick={onSearch}>Find {noun}</button>} />
          ) : (
            <Empty icon={<BookIcon size={30} />} title={`No ${noun} yet`} body={`Rate a few ${noun} and they'll be logged here.`}
              action={<button className="primary-btn" onClick={onSearch}>Find {noun}</button>} />
          )}
        </>
      ) : (
        <Empty icon={<BookIcon size={34} />} title="Your logbook is empty"
          body="Rate something you've watched and it'll be logged here, good ones first."
          action={<button className="primary-btn" onClick={onSearch}>Find something</button>} />
      )}
    </Screen>
  );
}

/** Under a rated title: what stood out, or a nudge when it still needs a review. */
function ratedDetail(t: Title, r: { tags: string[]; pending?: boolean }) {
  if (r.pending) return 'Needs a quick review';
  return r.tags.length ? [t.year, ...r.tags.map((x) => TAG_LABEL.get(x))].join(' · ') : metaLine(t);
}

/** Takes a title off your watchlist, with an undo. */
function Unsave({ id, title }: { id: string; title: string }) {
  const { toggleWatchlist } = useStore();
  const nav = useNav();
  return (
    <button className="icon-btn glass" aria-label={`Remove ${title} from your watchlist`}
      onClick={() => {
        toggleWatchlist(id);
        nav.notify(`Removed ${title} from your watchlist`, () => toggleWatchlist(id));
      }}>
      <BookmarkIcon size={16} filled />
    </button>
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
  const name = useName();
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
      setNote({ text: `Imported ${plural(ratedCount(pending.data), 'rating')} and ${plural(pending.data.watchlist.length, 'watchlist title')}.` });
    } else {
      replace(emptyData());
      setNote({ text: 'Everything was erased.' });
    }
    setPending(null);
  };

  return (
    <div className="settings-panel">
      <div className="list settings">
        <label className="setting">
          <UserIcon size={18} />
          <span><strong>Your name</strong><small>Shown to your crew</small></span>
          <input className="setting-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a name"
            maxLength={40} autoComplete="nickname" enterKeyHint="done" />
        </label>
        <button className="setting" onClick={exportData}>
          <DownloadIcon size={18} />
          <span><strong>Export backup</strong><small>Download your ratings and watchlist, or send it to your crew</small></span>
        </button>
        <label className="setting">
          <UploadIcon size={18} />
          <span><strong>Import backup</strong><small>Replace everything here with a backup file</small></span>
          <input type="file" className="visually-hidden" onChange={pickFile} />
        </label>
        <button className="setting danger" onClick={() => { setPending({ kind: 'reset' }); setNote(null); }}>
          <TrashIcon size={18} />
          <span><strong>Reset everything</strong><small>Erase all ratings, watchlist and hidden titles</small></span>
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
              ? <>Replace your {plural(ratedCount(data), 'rating')} with {plural(ratedCount(pending.data), 'rating')} and {plural(pending.data.watchlist.length, 'watchlist title')} from <b>{pending.name}</b>?</>
              : <>Erase {plural(ratedCount(data), 'rating')} and {plural(data.watchlist.length, 'watchlist title')}? This can't be undone.</>}
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
