import { useMemo, useRef, useState } from 'react';
import { CATALOG, STARTERS, metaLine } from '../lib/catalog';
import { discover, newSeed, recommend, shuffle, type Rec } from '../lib/recommend';
import { useStore } from '../lib/store';
import { useNav } from '../nav';
import { BookmarkIcon, EyeSlashIcon, OrbitIcon, RocketIcon, SearchIcon, StarIcon } from '../components/Icons';
import { Poster } from '../components/Poster';
import { Screen, SectionHeader } from '../components/ui';

type Mode = 'picks' | 'discover';
const PAGE = 8;

export function ForYou({ active, onSearch }: { active: boolean; onSearch: () => void }) {
  const { data, ratings } = useStore();
  const nav = useNav();
  const dismissed = useMemo(() => new Set(data.dismissed), [data.dismissed]);
  const recs = useMemo(() => recommend(ratings, dismissed), [ratings, dismissed]);
  const [mode, setMode] = useState<Mode>('picks');
  // A new seed on every load and every switch between picks and Discover, so the feed isn't the same each time.
  const [seed, setSeed] = useState(newSeed);
  const feed = useMemo(
    () => (mode === 'discover' ? discover(ratings, dismissed, recs, seed) : shuffle(recs, seed)),
    [mode, ratings, dismissed, recs, seed],
  );
  const [limit, setLimit] = useState(PAGE);
  const scroller = useRef<HTMLDivElement>(null);

  // Well-known titles to rate first, for someone who hasn't ranked anything yet.
  const starters = useMemo(() => {
    const skip = (id: string) => dismissed.has(id) || data.watchlist.includes(id);
    const first = STARTERS.filter((t) => !skip(t.id));
    return [...first, ...CATALOG.filter((t) => !skip(t.id) && !first.includes(t))].slice(0, 9);
  }, [dismissed, data.watchlist]);

  if (ratings.size === 0) {
    return (
      <Screen title="For You" active={active}>
        <div className="hero-card">
          <div className="hero-planet" aria-hidden="true"><i /></div>
          <h2>Your voyage starts here.</h2>
          <p>Rank what you've watched by picking between two titles. Teli maps your taste and charts what to watch next.</p>
          <button className="primary-btn" onClick={onSearch}><SearchIcon size={16} /> Search the library</button>
        </div>
        <SectionHeader title="Seen any of these?" subtitle="Tap one to rate it" />
        <div className="grid">
          {starters.map((t) => (
            <button key={t.id} className="grid-item" onClick={() => nav.openRate(t.id)}>
              <Poster t={t} size="md" />
              <span className="card-title">{t.title}</span>
            </button>
          ))}
        </div>
      </Screen>
    );
  }

  const discovering = mode === 'discover';
  const switchMode = () => {
    const next = discovering ? 'picks' : 'discover';
    setMode(next);
    setSeed(newSeed());
    setLimit(PAGE);
    scroller.current?.scrollTo({ top: 0 });
    nav.notify(next === 'discover' ? 'Discover on: genres and themes new to you' : 'Back to your usual picks');
  };

  return (
    <Screen title={discovering ? 'Discover' : 'For You'} active={active} className="feed" scrollRef={scroller}
      onScroll={(el) => {
        if (el.scrollTop + el.clientHeight * 2.5 > el.scrollHeight) setLimit((n) => Math.min(n + PAGE, feed.length));
      }}>
      <div className="feed-float">
        <button className={`discover-tag ${discovering ? 'on' : ''}`} onClick={switchMode} aria-pressed={discovering}>
          <RocketIcon size={15} /> Discover
        </button>
      </div>
      {feed.slice(0, limit).map((r) => (
        <Reel key={`${mode}-${seed}-${r.title.id}`} rec={r} discovering={discovering} />
      ))}
      {limit >= feed.length && (
        <div className="reel reel-end">
          <OrbitIcon size={40} />
          <h2>{feed.length ? 'Edge of the known universe' : 'Nothing out here yet'}</h2>
          <p>{discovering
            ? 'You’ve seen every frontier we can chart right now. Rank more titles to open new ones.'
            : 'Rank more titles and new picks will appear, or go looking somewhere new.'}</p>
          <button className="primary-btn" onClick={switchMode}>{discovering ? 'Back to your picks' : 'Turn on Discover'}</button>
        </div>
      )}
    </Screen>
  );
}

/** One recommendation, filling the screen: art behind, details and actions over the bottom. */
function Reel({ rec, discovering }: { rec: Rec; discovering: boolean }) {
  const { data, toggleWatchlist, toggleDismissed } = useStore();
  const nav = useNav();
  const t = rec.title;
  const saved = data.watchlist.includes(t.id);
  const hide = () => {
    toggleDismissed(t.id);
    nav.notify(`Hid ${t.title}`, () => toggleDismissed(t.id));
  };
  return (
    <article className={`reel ${discovering ? 'discovering' : ''}`} aria-label={t.title}>
      <Poster t={t} size="fill" />
      <button className="reel-hit" onClick={() => nav.openDetail(t.id)} aria-label={`${t.title}: details`} />
      <div className="reel-info">
        <div className="frontier">
          {discovering
            ? rec.frontier?.map((f) => <span key={f}>{f}</span>)
            : <span className="match-pill">{rec.match}% match</span>}
        </div>
        <h2>{t.title}</h2>
        <p>{metaLine(t, 3)}</p>
        {!discovering && rec.because && <p className="reel-why">Because you liked {rec.because.title}</p>}
        {discovering && <p className="reel-why">New territory for you{rec.match >= 70 ? ', but close to things you love' : ''}</p>}
        <div className="reel-actions">
          <button className="reel-btn primary" onClick={() => nav.openRate(t.id)}><StarIcon size={16} /> Seen it</button>
          <button className={`reel-btn ${saved ? 'on' : ''}`} onClick={() => toggleWatchlist(t.id)} aria-pressed={saved}>
            <BookmarkIcon size={17} filled={saved} /> {saved ? 'Saved' : 'Save'}
          </button>
          <button className="reel-btn icon" onClick={hide} aria-label="Not interested"><EyeSlashIcon size={17} /></button>
        </div>
      </div>
    </article>
  );
}
