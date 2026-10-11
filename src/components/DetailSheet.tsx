import { useMemo } from 'react';
import { BY_ID, CATALOG, GENRE_COLORS, typeLabel } from '../lib/catalog';
import { SENTIMENT_LABEL } from '../lib/ranking';
import { similarTitles } from '../lib/recommend';
import { useStore } from '../lib/store';
import { useNav } from '../nav';
import { BookmarkIcon, ChevronLeft, EyeSlashIcon, StarIcon, TrashIcon, XIcon } from './Icons';
import { Poster, ScoreBadge, posterArt } from './Poster';
import { PosterCard, SectionHeader, Shelf } from './ui';

export function DetailSheet({ id, canGoBack, onBack, onClose }: {
  id: string;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = BY_ID.get(id)!;
  const { data, ratings, toggleWatchlist, toggleDismissed, unrate } = useStore();
  const nav = useNav();
  const r = ratings.get(id);
  const saved = data.watchlist.includes(id);
  const dismissed = data.dismissed.includes(id);
  const art = posterArt(t);

  const similar = useMemo(() => similarTitles(id, new Set(), 15), [id]);
  const sameCreator = useMemo(
    () => CATALOG.filter((c) => c.creator === t.creator && c.id !== id && c.type === t.type).slice(0, 15),
    [id, t.creator, t.type],
  );

  return (
    <div className="detail" key={id}>
      <div className="detail-hero" style={{ ['--hue' as string]: art.hue }}>
        <div className="detail-hero-bg" style={{ background: art.background }}>
          {t.image && <img src={t.image[0]} alt="" decoding="async" onError={(e) => e.currentTarget.remove()} />}
        </div>
        <div className="sheet-toolbar over">
          {canGoBack ? (
            <button className="icon-btn glass" onClick={onBack} aria-label="Back"><ChevronLeft size={18} /></button>
          ) : <span />}
          <button className="icon-btn glass" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <div className="detail-head">
          <Poster t={t} size="xl" />
          <div className="detail-info">
            <h2>{t.title}</h2>
            <p>{t.year} · {typeLabel(t)}</p>
            <p className="muted">{t.type === 'movie' ? `Directed by ${t.creator}` : t.creator}</p>
          </div>
        </div>
      </div>

      <div className="detail-body">
        {r ? (
          <div className="your-score">
            <ScoreBadge rating={r} size="lg" />
            <div className="your-score-text">
              <strong>Your score</strong>
              <span>{SENTIMENT_LABEL[r.sentiment]} · #{r.rank} of {r.total} {t.type === 'movie' ? 'movies' : 'shows'}</span>
            </div>
            <button className="text-btn" onClick={() => nav.openRate(id)}>Re-rank</button>
          </div>
        ) : null}

        <div className="actions">
          {!r && (
            <button className="primary-btn" onClick={() => nav.openRate(id)}>
              <StarIcon size={16} /> Rate it
            </button>
          )}
          {!r && (
            <button className={`secondary-btn ${saved ? 'on' : ''}`} onClick={() => toggleWatchlist(id)}>
              <BookmarkIcon size={16} filled={saved} /> {saved ? 'Saved' : 'Watchlist'}
            </button>
          )}
          {r && (
            <button className="secondary-btn danger" onClick={() => unrate(id)}>
              <TrashIcon size={16} /> Remove rating
            </button>
          )}
        </div>
        {!r && (
          <button className="text-btn subtle" onClick={() => toggleDismissed(id)}>
            <EyeSlashIcon size={16} /> {dismissed ? 'Show in recommendations again' : 'Not interested'}
          </button>
        )}

        <div className="chips">
          {t.genres.map((g) => (
            <span key={g} className="chip" style={{ ['--c' as string]: GENRE_COLORS[g] ?? '#8E8E93' }}>{g}</span>
          ))}
          {t.tags.map((tag) => <span key={tag} className="chip plain">{tag.replace(/-/g, ' ')}</span>)}
        </div>

        {similar.length > 0 && (
          <>
            <SectionHeader title="More like this" />
            <Shelf>{similar.map((s) => <PosterCard key={s.id} t={s} />)}</Shelf>
          </>
        )}
        {sameCreator.length > 0 && (
          <>
            <SectionHeader title={t.type === 'movie' ? `More from ${t.creator}` : `More on ${t.creator}`} />
            <Shelf>{sameCreator.map((s) => <PosterCard key={s.id} t={s} />)}</Shelf>
          </>
        )}
      </div>
    </div>
  );
}
