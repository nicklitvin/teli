import { useMemo, useRef, useState } from 'react';
import { BY_ID, GENRES, GENRE_COLORS } from '../lib/catalog';
import { recommend } from '../lib/recommend';
import { useStore } from '../lib/store';
import { bubbleLayout, genreStats, genreTitles, nextGenres, type GenreStat } from '../lib/taste';
import { useNav } from '../nav';
import { Poster, ScoreBadge } from '../components/Poster';
import { ChevronRight } from '../components/Icons';
import { Screen, SectionHeader, Shelf, TitleRow } from '../components/ui';

/** Rough width of a label in Inter at `size`px, used to make sure each name fits inside its bubble. */
const textW = (s: string, size: number) => s.length * size * 0.6;
const MIN_W = 340;

export function TasteMap({ active }: { active: boolean }) {
  const { data, ratings } = useStore();
  const nav = useNav();
  const stats = useMemo(() => genreStats(ratings), [ratings]);
  const all = [...stats.values()];
  const explored = all.filter((s) => s.rated.length);
  const empty = explored.length === 0;
  const favorite = [...explored].sort((a, b) => b.rated.length - a.rated.length || b.avg - a.avg)[0];

  const [picked, setPicked] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = picked ?? favorite?.genre ?? null;
  const sel = selected ? stats.get(selected)! : null;

  // Your genres as bubbles sized by how much you watch them. Before any ratings, every genre
  // appears as an outline sized by how much of the library it covers.
  const layout = useMemo(() => {
    const list = [...stats.values()];
    const none = list.every((s) => !s.rated.length);
    const val = (s: GenreStat) => (none ? s.catalog : s.rated.length);
    const shown = list.filter((s) => val(s) > 0);
    const max = Math.max(1, ...shown.map(val));
    return bubbleLayout(shown.map((s) => ({
      genre: s.genre,
      r: Math.max((none ? 18 : 22) + (none ? 22 : 34) * Math.sqrt(val(s) / max), textW(s.genre, 10) / 2 + 8),
    })));
  }, [stats]);
  const [bx, by, bw, bh] = layout.box;
  const PAD = 14;
  const vw = Math.max(bw + PAD * 2, MIN_W);
  const vh = bh + PAD * 2;
  const vx = bx + bw / 2 - vw / 2;

  const dismissed = useMemo(() => new Set(data.dismissed), [data.dismissed]);
  const next = useMemo(() => {
    if (!selected) return [];
    const recs = recommend(ratings, dismissed).filter((r) => r.title.genres.includes(selected)).map((r) => r.title);
    // Unexplored genres have no signal yet, so fall back to the genre's best-known titles.
    const seen = new Set(recs.map((t) => t.id));
    const known = genreTitles(selected).filter((t) => !ratings.has(t.id) && !dismissed.has(t.id) && !seen.has(t.id));
    return [...recs, ...known].slice(0, 12);
  }, [selected, ratings, dismissed]);

  const suggestions = useMemo(() => nextGenres(stats), [stats]);
  const pick = (g: string, scroll = false) => {
    setPicked(g);
    if (scroll) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <Screen title="Taste Map" active={active}>
      <div className="coverage">
        <div className="coverage-head">
          <strong>{explored.length}<span>/{GENRES.length}</span></strong>
          <p>{empty ? 'genres explored. Tap one to find something to rate.' : 'genres explored'}</p>
        </div>
        <div className="coverage-bar" aria-hidden="true">
          {GENRES.map((g) => (
            <i key={g} className={stats.get(g)!.rated.length ? 'on' : ''} style={{ ['--c' as string]: GENRE_COLORS[g] }} />
          ))}
        </div>
      </div>

      <div className={`bubbles ${empty ? 'ghost' : ''}`}>
        <svg viewBox={`${vx} ${by - PAD} ${vw} ${vh}`} role="img" aria-label="Genres you've explored">
          {layout.bubbles.map((b, i) => {
            const s = stats.get(b.genre)!;
            const on = selected === b.genre;
            const fs = Math.min(13, 8 + b.r / 8, (2 * b.r - 12) / (b.genre.length * 0.6));
            const showCount = !empty && b.r >= 30;
            return (
              <g key={b.genre} className={`bubble ${on ? 'on' : ''}`} transform={`translate(${b.x} ${b.y})`}
                style={{ ['--c' as string]: GENRE_COLORS[b.genre] }}
                role="button" tabIndex={0} aria-pressed={on} aria-label={`${b.genre}: ${s.rated.length} ranked`}
                onClick={() => pick(b.genre)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pick(b.genre)}>
                <g className="pop" style={{ animationDelay: `${i * 25}ms` }}>
                  <circle r={b.r} className="fill" />
                  <text className="name" y={showCount ? -fs * 0.15 : 0} dy="0.35em" style={{ fontSize: fs }}>{b.genre}</text>
                  {showCount && <text className="n" y={fs * 1.05} dy="0.35em">{s.rated.length}</text>}
                </g>
              </g>
            );
          })}
          {/* Drawn last so neighbouring bubbles never cover the frame. */}
          {layout.bubbles.filter((b) => b.genre === selected).map((b) => (
            <g key="selection" transform={`translate(${b.x} ${b.y})`}><Selection r={b.r} /></g>
          ))}
        </svg>
      </div>

      {sel && (
        <div className="panel" ref={panelRef} style={{ ['--c' as string]: GENRE_COLORS[sel.genre] }}>
          <div className="panel-head">
            <span className="swatch" />
            <div>
              <h2>{sel.genre}</h2>
              <p>
                {sel.rated.length
                  ? `${sel.rated.length} ranked · ${Math.round((sel.rated.length / ratings.size) * 100)}% of your list`
                  : 'Not explored yet'}
              </p>
            </div>
            {sel.rated.length > 0 && <ScoreBadge rating={{ score: sel.avg, sentiment: sel.avg >= 6.8 ? 'liked' : sel.avg >= 3.4 ? 'fine' : 'disliked' }} />}
          </div>
          <div className="progress" aria-label={`${sel.rated.length} of ${sel.catalog} titles`}>
            <span style={{ width: `${Math.max(sel.rated.length ? 2 : 0, (sel.rated.length / sel.catalog) * 100)}%` }} />
          </div>
          <p className="progress-caption">{sel.rated.length} of {sel.catalog} in the library</p>
        </div>
      )}

      {sel && sel.rated.length > 0 && (
        <>
          <SectionHeader title="Your top" />
          <div className="list">
            {sel.rated.slice(0, 3).map((r, i) => <TitleRow key={r.id} t={BY_ID.get(r.id)!} rank={i + 1} />)}
          </div>
        </>
      )}

      {sel && next.length > 0 && (
        <>
          <SectionHeader title={sel.rated.length ? 'Go deeper' : 'Start here'}
            subtitle={sel.rated.length ? undefined : 'Seen any of these? Tap to rate'} />
          <Shelf>
            {next.map((t) => (
              <button key={t.id} className="card card-md" onClick={() => (sel.rated.length ? nav.openDetail(t.id) : nav.openRate(t.id))}>
                <Poster t={t} size="md" />
                <span className="card-title">{t.title}</span>
                <span className="card-sub">{t.year}</span>
              </button>
            ))}
          </Shelf>
        </>
      )}

      {!empty && suggestions.length > 0 && (
        <>
          <SectionHeader title="Explore next" subtitle="Unexplored genres closest to your taste" />
          <div className="list">
            {(showAll ? suggestions : suggestions.slice(0, 3)).map(({ genre, via }) => (
              <button key={genre} className={`setting genre-next ${selected === genre ? 'on' : ''}`}
                style={{ ['--c' as string]: GENRE_COLORS[genre] }} onClick={() => pick(genre, true)}>
                <i className="ring" />
                <span>
                  <strong>{genre}</strong>
                  <small>{via.length ? `Pairs with your ${via.join(' and ')}` : `${stats.get(genre)!.catalog} titles in the library`}</small>
                </span>
                <ChevronRight size={16} className="row-chevron" />
              </button>
            ))}
          </div>
          {suggestions.length > 3 && (
            <button className="text-btn subtle center" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${suggestions.length}`}
            </button>
          )}
        </>
      )}
    </Screen>
  );
}

/** Figma-style selection, hugging the bubble: a thin blue ring with square handles on the diagonals. */
function Selection({ r }: { r: number }) {
  const s = r + 3;
  const d = s * Math.SQRT1_2;
  return (
    <g className="selection">
      <circle r={s} />
      {[[-d, -d], [d, -d], [-d, d], [d, d]].map(([x, y]) => <rect key={`${x},${y}`} className="handle" x={x - 3} y={y - 3} width={6} height={6} />)}
    </g>
  );
}
