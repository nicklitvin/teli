import { useMemo, useState } from 'react';
import type { MediaType } from '../types';
import { CATALOG, STARTERS, metaLine } from '../lib/catalog';
import { recommend, type Rec } from '../lib/recommend';
import { useStore } from '../lib/store';
import { useNav } from '../nav';
import { SearchIcon } from '../components/Icons';
import { Poster, posterArt } from '../components/Poster';
import { Screen, SectionHeader, Segmented, TitleRow } from '../components/ui';

type Filter = 'all' | MediaType;
const STEP = 8;

export function ForYou({ active, onSearch }: { active: boolean; onSearch: () => void }) {
  const { data, ratings } = useStore();
  const nav = useNav();
  const dismissed = useMemo(() => new Set(data.dismissed), [data.dismissed]);
  const recs = useMemo(() => recommend(ratings, dismissed), [ratings, dismissed]);
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(STEP);

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
          <div className="shapes" aria-hidden="true"><i /><i /><i /><i /></div>
          <h2>Rank what you watch.</h2>
          <p>Say if you liked it, then pick between two titles. Teli works out the scores and finds what to watch next.</p>
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

  const [top, ...rest] = recs;
  const more = rest.filter((r) => filter === 'all' || r.title.type === filter);

  return (
    <Screen title="For You" active={active}>
      {top && <Featured rec={top} onOpen={() => nav.openDetail(top.title.id)} />}

      {more.length > 0 && (
        <>
          <SectionHeader title="More for you" />
          <div className="filter-bar">
            <Segmented<Filter> value={filter} onChange={(f) => { setFilter(f); setLimit(STEP); }}
              options={[{ value: 'all', label: 'All' }, { value: 'movie', label: 'Movies' }, { value: 'tv', label: 'Shows' }]} />
          </div>
          <div className="list">
            {more.slice(0, limit).map((r) => (
              <TitleRow key={r.title.id} t={r.title} accessory={<span className="match-pill">{r.match}%</span>}
                detail={r.because ? `Because you liked ${r.because.title}` : undefined} />
            ))}
          </div>
          {more.length > limit && (
            <button className="secondary-btn more" onClick={() => setLimit((n) => n + STEP)}>Show more</button>
          )}
        </>
      )}
    </Screen>
  );
}

/** The single best pick, shown big with its artwork behind it. */
function Featured({ rec, onOpen }: { rec: Rec; onOpen: () => void }) {
  const t = rec.title;
  return (
    <button className="feature" onClick={onOpen}>
      <div className="feature-bg" style={{ background: posterArt(t).background }} aria-hidden="true">
        {t.image && <img src={t.image[0]} alt="" decoding="async" onError={(e) => e.currentTarget.remove()} />}
      </div>
      <Poster t={t} size="xl" />
      <div className="feature-info">
        <span className="eyebrow">Top pick for you</span>
        <h2>{t.title}</h2>
        <p>{metaLine(t)}</p>
        <p className="feature-why">
          <span className="match-pill">{rec.match}% match</span>
          {rec.because && <span>Because you liked {rec.because.title}</span>}
        </p>
      </div>
    </button>
  );
}
