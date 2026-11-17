import { useMemo, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { MediaType, Rating, Title } from '../types';
import { BY_ID, GENRES, metaLine } from '../lib/catalog';
import { setName, useName } from '../lib/name';
import { DEFAULT_TAGS, MAX_TAGS, MAX_TAG_LENGTH, NO_FILTER, VERDICTS, tagId, VERDICT_LABEL, byVerdict, countVerdicts, filtering, passes, verdictSummary, type ReviewFilter } from '../lib/rating';
import { normalize } from '../lib/search';
import { emptyData, parseBackup, pendingIds, ratedCount, useStore, type Data } from '../lib/store';
import { NOTES, VERSION } from '../lib/version';
import { useNav } from '../nav';
import {
  BookIcon, BookmarkIcon, CheckIcon, ChevronLeft, ChevronRight, DownloadIcon, EyeSlashIcon, GearIcon, PlusIcon, RefreshIcon, SearchIcon, SparklesIcon, TrashIcon, UploadIcon, UserIcon, XIcon,
} from '../components/Icons';
import { ReviewFilterChips, ReviewFilterGroups } from '../components/ReviewFilters';
import { Cards, Confirm, Empty, ListTools, Screen, TitleRow } from '../components/ui';

type Pending = { kind: 'import'; data: Data; name: string } | { kind: 'reset' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TABS: { value: MediaType; label: string }[] = [
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'Shows' },
];

type Sort = 'verdict' | 'new' | 'old';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'verdict', label: 'Best first' },
  { value: 'new', label: 'Newest rated' },
  { value: 'old', label: 'Oldest rated' },
];

const SORT_BY: Record<Sort, (a: Rating, b: Rating) => number> = {
  verdict: byVerdict,
  new: (a, b) => b.at - a.at,
  old: (a, b) => a.at - b.at,
};

