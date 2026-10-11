import { useMemo, useRef, useState } from 'react';
import type { Rating, Title } from '../types';
import { BY_ID, GENRE_COLORS } from '../lib/catalog';
import { recommend } from '../lib/recommend';
import { useStore } from '../lib/store';
import { UNIVERSE, bubbleLayout, groupStats, groupTitles, keysOf, type Dimension, type GroupStat } from '../lib/taste';
import { useNav } from '../nav';
import { Poster, ScoreBadge } from '../components/Poster';
import { Screen, SectionHeader, Segmented, Shelf, TitleRow } from '../components/ui';

const DIMS: { value: Dimension; label: string; noun: string }[] = [
  { value: 'genres', label: 'Genres', noun: 'genres' },
  { value: 'themes', label: 'Themes', noun: 'popular themes' },
  { value: 'decades', label: 'Decades', noun: 'decades' },
  { value: 'makers', label: 'Creators', noun: 'top directors & networks' },
];

const PALETTE = Object.values(GENRE_COLORS);
const colorOf = (dim: Dimension, name: string) => {
  if (dim === 'genres') return GENRE_COLORS[name] ?? '#8C8C8C';
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

const sentimentOf = (avg: number): Rating['sentiment'] => (avg >= 6.8 ? 'liked' : avg >= 3.4 ? 'fine' : 'disliked');

/** Splits a label over at most two lines, breaking at the space nearest the middle. */
function lines(label: string): string[] {
  if (label.length <= 11 || !label.includes(' ')) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) if (label[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return [label.slice(0, best), label.slice(best + 1)];
}

const MAX_BUBBLES = 18;
const MAX_MISSING = 14;
const MIN_W = 340;

export function TasteMap({ active }: { active: boolean }) {
  const { data, ratings } = useStore();
  const nav = useNav();
  const [dim, setDim] = useState<Dimension>('genres');
  const [picked, setPicked] = useState<Record<Dimension, string | null>>({ genres: null, themes: null, decades: null, makers: null });
  const panelRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => groupStats(dim, ratings), [dim, ratings]);
  const explored = useMemo(
    () => [...stats.values()].filter((s) => s.rated.length)
      .sort((a, b) => b.rated.length - a.rated.length || b.avg - a.avg),
    [stats],
  );
  const missing = UNIVERSE[dim].filter((k) => !stats.get(k)!.rated.length);
  const coveredCount = UNIVERSE[dim].length - missing.length;

  const selected = picked[dim] ?? explored[0]?.name ?? null;
  const sel = selected ? stats.get(selected) ?? null : null;
  const pick = (k: string, scroll = false) => {
    setPicked((p) => ({ ...p, [dim]: k }));
    if (scroll) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const layout = useMemo(() => {
    const shown = explored.slice(0, MAX_BUBBLES);
    const max = Math.max(1, ...shown.map((s) => s.rated.length));
    return bubbleLayout(shown.map((s) => ({ name: s.name, r: 27 + 31 * Math.sqrt(s.rated.length / max) })));
  }, [explored]);
  // Each bubble shows your favourite title in it, but never one another bubble already uses,
  // so Drama, Crime and Action don't all wear the same poster. Bigger bubbles choose first.
  const covers = useMemo(() => {
    const used = new Set<string>();
    const m = new Map<string, Title>();
    for (const b of [...layout.bubbles].sort((x, y) => y.r - x.r)) {
      const withImage = stats.get(b.name)!.rated.map((r) => BY_ID.get(r.id)!).filter((t) => t.image);
      const t = withImage.find((x) => !used.has(x.id)) ?? withImage[0];
      if (t) {
        used.add(t.id);
        m.set(b.name, t);
      }
    }
    return m;
  }, [layout, stats]);
  const [bx, by, bw, bh] = layout.box;
  const PAD = 16;
  const vw = Math.max(bw + PAD * 2, MIN_W);
  const vh = bh + PAD * 2;
  const vx = bx + bw / 2 - vw / 2;

  const dismissed = useMemo(() => new Set(data.dismissed), [data.dismissed]);
  const recs = useMemo(() => recommend(ratings, dismissed), [ratings, dismissed]);
  const next = useMemo(() => {
    if (!selected) return [];
    const fromRecs = recs.filter((r) => keysOf(dim, r.title).includes(selected)).map((r) => r.title);
    // Unexplored groups have no signal yet, so fall back to the group's best-known titles.
    const seen = new Set(fromRecs.map((t) => t.id));
    const known = groupTitles(dim, selected).filter((t) => !ratings.has(t.id) && !dismissed.has(t.id) && !seen.has(t.id));
    return [...fromRecs, ...known].slice(0, 12);
  }, [dim, selected, recs, ratings, dismissed]);

  const noun = DIMS.find((d) => d.value === dim)!.noun;
  const rankedIn = explored.reduce((n, s) => n + s.rated.length, 0);
  const overall = rankedIn ? explored.reduce((n, s) => n + s.avg * s.rated.length, 0) / rankedIn : 0;

  return (
    <Screen title="Taste Map" active={active}>
      <div className="filter-bar">
        <Segmented<Dimension> value={dim} onChange={setDim} options={DIMS} />
      </div>

      <div className="theater">
        <div className="theater-head">
          <strong>{coveredCount}<span>/{UNIVERSE[dim].length}</span></strong>
          <p>{noun} explored</p>
        </div>

        {layout.bubbles.length > 0 ? (
          <svg viewBox={`${vx} ${by - PAD} ${vw} ${vh}`} role="group" aria-label={`Your ${noun}, average ${overall.toFixed(1)}`}>
            {layout.bubbles.map((b, i) => (
              <BubbleNode key={b.name} b={b} s={stats.get(b.name)!} cover={covers.get(b.name)} i={i} color={colorOf(dim, b.name)}
                on={selected === b.name} onPick={() => pick(b.name)} />
            ))}
          </svg>
        ) : (
          <p className="theater-empty">Rate a few titles and your {dim === 'makers' ? 'creators' : dim} light up here.</p>
        )}

        {missing.length > 0 && (
          <div className="unexplored">
            <p className="unexplored-label">Not explored yet · {missing.length}</p>
            <div className="unexplored-grid">
              {missing.slice(0, MAX_MISSING).map((k) => (
                <button key={k} className={`ghost-dot ${selected === k ? 'on' : ''}`} style={{ ['--c' as string]: colorOf(dim, k) }}
                  onClick={() => pick(k, true)}>
                  <i />
                  <span>{k}</span>
                </button>
              ))}
            </div>
            {missing.length > MAX_MISSING && <p className="unexplored-more">and {missing.length - MAX_MISSING} more</p>}
          </div>
        )}
      </div>

      {sel && (
        <div className="panel" ref={panelRef} style={{ ['--c' as string]: colorOf(dim, sel.name) }}>
          <div className="panel-head">
            <span className="swatch" />
            <div>
              <h2>{sel.name}</h2>
              <p>
                {sel.rated.length
                  ? `${sel.rated.length} ranked · ${Math.round((sel.rated.length / ratings.size) * 100)}% of your list`
                  : 'Not explored yet'}
              </p>
            </div>
            {sel.rated.length > 0 && <ScoreBadge rating={{ score: sel.avg, sentiment: sentimentOf(sel.avg) }} />}
          </div>
          <div className="progress" aria-label={`${sel.rated.length} of ${sel.catalog} titles`}>
            <span style={{ width: `${Math.max(sel.rated.length ? 2 : 0, (sel.rated.length / Math.max(1, sel.catalog)) * 100)}%` }} />
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
    </Screen>
  );
}

/** One explored group: the poster of your favourite title in it, its name and your average score. */
function BubbleNode({ b, s, cover, i, color, on, onPick }: {
  b: { name: string; x: number; y: number; r: number };
  s: GroupStat;
  cover?: Title;
  i: number;
  color: string;
  on: boolean;
  onPick: () => void;
}) {
  const ls = lines(b.name);
  const longest = Math.max(...ls.map((l) => l.length));
  const fs = Math.max(8.5, Math.min(13, 6 + b.r / 7, (b.r * 1.6) / (longest * 0.58)));
  const lh = fs * 1.1;
  const top = -((ls.length - 1) * lh) / 2 - fs * 0.55;
  const clip = `clip-${i}-${b.name.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <g className={`bubble ${on ? 'on' : ''}`} transform={`translate(${b.x} ${b.y})`} style={{ ['--c' as string]: color }}
      role="button" tabIndex={0} aria-pressed={on} aria-label={`${b.name}: ${s.rated.length} ranked, average ${s.avg.toFixed(1)}`}
      onClick={onPick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick()}>
      <g className="pop" style={{ animationDelay: `${i * 30}ms` }}>
        <clipPath id={clip}><circle r={b.r} /></clipPath>
        <circle r={b.r} className="base" />
        {cover && (
          <image href={cover.image![0]} x={-b.r} y={-b.r} width={b.r * 2} height={b.r * 2}
            preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        )}
        <circle r={b.r} className="shade" />
        <circle r={b.r} className="ring" />
        <text className="name" style={{ fontSize: fs }}>
          {ls.map((l, j) => <tspan key={j} x={0} y={top + j * lh} dy="0.35em">{l}</tspan>)}
        </text>
        <text className={`avg s-${sentimentOf(s.avg)}`} y={top + (ls.length - 1) * lh + fs * 0.9 + 8} dy="0.35em"
          style={{ fontSize: Math.max(9.5, fs * 0.92) }}>
          ★ {s.avg.toFixed(1)}
        </text>
      </g>
    </g>
  );
}
