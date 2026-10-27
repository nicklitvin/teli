import { useMemo, useRef, useState } from 'react';
import type { Title, Verdict } from '../types';
import { BY_ID, GENRE_COLORS } from '../lib/catalog';
import { NO_FILTER, VERDICTS, filtering, passes, verdictSummary, type ReviewFilter } from '../lib/rating';
import { recommend } from '../lib/recommend';
import { useStore } from '../lib/store';
import { UNIVERSE, bubbleLayout, groupStats, groupTitles, keysOf, type Dimension, type GroupStat } from '../lib/taste';
import { useNav } from '../nav';
import { ChevronDown, FilterIcon } from '../components/Icons';
import { Poster } from '../components/Poster';
import { ReviewFilterChips, ReviewFilterGroups } from '../components/ReviewFilters';
import { Cards, Screen, SectionHeader, Segmented, Shelf, TitleRow } from '../components/ui';

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

/** Your good / mid / bad split in a group, as a small bar. */
function VerdictMix({ n }: { n: Record<Verdict, number> }) {
  return (
    <span className="mix" role="img" aria-label={verdictSummary(n)}>
      {VERDICTS.filter((v) => n[v]).map((v) => <i key={v} className={`v-${v}`} style={{ flexGrow: n[v] }} />)}
    </span>
  );
}

