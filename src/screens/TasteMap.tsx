import { useMemo, useRef, useState } from 'react';
import type { Title, Verdict } from '../types';
import { BY_ID, CATALOG, ORDER, metaLine } from '../lib/catalog';
import { NO_FILTER, VERDICTS, countVerdicts, filtering, passes, verdictSummary, type ReviewFilter } from '../lib/rating';
import { recommend } from '../lib/recommend';
import { HAS_MAP, HOODS, frame, hoodOf, sky, syncSky, type Hood } from '../lib/skymap';
import { useStore } from '../lib/store';
import { UNIVERSE, keysOf, type Dimension } from '../lib/taste';
import { useNav } from '../nav';
import { BookmarkIcon, FilterIcon, PlanetIcon, RefreshIcon, XIcon } from '../components/Icons';
import { Poster, VerdictBadge } from '../components/Poster';
import { ReviewFilterChips, ReviewFilterGroups } from '../components/ReviewFilters';
import { SkyMap, WHOLE_SKY, type FlyTo } from '../components/SkyMap';
import { Screen, Segmented } from '../components/ui';

const DIMS: { value: Dimension; label: string }[] = [
  { value: 'genres', label: 'Genres' },
  { value: 'themes', label: 'Themes' },
  { value: 'decades', label: 'Decades' },
  { value: 'makers', label: 'Creators' },
];

/** Your good / ok / bad split in a group, as a small bar. */
function VerdictMix({ n }: { n: Record<Verdict, number> }) {
  return (
    <span className="mix" role="img" aria-label={verdictSummary(n)}>
      {VERDICTS.filter((v) => n[v]).map((v) => <i key={v} className={`v-${v}`} style={{ flexGrow: n[v] }} />)}
    </span>
  );
}

/** What the card at the bottom is showing: a title you tapped, a neighbourhood, or the group you highlighted. */
type Focus = { kind: 'title'; i: number } | { kind: 'hood'; hood: Hood } | null;

/**
 * The galaxy: every title in the library on one map, similar ones together, your ratings lit up
 * as constellations. Filters highlight a genre, theme, decade or creator, or narrow which of your
 * ratings show. Uncharted flies you to a part of the map you haven't explored that it thinks you'd like.
 */