const DAY = 864e5;
const shortDate = (at: number) => new Date(at).toLocaleDateString(undefined, {
  month: 'short', day: 'numeric', ...(new Date(at).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
});

/**
 * Your logbook: movies or shows, good first or by when you rated them, with filters for your
 * verdict, would watch again, tags and genre, plus search and stats. The bookmark button beside the
 * filters swaps in your watchlist. The gear swaps the page for Settings.
 */
export function Profile({ active, onSearch }: { active: boolean; onSearch: () => void }) {
  const { data, ratings, tagLabel } = useStore();
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
  const [sort, setSort] = useState<Sort>('verdict');
  const [statsOpen, setStatsOpen] = useState(false);

  const rated = useMemo(() => [...ratings.values()].filter((r) => r.type === tab), [ratings, tab]);
  // What's on your watchlist now, with when you saved it (0 if from before that was kept).
  const saved = useMemo(
    () => data.watchlist.filter((id) => BY_ID.get(id)?.type === tab).map((id) => data.saved[id] ?? 0),
    [data.watchlist, data.saved, tab],
  );
  // Rated titles: good, then ok, then bad, or by when you rated them. The watchlist keeps the order you saved in.
  const list = useMemo(
    () => (watching
      ? data.watchlist.map((id) => ({ id, t: BY_ID.get(id)! })).filter((x) => x.t.type === tab)
      : [...rated].sort(SORT_BY[sort]).map((r) => ({ id: r.id, t: BY_ID.get(r.id)! }))),
    [rated, data.watchlist, tab, watching, sort],
  );
  const genres = GENRES.filter((g) => list.some((x) => x.t.genres.includes(g)));
  const usedTags = useMemo(() => [...new Set([...ratings.values()].filter((r) => r.type === tab).flatMap((r) => r.tags))], [ratings, tab]);
  const q = normalize(query.trim());
  const reviewing = !watching && filtering(rf);
  const shown = list.filter((x) => (!genre || x.t.genres.includes(genre))
    && (!reviewing || passes(ratings.get(x.id)!, rf))
    && (!q || normalize(`${x.t.title} ${x.t.creator} ${x.t.year}`).includes(q)));
  const narrowed = !!genre || !!q || reviewing;
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
        <span className={`avatar avatar-lg ${settings ? 'settings-avatar' : ''}`}>{settings ? <GearIcon size={24} /> : <UserIcon size={26} />}</span>
        <div>
          <h2>{settings ? 'Settings' : name ? `${name}’s notebook` : 'Your logbook'}</h2>
          <p>{settings ? `Teli ${VERSION}` : 'Saved on this device'}</p>
        </div>
        <button className={`icon-btn gear ${settings ? 'on' : ''}`} onClick={() => setSettings((v) => !v)}
          aria-pressed={settings} aria-label={settings ? 'Close settings' : 'Settings'}>
          {settings ? <XIcon size={18} strokeWidth={2.4} /> : <GearIcon size={18} />}
        </button>
      </div>

      {settings ? <Settings onHidden={() => setHiddenPage(true)} /> : <>
      {toReview > 0 && (
        <button className="review-banner" onClick={() => nav.openReview()}>
          <RefreshIcon size={18} />
          <span><strong>{plural(toReview, 'title')} to review</strong><small>Carried over from the old rankings. Give each a quick good, ok or bad.</small></span>
          <ChevronRight size={16} />
        </button>
      )}

      {ratings.size || data.watchlist.length ? (
        <>
          <ListTools<MediaType> tab={tab} onTab={(t) => { setTab(t); setGenre(null); setRf(NO_FILTER); }} tabs={TABS}
            genre={genre} genres={genres} onGenre={setGenre} query={query} onQuery={setQuery}
            placeholder={`Search your ${watching ? 'saved ' : ''}${noun}`}
            option={watching ? undefined : { label: 'Sort', value: sort, initial: 'verdict', choices: SORTS, onChange: (v) => setSort(v as Sort) }}
            stats={<Stats rated={rated} saved={saved} noun={noun} />} statsOpen={statsOpen}
            onStats={(open) => { setStatsOpen(open); if (open) setWatching(false); }}
            more={watching ? undefined : {
              panel: <ReviewFilterGroups value={rf} onChange={setRf} tags={usedTags} />,
              chips: <ReviewFilterChips value={rf} onChange={setRf} />,
              active: filtering(rf),
              onClear: () => setRf(NO_FILTER),
            }}
            extra={
              <button className={`icon-btn tool ${watching ? 'on' : ''}`} onClick={() => { setWatching((v) => !v); setStatsOpen(false); setGenre(null); setRf(NO_FILTER); }}
                aria-pressed={watching} aria-label="Watchlist">
                <BookmarkIcon size={17} filled={watching} />
              </button>
            } />
          {statsOpen ? null : list.length ? (
            shown.length ? (
              <>
                {(narrowed || watching) && (
                  <p className="list-caption">
                    {narrowed ? `${shown.length} of ${list.length} ${noun}` : `${plural(list.length, tab === 'movie' ? 'movie' : 'show')} to watch`}
                  </p>
                )}
                <Cards>
                  {shown.map((x) => (
                    <TitleRow key={x.id} t={x.t} detail={watching ? undefined : ratedDetail(x.t, ratings.get(x.id)!, sort !== 'verdict', tagLabel)}
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
      </>}
    </Screen>
  );
}

/** Under a rated title: what stood out (and when you rated it, when sorted by that), or a nudge when it still needs a review. */
function ratedDetail(t: Title, r: Rating, dated: boolean, label: (id: string) => string) {
  if (r.pending) return 'Needs a quick review';
  const tags = r.tags.map(label);
  if (dated) return [`Rated ${shortDate(r.at)}`, ...tags].join(' · ');
  return tags.length ? [t.year, ...tags].join(' · ') : metaLine(t);
}

/** The `n` keys that come up most, with how often. */
function top(keys: string[], n = 3) {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/**
 * Charts of the movies or shows you've rated, in place of the list: a few big numbers, the
 * good / ok / bad split as a ring, ratings per day over the last 30 days, and top genres and tags as bars.
 */
function Stats({ rated, saved, noun }: { rated: Rating[]; saved: number[]; noun: string }) {
  const { tagLabel } = useStore();
  if (!rated.length && !saved.length) return <div className="stats-panel"><p className="stats-empty">Rate a few {noun} to see your stats.</p></div>;
  const done = rated.filter((r) => !r.pending);
  const n = countVerdicts(done);
  const today = new Date().setHours(0, 0, 0, 0);
  // Index 0 is 29 days ago, 29 is today.
  const days = Array.from({ length: 30 }, () => ({ good: 0, ok: 0, bad: 0 }));
  for (const r of done) {
    const d = 29 - Math.floor((today - new Date(r.at).setHours(0, 0, 0, 0)) / DAY);
    if (d >= 0 && d < 30) days[d][r.verdict]++;
  }
  const recent = days.reduce((s, d) => s + d.good + d.ok + d.bad, 0);
  const peak = Math.max(1, ...days.map((d) => d.good + d.ok + d.bad));
  const again = done.length ? Math.round((done.filter((r) => r.again).length / done.length) * 100) : 0;
  const genres = top(rated.flatMap((r) => BY_ID.get(r.id)!.genres), 4);
  const tags = top(done.flatMap((r) => r.tags), 4);
  // The ring: each verdict's share as an arc on a circle 100 long, starting at 12 o'clock.
  let at = 0;
  const arcs = VERDICTS.filter((v) => n[v]).map((v) => {
    const len = (n[v] / Math.max(1, done.length)) * 100;
    const arc = { v, len, at };
    at += len;
    return arc;
  });
  return (
    <div className="stats-panel">
      <div className="stat-tiles">
        <div className="stat"><strong>{rated.length}</strong><span>rated</span></div>
        <div className="stat"><strong>{recent}</strong><span>30 days</span></div>
        <div className="stat"><strong>{again}%</strong><span>rewatch</span></div>
      </div>
      <div className="stat-split">
        <svg className="stat-ring" viewBox="0 0 42 42" role="img" aria-label={verdictSummary(n)}>
          <circle className="ring-track" cx="21" cy="21" r="15.915" />
          {arcs.map((a) => (
            <circle key={a.v} className={`v-${a.v}`} cx="21" cy="21" r="15.915"
              strokeDasharray={`${Math.max(0, a.len - (arcs.length > 1 ? 1.2 : 0))} ${100 - a.len + (arcs.length > 1 ? 1.2 : 0)}`}
              strokeDashoffset={25 - a.at} />
          ))}
          <text x="21" y="21">{done.length ? Math.round((n.good / done.length) * 100) : 0}%</text>
          <text className="ring-sub" x="21" y="27">good</text>
        </svg>
        <div className="stat-legend">
          {VERDICTS.map((v) => (
            <span key={v}><i className={`v-${v}`} />{VERDICT_LABEL[v]}<b>{n[v]}</b></span>
          ))}
        </div>
      </div>
      <figure className="stat-chart">
        <figcaption>Last 30 days</figcaption>
        <div className="stat-days" role="img" aria-label={`${recent} rated in the last 30 days`}>
          {days.map((d, i) => (
            <span key={i} className="stat-day">
              {VERDICTS.filter((v) => d[v]).map((v) => <i key={v} className={`v-${v}`} style={{ height: `${(d[v] / peak) * 100}%` }} />)}
            </span>
          ))}
        </div>
      </figure>
      <figure className="stat-chart">
        <figcaption>Genres</figcaption>
        <Bars rows={genres.map(([g, k]) => [g, k])} />
      </figure>
      {tags.length > 0 && (
        <figure className="stat-chart">
          <figcaption>Tags</figcaption>
          <Bars rows={tags.map(([t, k]) => [tagLabel(t), k])} />
        </figure>
      )}
      <Watchlist rated={done} saved={saved} />
    </div>
  );
}

/**
 * How much you bookmark and how much of it you get round to: everything you've saved (still
 * waiting, or rated since) as one bar, with the watched part filled in.
 */
function Watchlist({ rated, saved }: { rated: Rating[]; saved: number[] }) {
  const watched = rated.filter((r) => r.fromList !== undefined);
  const total = watched.length + saved.length;
  if (!total) return null;
  const since = Date.now() - 30 * DAY;
  const savedLately = saved.filter((at) => at >= since).length + watched.filter((r) => r.fromList! >= since).length;
  const watchedLately = watched.filter((r) => r.at >= since).length;
  const waits = watched.filter((r) => r.fromList! > 0).map((r) => (r.at - r.fromList!) / DAY);
  const wait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
  const pct = Math.round((watched.length / total) * 100);
  return (
    <figure className="stat-chart">
      <figcaption>Watchlist</figcaption>
      <div className="stat-funnel" role="img" aria-label={`${total} saved, ${watched.length} watched (${pct}%)`}>
        <span className="funnel-bar"><b style={{ width: `${pct}%` }} /></span>
        <strong>{pct}%</strong>
      </div>
      <div className="stat-minis">
        <span><b>{total}</b>saved</span>
        <span><b>{watched.length}</b>watched</span>
        <span><b>{saved.length}</b>waiting</span>
        {wait !== null && <span><b>{wait}d</b>to watch</span>}
      </div>
      <div className="stat-minis lately">
        <span><b>+{savedLately}</b>saved, 30 days</span>
        <span><b>{watchedLately}</b>watched, 30 days</span>
      </div>
    </figure>
  );
}

/** A small horizontal bar chart, longest bar first. */
function Bars({ rows }: { rows: [string, number][] }) {
  const most = Math.max(1, ...rows.map(([, k]) => k));
  return (
    <div className="stat-bars">
      {rows.map(([label, k]) => (
        <div key={label} className="stat-row">
          <span>{label}</span>
          <i><b style={{ width: `${(k / most) * 100}%` }} /></i>
          <small>{k}</small>
        </div>
      ))}
    </div>
  );
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

/**
 * Settings, in place of the logbook: your name, your rating keywords, backups (import and reset
 * ask first), hidden titles, and the version with what's new.
 */
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
      <p className="panel-label">You</p>
      <div className="list settings">
        <label className="setting">
          <UserIcon size={18} />
          <span><strong>Your name</strong><small>Shown to your crew</small></span>
          <input className="setting-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a name"
            maxLength={40} autoComplete="nickname" enterKeyHint="done" />
        </label>
      </div>

      <p className="panel-label">Rating keywords</p>
      <Keywords />

      <p className="panel-label">Your data</p>
      <div className="list settings">
        <button className="setting" onClick={exportData}>
          <DownloadIcon size={18} />
          <span><strong>Export backup</strong><small>Download your ratings and watchlist, or send it to your crew</small></span>
        </button>
        <label className="setting">
          <UploadIcon size={18} />
          <span><strong>Import backup</strong><small>Replace everything here with a backup file</small></span>
          <input type="file" className="visually-hidden" onChange={pickFile} />
        </label>
        <button className="setting" onClick={onHidden}>
          <EyeSlashIcon size={18} />
          <span><strong>Not interested</strong><small>{hiddenCount ? plural(hiddenCount, 'hidden title') : 'Nothing hidden'}</small></span>
          <ChevronRight size={16} className="setting-go" />
        </button>
        <button className="setting danger" onClick={() => { setPending({ kind: 'reset' }); setNote(null); }}>
          <TrashIcon size={18} />
          <span><strong>Reset everything</strong><small>Erase all ratings, watchlist, hidden titles and keywords</small></span>
        </button>
      </div>
      {note && (
        <p className={`note ${note.error ? 'error' : ''}`} role="status">
          {!note.error && <CheckIcon size={15} />} {note.text}
        </p>
      )}

      <p className="panel-label">About</p>
      <About />

      {pending?.kind === 'import' && (
        <Confirm title="Import this backup?" confirm="Import" onConfirm={confirm} onCancel={() => setPending(null)}
          body={<>Your {plural(ratedCount(data), 'rating')} here will be replaced with {plural(ratedCount(pending.data), 'rating')} and {plural(pending.data.watchlist.length, 'watchlist title')} from <b>{pending.name}</b>.</>} />
      )}
      {pending?.kind === 'reset' && (
        <Confirm title="Reset everything?" confirm="Erase all" danger onConfirm={confirm} onCancel={() => setPending(null)}
          body={<>This erases {[
            ratedCount(data) && plural(ratedCount(data), 'rating'),
            data.watchlist.length && plural(data.watchlist.length, 'watchlist title'),
            hiddenCount && plural(hiddenCount, 'hidden title'),
          ].filter(Boolean).concat('your keywords').join(', ').replace(/, ([^,]*)$/, ' and $1')} from this device. <b>It can’t be undone.</b> Export a backup first if you might want them back.</>} />
      )}
    </div>
  );
}

/**
 * Your rating keywords: rename one in place, remove it, or add your own, up to MAX_TAGS. Ratings
 * keep a keyword you remove (it just stops being offered), and renaming one renames it everywhere.
 */
function Keywords() {
  const { data, tags, setTags } = useStore();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const uses = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of Object.values(data.reviews)) for (const t of r.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [data.reviews]);
  const isDefault = tags.length === DEFAULT_TAGS.length && tags.every((t, i) => t.id === DEFAULT_TAGS[i].id && t.label === DEFAULT_TAGS[i].label);
  const full = tags.length >= MAX_TAGS;

  /** What's wrong with this label, if anything (`self` is the keyword being renamed). */
  const problem = (label: string, self?: string) => {
    if (!label) return 'Type a keyword first.';
    if (!tagId(label)) return 'Use at least one letter or number.';
    const twin = tags.find((t) => t.id !== self && (t.label.toLowerCase() === label.toLowerCase() || t.id === tagId(label)));
    return twin ? `You already have “${twin.label}”.` : null;
  };

  const rename = (id: string, raw: string) => {
    const label = raw.trim();
    const old = tags.find((t) => t.id === id);
    if (!old || label === old.label) return true;
    const p = problem(label, id);
    if (p) {
      setError(p);
      return false;
    }
    setError(null);
    setTags(tags.map((t) => (t.id === id ? { ...t, label } : t)));
    return true;
  };

  const add = () => {
    const label = draft.trim();
    if (full) return setError(`That’s the most you can have (${MAX_TAGS}). Remove one to add another.`);
    const p = problem(label);
    if (p) return setError(p);
    setError(null);
    setTags([...tags, { id: tagId(label), label }]);
    setDraft('');
  };

  const enter = (e: KeyboardEvent<HTMLInputElement>, go: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go();
    }
  };

  return (
    <div className="keywords">
      <p className="keywords-intro">The words you can pick when you rate something. Up to {MAX_TAGS}, {MAX_TAG_LENGTH} letters each.</p>
      <div className="list settings keyword-list">
        {tags.map((t) => (
          <div className="keyword" key={`${t.id}:${t.label}`}>
            <input defaultValue={t.label} maxLength={MAX_TAG_LENGTH} aria-label={`Rename ${t.label}`} enterKeyHint="done"
              onBlur={(e) => { if (!rename(t.id, e.target.value)) e.target.value = t.label; }}
              onKeyDown={(e) => enter(e, () => e.currentTarget.blur())} />
            {uses.get(t.id) ? <small aria-label={`used ${uses.get(t.id)} times`}>{uses.get(t.id)}×</small> : null}
            <button className="icon-btn ghost" onClick={() => { setError(null); setTags(tags.filter((x) => x.id !== t.id)); }} aria-label={`Remove ${t.label}`}>
              <XIcon size={15} />
            </button>
          </div>
        ))}
        {!tags.length && <p className="keyword-none">No keywords: rating skips “What stood out?”.</p>}
        <div className="keyword add">
          <input value={draft} onChange={(e) => { setDraft(e.target.value); setError(null); }} maxLength={MAX_TAG_LENGTH} enterKeyHint="done"
            placeholder={full ? `${MAX_TAGS} of ${MAX_TAGS}: remove one to add more` : 'Add a keyword'} disabled={full} aria-label="New keyword"
            onKeyDown={(e) => enter(e, add)} />
          <button className="icon-btn tool" onClick={add} disabled={full || !draft.trim()} aria-label="Add keyword"><PlusIcon size={16} /></button>
        </div>
      </div>
      <div className="keywords-foot">
        <span className={error ? 'error' : ''} role={error ? 'alert' : undefined}>{error ?? `${tags.length} of ${MAX_TAGS}`}</span>
        {!isDefault && <button className="text-btn" onClick={() => { setError(null); setTags(undefined); }}><RefreshIcon size={14} /> Restore defaults</button>}
      </div>
    </div>
  );
}

/** The version, and what changed in each release (the latest open). */
function About() {
  const day = (d: string, long?: boolean) =>
    new Date(`${d}T12:00`).toLocaleDateString(undefined, long ? { month: 'long', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
  return (
    <div className="list settings about">
      <div className="setting static">
        <SparklesIcon size={18} />
        <span><strong>Teli {VERSION}</strong><small>Updated {day(NOTES[0].date, true)}</small></span>
      </div>
      {NOTES.map((n, i) => (
        <details key={n.version} className="patch" open={i === 0}>
          <summary>
            <strong>{i === 0 ? 'What’s new' : n.version}</strong>
            <small>{i === 0 ? n.version : day(n.date)}</small>
            <ChevronRight size={15} className="patch-caret" />
          </summary>
          <ul>{n.items.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      ))}
    </div>
  );
}
