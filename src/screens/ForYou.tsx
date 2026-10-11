import { useMemo } from 'react';
import { BY_ID, CATALOG, STARTERS } from '../lib/catalog';
import { recommend, similarTitles } from '../lib/recommend';
import { useStore } from '../lib/store';
import { useNav } from '../nav';
import { SearchIcon } from '../components/Icons';
import { Poster } from '../components/Poster';
import { PosterCard, Screen, SectionHeader, Shelf, TitleRow } from '../components/ui';

export function ForYou({ active, onSearch }: { active: boolean; onSearch: () => void }) {
  const { data, ratings } = useStore();
  const nav = useNav();
  const dismissed = useMemo(() => new Set(data.dismissed), [data.dismissed]);
  const recs = useMemo(() => recommend(ratings, dismissed), [ratings, dismissed]);
  const count = ratings.size;

  // Popular titles you haven't touched yet — fuel for more ratings.
  const unseen = useMemo(() => {
    const skip = (id: string) => ratings.has(id) || dismissed.has(id) || data.watchlist.includes(id);
    const starters = STARTERS.filter((t) => !skip(t.id));
    const rest = CATALOG.filter((t) => !skip(t.id) && !starters.includes(t));
    return [...starters, ...rest].slice(0, 18);
  }, [ratings, dismissed, data.watchlist]);

  if (count === 0) {
    return (
      <Screen title="For You" active={active}>
        <div className="hero-card">
          <h2>Rank what you watch.</h2>
          <p>No star ratings to agonize over. Tell us if you liked it, then pick between two titles a few times — Teli works out the score.</p>
          <ol className="steps">
            <li><span>1</span>Pick something you've seen</li>
            <li><span>2</span>Liked it, fine, or didn't like it</li>
            <li><span>3</span>Compare it to your other picks</li>
          </ol>
          <button className="secondary-btn" onClick={onSearch}><SearchIcon size={18} /> Search the library</button>
        </div>
        <SectionHeader title="Seen any of these?" subtitle="Tap one to rate it" />
        <div className="grid">
          {unseen.slice(0, 12).map((t) => (
            <button key={t.id} className="grid-item" onClick={() => nav.openRate(t.id)}>
              <Poster t={t} size="md" />
              <span className="card-title">{t.title}</span>
            </button>
          ))}
        </div>
      </Screen>
    );
  }

  const top = recs.slice(0, 10);
  const topIds = new Set(top.map((r) => r.title.id));
  const movies = recs.filter((r) => r.title.type === 'movie' && !topIds.has(r.title.id)).slice(0, 6);
  const shows = recs.filter((r) => r.title.type === 'tv' && !topIds.has(r.title.id)).slice(0, 6);
  const favorites = [...ratings.values()]
    .filter((r) => r.sentiment === 'liked')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => BY_ID.get(r.id)!);

  return (
    <Screen title="For You" active={active}>
      {count < 5 && (
        <div className="tip">
          <strong>{5 - count} more to go.</strong> Rate a few more titles and your picks get much sharper.
        </div>
      )}

      {top.length > 0 && (
        <>
          <SectionHeader title="Top Picks" subtitle="Based on everything you've ranked" />
          <Shelf>
            {top.map((r) => (
              <PosterCard key={r.title.id} t={r.title} size="lg"
                caption={<><span className="match">{r.match}% match</span>{r.because && ` · like ${r.because.title}`}</>} />
            ))}
          </Shelf>
        </>
      )}

      {favorites.map((f) => (
        <BecauseShelf key={f.id} id={f.id} title={f.title} exclude={ratings} dismissed={dismissed} />
      ))}

      {movies.length > 0 && (
        <>
          <SectionHeader title="Movies for You" />
          <div className="list">
            {movies.map((r) => (
              <TitleRow key={r.title.id} t={r.title} accessory={<span className="match-pill">{r.match}%</span>}
                detail={r.because ? `Because you liked ${r.because.title}` : undefined} />
            ))}
          </div>
        </>
      )}

      {shows.length > 0 && (
        <>
          <SectionHeader title="Shows for You" />
          <div className="list">
            {shows.map((r) => (
              <TitleRow key={r.title.id} t={r.title} accessory={<span className="match-pill">{r.match}%</span>}
                detail={r.because ? `Because you liked ${r.because.title}` : undefined} />
            ))}
          </div>
        </>
      )}

      <SectionHeader title="Keep ranking" subtitle="Seen these? Tap to rate" />
      <Shelf>
        {unseen.map((t) => (
          <button key={t.id} className="card card-md" onClick={() => nav.openRate(t.id)}>
            <Poster t={t} size="md" />
            <span className="card-title">{t.title}</span>
            <span className="card-sub accent">+ Rate</span>
          </button>
        ))}
      </Shelf>
    </Screen>
  );
}

function BecauseShelf({ id, title, exclude, dismissed }: {
  id: string;
  title: string;
  exclude: Map<string, unknown>;
  dismissed: Set<string>;
}) {
  const items = useMemo(() => {
    const skip = new Set([...exclude.keys(), ...dismissed]);
    return similarTitles(id, skip, 12, 0.25);
  }, [id, exclude, dismissed]);
  if (items.length < 3) return null;
  return (
    <>
      <SectionHeader title={`Because you liked ${title}`} />
      <Shelf>{items.map((t) => <PosterCard key={t.id} t={t} />)}</Shelf>
    </>
  );
}