export function TasteMap({ active }: { active: boolean }) {
  const { data, ratings, toggleWatchlist } = useStore();
  const nav = useNav();
  syncSky();
  const [dim, setDim] = useState<Dimension>('genres');
  const [key, setKey] = useState<string | null>(null);
  const [rf, setRf] = useState<ReviewFilter>(NO_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [focus, setFocus] = useState<Focus>(null);
  const [fly, setFly] = useState<FlyTo | null>(null);
  const lastHood = useRef<number | null>(null);
  const goTo = (f: Omit<FlyTo, 'key'> | null) => f && setFly({ ...f, key: Date.now() });

  const usedTags = useMemo(() => [...new Set([...ratings.values()].flatMap((r) => r.tags))], [ratings]);
  const shownRatings = useMemo(
    () => (filtering(rf) ? new Map([...ratings].filter(([, r]) => passes(r, rf))) : ratings),
    [ratings, rf],
  );
  const watch = useMemo(() => new Set(data.watchlist), [data.watchlist]);
  const dismissed = useMemo(() => new Set(data.dismissed), [data.dismissed]);
  const recs = useMemo(() => recommend(ratings, dismissed), [ratings, dismissed]);

  // The highlighted group's titles, by their place on the map.
  const highlight = useMemo(() => {
    if (!key) return null;
    const s = new Set<number>();
    for (let i = 0; i < sky.n; i++) if (keysOf(dim, CATALOG[i]).includes(key)) s.add(i);
    return s;
  }, [dim, key]);

  const pickKey = (k: string) => {
    const next = key === k ? null : k;
    setKey(next);
    setFocus(null);
    if (!next) return;
    const ids: number[] = [];
    for (let i = 0; i < sky.n; i++) if (keysOf(dim, CATALOG[i]).includes(next)) ids.push(i);
    goTo(frame(ids));
  };

  // Somewhere new: a neighbourhood you've barely rated in, weighted by how many of your
  // recommendations live there. With nothing rated yet, the bigger neighbourhoods.
  const uncharted = () => {
    const ratedIn = new Map<number, number>();
    for (const id of ratings.keys()) {
      const h = hoodOf(ORDER.get(id)!);
      if (h) ratedIn.set(h.id, (ratedIn.get(h.id) ?? 0) + 1);
    }
    const pull = new Map<number, number>();
    recs.slice(0, 400).forEach((r, rank) => {
      const h = hoodOf(ORDER.get(r.title.id)!);
      if (h) pull.set(h.id, (pull.get(h.id) ?? 0) + 1 / (1 + rank / 40));
    });
    const scored = HOODS.filter((h) => h.id !== lastHood.current)
      .map((h) => ({ h, s: (ratings.size ? pull.get(h.id) ?? 0.05 : Math.sqrt(h.n)) / (1 + (ratedIn.get(h.id) ?? 0) * 1.5) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 6);
    const total = scored.reduce((a, b) => a + b.s, 0);
    let r = Math.random() * total;
    const hood = (scored.find((x) => (r -= x.s) <= 0) ?? scored[0])?.h;
    if (!hood) return;
    lastHood.current = hood.id;
    setFocus({ kind: 'hood', hood });
    const ids: number[] = [];
    for (let i = 0; i < sky.n; i++) if (sky.c[i] === hood.id) ids.push(i);
    // Close enough in to read titles, even for a sprawling neighbourhood.
    const f = frame(ids);
    goTo(f && { ...f, w: Math.min(f.w, 0.12), h: Math.min(f.h, 0.12) });
  };

  /** Titles to try in a group: your recommendations there first, then its best-known titles you haven't rated. */
  const suggest = (inGroup: (t: Title, i: number) => boolean): Title[] => {
    const fromRecs = recs.filter((r) => inGroup(r.title, ORDER.get(r.title.id)!)).slice(0, 10).map((r) => r.title);
    const seen = new Set(fromRecs.map((t) => t.id));
    const out = [...fromRecs];
    for (let i = 0; i < sky.n && out.length < 12; i++) {
      const t = CATALOG[i];
      if (!seen.has(t.id) && !ratings.has(t.id) && !dismissed.has(t.id) && inGroup(t, i)) out.push(t);
    }
    return out;
  };

  const narrowed = filtering(rf);
  const anyFilter = narrowed || !!key;
  const clearAll = () => {
    setRf(NO_FILTER);
    setKey(null);
  };

  // The card: a tapped title wins, then a neighbourhood, then the highlighted group.
  let card = null;
  if (focus?.kind === 'title') {
    const t = CATALOG[focus.i];
    const r = ratings.get(t.id);
    const saved = watch.has(t.id);
    const hood = hoodOf(focus.i);
    card = (
      <div className="sky-card title-card" key={t.id}>
        <button className="sky-card-main" onClick={() => nav.openDetail(t.id)}>
          <Poster t={t} size="sm" />
          <span className="sky-card-text">
            <strong>{t.title}</strong>
            <small>{metaLine(t)}</small>
            {hood && <small className="sky-hood" style={{ ['--c' as string]: hood.color }}><i />{hood.label}</small>}
          </span>
        </button>
        <div className="sky-card-actions">
          {r ? <VerdictBadge rating={r} size="md" /> : (
            <>
              <button className={`icon-btn glass ${saved ? 'on' : ''}`} onClick={() => toggleWatchlist(t.id)}
                aria-label={saved ? 'Remove from watchlist' : 'Save to watchlist'} aria-pressed={saved}>
                <BookmarkIcon size={16} filled={saved} />
              </button>
              <button className="rate-btn" onClick={() => nav.openRate(t.id)}>Rate</button>
            </>
          )}
          <button className="icon-btn ghost" onClick={() => setFocus(null)} aria-label="Close"><XIcon size={14} /></button>
        </div>
      </div>
    );
  } else if (focus?.kind === 'hood' || key) {
    const hood = focus?.kind === 'hood' ? focus.hood : null;
    const inGroup = hood ? (_: Title, i: number) => sky.c[i] === hood.id : (t: Title) => keysOf(dim, t).includes(key!);
    const mine = [...ratings.values()].filter((r) => inGroup(BY_ID.get(r.id)!, ORDER.get(r.id)!));
    const total = hood ? hood.n : highlight?.size ?? 0;
    const n = countVerdicts(mine);
    const picks = suggest(inGroup);
    card = (
      <div className="sky-card group-card" key={hood ? `h${hood.id}` : `k${key}`} style={{ ['--c' as string]: hood?.color ?? 'var(--accent)' }}>
        <div className="group-head">
          <span className="swatch" />
          <div>
            <strong>{hood ? hood.label : key}</strong>
            <small>{total.toLocaleString()} titles · {mine.length ? `you've rated ${mine.length}` : 'uncharted for you'}</small>
          </div>
          {mine.length > 0 && <VerdictMix n={n} />}
          <button className="icon-btn ghost" onClick={() => (hood ? setFocus(null) : setKey(null))} aria-label="Close"><XIcon size={14} /></button>
        </div>
        {picks.length > 0 && (
          <div className="sky-shelf">
            {picks.map((t) => (
              <button key={t.id} className="sky-pick" onClick={() => { setFocus({ kind: 'title', i: ORDER.get(t.id)! }); goTo({ x: sky.x[ORDER.get(t.id)!], y: sky.y[ORDER.get(t.id)!], w: 0.03, h: 0.03 }); }}>
                <Poster t={t} size="sm" />
                <span>{t.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Screen title="Galaxy" active={active} className="sky">
      {HAS_MAP ? (
        <SkyMap ratings={shownRatings} watch={watch} highlight={highlight} size={sky.n}
          selected={focus?.kind === 'title' ? focus.i : null} fly={fly} bottom={focus?.kind === 'title' ? 110 : focus || key ? 220 : 0}
          onPick={(i) => setFocus(i === null ? (focus?.kind === 'hood' ? focus : null) : { kind: 'title', i })} />
      ) : (
        <p className="theater-empty">The map needs rebuilding: run <code>npm run map</code>.</p>
      )}

      <div className="sky-top">
        <button className="sky-btn" onClick={uncharted}>
          <PlanetIcon size={16} /> Uncharted
        </button>
        <span className="sky-spacer" />
        <button className="icon-btn tool glass" onClick={() => { goTo(WHOLE_SKY); setFocus(null); }} aria-label="Show the whole map">
          <RefreshIcon size={16} />
        </button>
        <button className={`icon-btn tool glass ${filterOpen || anyFilter ? 'on' : ''}`} onClick={() => setFilterOpen((v) => !v)}
          aria-expanded={filterOpen} aria-label="Filters">
          <FilterIcon size={17} />
        </button>
      </div>

      {filterOpen ? (
        <div className="sky-panel filter-panel">
          <div className="filter-head">
            <p className="filter-title">Map filters</p>
            {anyFilter && <button className="filter-clear" onClick={clearAll}>Clear all</button>}
          </div>
          <div className="filter-group" role="group" aria-label="Highlight">
            <p className="filter-label">Highlight</p>
            <Segmented<Dimension> value={dim} options={DIMS} onChange={(d) => { setDim(d); setKey(null); }} />
            <div className="genre-wrap chip-scroll">
              {UNIVERSE[dim].map((k) => (
                <button key={k} className={`chip toggle any ${key === k ? 'on' : ''}`} onClick={() => pickKey(k)} aria-pressed={key === k}>{k}</button>
              ))}
            </div>
          </div>
          <ReviewFilterGroups value={rf} onChange={setRf} tags={usedTags} />
        </div>
      ) : anyFilter && (
        <div className="sky-chips genre-wrap">
          {key && (
            <button className="chip removable" onClick={() => setKey(null)} aria-label={`Stop highlighting ${key}`}>
              {key} <XIcon size={12} strokeWidth={3} />
            </button>
          )}
          <ReviewFilterChips value={rf} onChange={setRf} />
        </div>
      )}

      {card && <div className="sky-bottom">{card}</div>}
    </Screen>
  );
}
