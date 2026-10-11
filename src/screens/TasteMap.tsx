import { useMemo, useState } from 'react';
import { BY_ID, GENRES, GENRE_COLORS } from '../lib/catalog';
import { recommend } from '../lib/recommend';
import { useStore } from '../lib/store';
import { EDGES, MAP_H, MAP_W, POSITIONS, exploredCount, genreStats, genreTitles, neighbors, pairKey, yourEdges } from '../lib/taste';
import { useNav } from '../nav';
import { Poster, ScoreBadge } from '../components/Poster';
import { Screen, SectionHeader, Shelf, TitleRow } from '../components/ui';

const radius = (count: number, max: number) => (count ? 11 + 14 * Math.sqrt(count / max) : 7);

export function TasteMap({ active }: { active: boolean }) {
  const { data, ratings } = useStore();
  const nav = useNav();
  const stats = useMemo(() => genreStats(ratings), [ratings]);
  const pairs = useMemo(() => yourEdges(ratings), [ratings]);
  const explored = exploredCount(ratings);
  const max = Math.max(1, ...[...stats.values()].map((s) => s.rated.length));
  const favorite = [...stats.values()].sort((a, b) => b.rated.length - a.rated.length || b.avg - a.avg)[0];

  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? (favorite.rated.length ? favorite.genre : null);
  const sel = selected ? stats.get(selected)! : null;

  const dismissed = useMemo(() => new Set(data.dismissed), [data.dismissed]);
  const next = useMemo(() => {
    if (!selected) return [];
    const recs = recommend(ratings, dismissed).filter((r) => r.title.genres.includes(selected)).map((r) => r.title);
    // Blind spots have no signal yet, so fall back to the genre's best-known titles.
    const seen = new Set(recs.map((t) => t.id));
    const known = genreTitles(selected).filter((t) => !ratings.has(t.id) && !dismissed.has(t.id) && !seen.has(t.id));
    return [...recs, ...known].slice(0, 12);
  }, [selected, ratings, dismissed]);

  const blind = GENRES.filter((g) => !stats.get(g)!.rated.length);
  const maxPair = Math.max(1, ...pairs.values());

  return (
    <Screen title="Taste Map" active={active}>
      <p className="map-summary">
        {ratings.size
          ? <>You've explored <b>{explored}</b> of {GENRES.length} genres. Bigger nodes are genres you watch more; lines connect genres you've watched together.</>
          : <>Rate a few titles and your map lights up. Genres that often go together sit close to each other.</>}
      </p>

      <div className="canvas">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="Map of genres you've explored">
          {EDGES.map((e) => {
            const a = POSITIONS.get(e.a)!;
            const b = POSITIONS.get(e.b)!;
            const yours = pairs.get(pairKey(e.a, e.b)) ?? 0;
            const hot = selected === e.a || selected === e.b;
            return (
              <line key={`${e.a}|${e.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                className={`edge ${yours ? 'yours' : ''} ${hot ? 'hot' : ''}`}
                strokeWidth={yours ? 1.25 + 3.5 * (yours / maxPair) : 1} />
            );
          })}
          {/* Pairs you've watched that the catalog rarely combines still deserve a line. */}
          {[...pairs.entries()].filter(([k]) => !EDGES.some((e) => pairKey(e.a, e.b) === k)).map(([k, n]) => {
            const [ga, gb] = k.split('|');
            const a = POSITIONS.get(ga)!;
            const b = POSITIONS.get(gb)!;
            return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="edge yours"
              strokeWidth={1.25 + 3.5 * (n / maxPair)} />;
          })}
          {GENRES.map((g, i) => {
            const p = POSITIONS.get(g)!;
            const s = stats.get(g)!;
            const r = radius(s.rated.length, max);
            const on = selected === g;
            const c = GENRE_COLORS[g] ?? '#8C8C8C';
            return (
              <g key={g} className={`node ${s.rated.length ? 'explored' : 'blind'} ${on ? 'on' : ''}`}
                transform={`translate(${p.x} ${p.y})`} style={{ ['--c' as string]: c, animationDelay: `${i * 18}ms` }}
                onClick={() => setPicked(g)} role="button" tabIndex={0} aria-label={`${g}: ${s.rated.length} ranked`}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPicked(g)}>
                <circle r={r + 10} className="hit" />
                <circle r={r} className="dot" />
                {s.rated.length > 0 && r >= 15 && <text className="count" dy="0.35em">{s.rated.length}</text>}
                {on && <SelectionBox r={r} />}
              </g>
            );
          })}
          {/* Labels go in their own layer so no node can cover another genre's name. */}
          {GENRES.map((g) => {
            const p = POSITIONS.get(g)!;
            const s = stats.get(g)!;
            const r = radius(s.rated.length, max);
            return (
              <g key={g} className={`tag ${s.rated.length ? '' : 'blind'} ${selected === g ? 'on' : ''}`}
                transform={`translate(${p.x} ${p.y + r + (selected === g ? 17 : 13)})`} aria-hidden="true">
                <rect x={-(g.length * 3.2 + 6)} y={-8} width={g.length * 6.4 + 12} height={16} rx={4} />
                <text dy="0.35em">{g}</text>
              </g>
            );
          })}
        </svg>
        <div className="canvas-legend">
          <span><i className="lg-dot" /> explored</span>
          <span><i className="lg-dot blind" /> not yet</span>
          <span><i className="lg-line" /> watched together</span>
        </div>
      </div>

      {sel ? (
        <div className="panel" style={{ ['--c' as string]: GENRE_COLORS[sel.genre] }}>
          <div className="panel-head">
            <span className="swatch" />
            <div>
              <h2>{sel.genre}</h2>
              <p>
                {sel.rated.length
                  ? `${sel.rated.length} ranked · avg ${sel.avg.toFixed(1)} · ${Math.round((sel.rated.length / ratings.size) * 100)}% of your list`
                  : 'A blind spot — nothing ranked yet'}
              </p>
            </div>
            {sel.rated.length > 0 && <ScoreBadge rating={{ score: sel.avg, sentiment: sel.avg >= 6.8 ? 'liked' : sel.avg >= 3.4 ? 'fine' : 'disliked' }} />}
          </div>
          <div className="progress" aria-label={`${sel.rated.length} of ${sel.catalog} titles`}>
            <span style={{ width: `${Math.max(sel.rated.length ? 2 : 0, (sel.rated.length / sel.catalog) * 100)}%` }} />
          </div>
          <p className="progress-caption">{sel.rated.length} of {sel.catalog} {sel.genre.toLowerCase()} titles in the library</p>
          <div className="chips tight">
            {neighbors(sel.genre).map((g) => (
              <button key={g} className="chip" style={{ ['--c' as string]: GENRE_COLORS[g] }} onClick={() => setPicked(g)}>
                {g} <span className="chip-n">{stats.get(g)!.rated.length}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {sel && sel.rated.length > 0 && (
        <>
          <SectionHeader title={`Your top ${sel.genre.toLowerCase()}`} />
          <div className="list">
            {sel.rated.slice(0, 3).map((r, i) => <TitleRow key={r.id} t={BY_ID.get(r.id)!} rank={i + 1} />)}
          </div>
        </>
      )}

      {sel && next.length > 0 && (
        <>
          <SectionHeader title={sel.rated.length ? 'Go deeper' : 'Start exploring'}
            subtitle={sel.rated.length ? `More ${sel.genre.toLowerCase()} picked for you` : 'Seen any of these? Tap to rate'} />
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

      {blind.length > 0 && ratings.size > 0 && (
        <>
          <SectionHeader title="Blind spots" subtitle="Genres you haven't ranked anything in" />
          <div className="chips tight pad">
            {blind.map((g) => (
              <button key={g} className="chip outline" style={{ ['--c' as string]: GENRE_COLORS[g] }} onClick={() => setPicked(g)}>{g}</button>
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}

/** Figma-style selection: a thin blue frame with square handles on the corners. */
function SelectionBox({ r }: { r: number }) {
  const s = r + 5;
  return (
    <g className="selection">
      <rect x={-s} y={-s} width={s * 2} height={s * 2} />
      {[[-s, -s], [s, -s], [-s, s], [s, s]].map(([x, y]) => <rect key={`${x},${y}`} className="handle" x={x - 3} y={y - 3} width={6} height={6} />)}
    </g>
  );
}