/** Splits a label over at most two lines, breaking at the space nearest the middle. */
function lines(label: string): string[] {
  if (label.length <= 11 || !label.includes(' ')) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) if (label[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return [label.slice(0, best), label.slice(best + 1)];
}

const MAX_BUBBLES = 18;
const MIN_W = 340;

export function TasteMap({ active }: { active: boolean }) {
  const { data, ratings } = useStore();
  const nav = useNav();
  const [dim, setDim] = useState<Dimension>('genres');
  const [picked, setPicked] = useState<Record<Dimension, string | null>>({ genres: null, themes: null, decades: null, makers: null });
  const panelRef = useRef<HTMLDivElement>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [rf, setRf] = useState<ReviewFilter>(NO_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const usedTags = useMemo(() => [...new Set([...ratings.values()].flatMap((r) => r.tags))], [ratings]);

  // The map can show just part of your list: only good ones, ones you'd rewatch, a tag.
  const shownRatings = useMemo(
    () => (filtering(rf) ? new Map([...ratings].filter(([, r]) => passes(r, rf))) : ratings),
    [ratings, rf],
  );
  const stats = useMemo(() => groupStats(dim, shownRatings), [dim, shownRatings]);
  const explored = useMemo(
    () => [...stats.values()].filter((s) => s.rated.length)
      .sort((a, b) => b.rated.length - a.rated.length || b.verdicts.good / b.rated.length - a.verdicts.good / a.rated.length),
    [stats],
  );
  const missing = UNIVERSE[dim].filter((k) => !stats.get(k)!.rated.length);
  const coveredCount = UNIVERSE[dim].length - missing.length;

  const selected = picked[dim] ?? explored[0]?.name ?? null;
  const sel = selected ? stats.get(selected) ?? null : null;
  // Picking a planet nudges its stats into view. Uncharted planets live in a drawer, which closes on pick.
  const pick = (k: string) => {
    setPicked((p) => ({ ...p, [dim]: k }));
    setShowMissing(false);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
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
  const PAD = 26; // room for the ring around the selected planet
  const vw = Math.max(bw + PAD * 2, MIN_W);
  const vh = bh + PAD * 2;
  const vx = bx + bw / 2 - vw / 2;

  const dismissed = useMemo(() => new Set(data.dismissed), [data.dismissed]);
  const recs = useMemo(() => recommend(ratings, dismissed), [ratings, dismissed]);
  const next = useMemo(() => {
    if (!selected) return [];
    const fromRecs = recs.filter((r) => keysOf(dim, r.title).includes(selected)).map((r) => r.title);
    // Uncharted groups have no signal yet, so fall back to the group's best-known titles.
    const seen = new Set(fromRecs.map((t) => t.id));
    const known = groupTitles(dim, selected).filter((t) => !ratings.has(t.id) && !dismissed.has(t.id) && !seen.has(t.id));
    return [...fromRecs, ...known].slice(0, 12);
  }, [dim, selected, recs, ratings, dismissed]);

  const noun = DIMS.find((d) => d.value === dim)!.noun;
  const narrowed = filtering(rf);

  return (
    <Screen title="Galaxy" active={active}>
      <div className="tools">
        <div className="tools-row">
          <Segmented<Dimension> value={dim} onChange={setDim} options={DIMS} />
          <button className={`icon-btn tool ${filterOpen || narrowed ? 'on' : ''}`} onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen} aria-label="Filters">
            <FilterIcon size={17} />
          </button>
        </div>
        {filterOpen ? (
          <div className="filter-panel">
            <div className="filter-head">
              <p className="filter-title">Show on the map</p>
              {narrowed && <button className="filter-clear" onClick={() => setRf(NO_FILTER)}>Clear all</button>}
            </div>
            <ReviewFilterGroups value={rf} onChange={setRf} tags={usedTags} />
          </div>
        ) : narrowed && (
          <div className="genre-wrap"><ReviewFilterChips value={rf} onChange={setRf} /></div>
        )}
      </div>

      <div className="theater">
        <div className="theater-head">
          <strong>{coveredCount}<span>/{UNIVERSE[dim].length}</span></strong>
          <p>{noun} charted</p>
          {missing.length > 0 && (
            <button className={`uncharted-btn ${showMissing ? 'on' : ''}`} onClick={() => setShowMissing((v) => !v)}
              aria-expanded={showMissing}>
              {missing.length} uncharted <ChevronDown size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {showMissing && (
          <div className="unexplored">
            <div className="unexplored-grid">
              {missing.map((k) => (
                <button key={k} className={`ghost-dot ${selected === k ? 'on' : ''}`} style={{ ['--c' as string]: colorOf(dim, k) }}
                  onClick={() => pick(k)}>
                  <i />
                  <span>{k}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {layout.bubbles.length > 0 ? (
          <svg viewBox={`${vx} ${by - PAD} ${vw} ${vh}`} role="group" aria-label={`Your ${noun}`}>
            <defs>
              <radialGradient id="planet-shade" cx="34%" cy="28%" r="78%">
                <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
                <stop offset="0.38" stopColor="#000" stopOpacity="0.12" />
                <stop offset="0.8" stopColor="#000" stopOpacity="0.62" />
                <stop offset="1" stopColor="#000" stopOpacity="0.82" />
              </radialGradient>
              <filter id="atmosphere" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>
            {[0.62, 0.9, 1.18].map((k) => (
              <ellipse key={k} className="orbit" cx={bx + bw / 2} cy={by + bh / 2} rx={(bw / 2) * k + 10} ry={(bh / 2) * k + 6} />
            ))}
            {layout.bubbles.map((b, i) => (
              <BubbleNode key={b.name} b={b} s={stats.get(b.name)!} cover={covers.get(b.name)} i={i} color={colorOf(dim, b.name)}
                on={selected === b.name} onPick={() => pick(b.name)} />
            ))}
          </svg>
        ) : (
          <p className="theater-empty">{narrowed && ratings.size ? 'None of your ratings match these filters.' : 'Rate a few titles and your first planets appear here.'}</p>
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
                  ? `${sel.rated.length} rated · ${verdictSummary(sel.verdicts)}`
                  : narrowed ? 'Nothing here matches your filters' : 'Uncharted: you haven’t rated anything here yet'}
              </p>
            </div>
            {sel.rated.length > 0 && <VerdictMix n={sel.verdicts} />}
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
          <Cards>
            {sel.rated.slice(0, 3).map((r) => <TitleRow key={r.id} t={BY_ID.get(r.id)!} />)}
          </Cards>
        </>
      )}

      {sel && next.length > 0 && (
        <>
          <SectionHeader title={sel.rated.length ? 'Explore further' : 'Make first landing'}
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

/** One explored group as a planet: your favourite title in it for a surface, its name and your good / mid / bad split. */
function BubbleNode({ b, s, cover, i, color, on, onPick }: {
  b: { name: string; x: number; y: number; r: number };
  s: GroupStat;
  cover?: Title;
  i: number;
  color: string;
  on: boolean;
  onPick: () => void;
}) {
  // Themes are stored lowercase ("heist", "ai"); show them like names.
  const ls = lines(b.name.length <= 2 ? b.name.toUpperCase() : b.name[0].toUpperCase() + b.name.slice(1));
  const longest = Math.max(...ls.map((l) => l.length));
  const fs = Math.max(8.5, Math.min(13, 6 + b.r / 7, (b.r * 1.6) / (longest * 0.58)));
  const lh = fs * 1.1;
  const top = -((ls.length - 1) * lh) / 2 - fs * 0.55;
  const clip = `clip-${i}-${b.name.replace(/[^a-z0-9]/gi, '')}`;
  const n = s.rated.length;
  const barW = Math.min(64, b.r * 1.15);
  const barY = top + (ls.length - 1) * lh + fs * 0.55 + 7;
  let x = -barW / 2;
  const segs = VERDICTS.filter((v) => s.verdicts[v]).map((v) => {
    const w = (barW * s.verdicts[v]) / n;
    const seg = { v, x, w };
    x += w;
    return seg;
  });
  const rx = b.r * 1.55;
  const ry = b.r * 0.36;
  return (
    <g className={`bubble ${on ? 'on' : ''}`} transform={`translate(${b.x} ${b.y})`} style={{ ['--c' as string]: color }}
      role="button" tabIndex={0} aria-pressed={on} aria-label={`${b.name}: ${n} rated, ${verdictSummary(s.verdicts)}`}
      onClick={onPick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick()}>
      <g className="pop" style={{ animationDelay: `${i * 30}ms` }}>
        <circle r={b.r + 2} className="atmosphere" filter="url(#atmosphere)" />
        {on && <ellipse className="saturn back" rx={rx} ry={ry} transform="rotate(-16)" />}
        <clipPath id={clip}><circle r={b.r} /></clipPath>
        <circle r={b.r} className="base" />
        {cover && (
          <image href={cover.image![0]} x={-b.r} y={-b.r} width={b.r * 2} height={b.r * 2}
            preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        )}
        <circle r={b.r} className="tint" />
        <circle r={b.r} className="shade" fill="url(#planet-shade)" />
        <circle r={b.r} className="rim" />
        {on && <path className="saturn" d={`M ${-rx} 0 A ${rx} ${ry} 0 0 0 ${rx} 0`} transform="rotate(-16)" />}
        <text className="name" style={{ fontSize: fs }}>
          {ls.map((l, j) => <tspan key={j} x={0} y={top + j * lh} dy="0.35em">{l}</tspan>)}
        </text>
        <clipPath id={`${clip}-mix`}><rect x={-barW / 2} y={barY} width={barW} height={5} rx={2.5} /></clipPath>
        <rect className="mix-back" x={-barW / 2 - 1.5} y={barY - 1.5} width={barW + 3} height={8} rx={4} />
        <g clipPath={`url(#${clip}-mix)`}>
          {segs.map((g) => <rect key={g.v} className={`mix-seg v-${g.v}`} x={g.x} y={barY} width={g.w} height={5} />)}
        </g>
      </g>
    </g>
  );
}
