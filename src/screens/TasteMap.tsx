import { useEffect, useMemo, useRef, useState } from 'react';
import type { Title, Verdict } from '../types';
import { BY_ID, CATALOG, ORDER, metaLine } from '../lib/catalog';
import { NO_FILTER, VERDICTS, countVerdicts, filtering, passes, verdictSummary, type ReviewFilter } from '../lib/rating';
import { recommend } from '../lib/recommend';
import { HAS_MAP, HOODS, frame, hoodOf, sky, syncSky, type Hood } from '../lib/skymap';
import { useStore } from '../lib/store';
import { UNIVERSE, keysOf, type Dimension } from '../lib/taste';
import { useNav } from '../nav';
import { BookmarkIcon, ChevronDown, FilterIcon, PlanetIcon, RefreshIcon, XIcon } from '../components/Icons';
import { Poster, VerdictBadge } from '../components/Poster';
import { ReviewFilterChips, ReviewFilterGroups } from '../components/ReviewFilters';
import { SkyMap, WHOLE_SKY, type FlyTo, type Show } from '../components/SkyMap';
import { Screen, Segmented } from '../components/ui';

const SHOWS: { value: Show; label: string }[] = [
  { value: 'all', label: 'Both' },
  { value: 'seen', label: 'Seen' },
  { value: 'unseen', label: 'Not seen' },
];
const SHOW_CHIP: Record<Show, string> = { all: '', seen: 'Seen only', unseen: 'Not seen only' };

/** How you like the map drawn, remembered on this device. */
function usePref<T extends string>(key: string, initial: T, ok: readonly T[]) {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key) as T | null;
      return s && ok.includes(s) ? s : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, v);
    } catch { /* private mode: just this visit */ }
  }, [key, v]);
  return [v, setV] as const;
}

const DIMS: { value: Dimension; label: string }[] = [
  { value: 'genres', label: 'Genres' },
  { value: 'decades', label: 'Decades' },
  { value: 'themes', label: 'Themes' },
  { value: 'makers', label: 'Creators' },
];

/** What's highlighted: any number of picks in each section. */
type Picks = Record<Dimension, string[]>;
const NO_PICKS: Picks = { genres: [], themes: [], decades: [], makers: [] };
const pickList = (p: Picks) => DIMS.flatMap(({ value }) => p[value].map((k) => ({ dim: value, k })));

/** Titles matching the picks: any of a section's picks, and every section that has one. */
function matches(p: Picks, t: Title) {
  return DIMS.every(({ value }) => !p[value].length || keysOf(value, t).some((k) => p[value].includes(k)));
}

/** Your good / ok / bad split in a group, as a small bar. */
function VerdictMix({ n }: { n: Record<Verdict, number> }) {
  return (
    <span className="mix" role="img" aria-label={verdictSummary(n)}>
      {VERDICTS.filter((v) => n[v]).map((v) => <i key={v} className={`v-${v}`} style={{ flexGrow: n[v] }} />)}
    </span>
  );
}

/** What the card at the bottom is showing: a title you tapped or a neighbourhood. */
type Focus = { kind: 'title'; i: number } | { kind: 'hood'; hood: Hood } | null;

/**
 * The galaxy: every title in the library on one map, similar ones together, your ratings lit up
 * as constellations. Filters show what you've seen, haven't, or both; highlight genres, decades,
 * themes and creators on the map itself (several at once, from any sections); narrow which of your
 * ratings show; and turn names or posters off. The filter panel says how many titles that leaves. Only named titles and neighbourhoods can be tapped. Uncharted flies you to
 * a part of the map you haven't explored that it thinks you'd like.
 */
export function TasteMap({ active }: { active: boolean }) {
  const { data, ratings, toggleWatchlist } = useStore();
  const nav = useNav();
  syncSky();
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const [show, setShow] = useState<Show>('all');
  const [rf, setRf] = useState<ReviewFilter>(NO_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  // Filter sections start folded so the panel stays short; one with picks says how many.
  const [unfolded, setUnfolded] = useState<Dimension[]>([]);
  const [focus, setFocus] = useState<Focus>(null);
  const [fly, setFly] = useState<FlyTo | null>(null);
  const lastHood = useRef<number | null>(null);
  const [names, setNames] = usePref<'on' | 'off'>('teli:sky-names', 'on', ['on', 'off']);
  const [posters, setPosters] = usePref<'on' | 'off'>('teli:sky-posters', 'off', ['on', 'off']);
  const goTo = (f: Omit<FlyTo, 'key'> | null) => f && setFly({ ...f, key: Date.now() });

  const shownRatings = useMemo(
    () => (filtering(rf) ? new Map([...ratings].filter(([, r]) => passes(r, rf))) : ratings),
    [ratings, rf],
  );
  const seen = useMemo(() => new Set([...ratings.keys()].map((id) => ORDER.get(id)!).filter((i) => i !== undefined)), [ratings]);
  const watch = useMemo(() => new Set(data.watchlist), [data.watchlist]);
  const dismissed = useMemo(() => new Set(data.dismissed), [data.dismissed]);
  const recs = useMemo(() => recommend(ratings, dismissed), [ratings, dismissed]);

  // The highlighted titles, by their place on the map.
  const picked = pickList(picks);
  const highlight = useMemo(() => {
    if (!pickList(picks).length) return null;
    const s = new Set<number>();
    for (let i = 0; i < sky.n; i++) if (matches(picks, CATALOG[i])) s.add(i);
    return s;
  }, [picks]);

  /** Adds or removes a pick, and flies to wherever the highlighted titles now are. */
  const togglePick = (dim: Dimension, k: string) => {
    const next = { ...picks, [dim]: picks[dim].includes(k) ? picks[dim].filter((x) => x !== k) : [...picks[dim], k] };
    setPicks(next);
    setFocus(null);
    if (!pickList(next).length) return;
    const ids: number[] = [];
    for (let i = 0; i < sky.n; i++) if (matches(next, CATALOG[i]) && (show === 'all' || seen.has(i) === (show === 'seen'))) ids.push(i);
    if (ids.length) goTo(frame(ids));
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
    openHood(hood);
  };

  /** Opens a neighbourhood's card and flies to its biggest patch, close enough in to read titles. */
  const openHood = (hood: Hood) => {
    setFocus({ kind: 'hood', hood });
    const p = hood.parts[0];
    const span = Math.min(0.12, Math.max(0.03, p.r * 2.2));
    goTo({ x: p.x, y: p.y, w: span, h: span });
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

  const narrowed = filtering(rf) && show !== 'unseen';
  const anyFilter = narrowed || picked.length > 0 || show !== 'all';
  const clearAll = () => {
    setRf(NO_FILTER);
    setPicks(NO_PICKS);
    setShow('all');
  };
  // How many titles the map shows with these filters: yours that pass the rating filters, the rest
  // unless showing only what you've seen, and only highlighted ones when anything is picked.
  const shownCount = useMemo(() => {
    if (!filterOpen) return 0;
    const mine = new Set([...shownRatings.keys()].map((id) => ORDER.get(id)));
    let n = 0;
    for (let i = 0; i < sky.n; i++) {
      if (highlight && !highlight.has(i)) continue;
      if (seen.has(i) ? show !== 'unseen' && mine.has(i) : show !== 'seen') n++;
    }
    return n;
  }, [filterOpen, shownRatings, highlight, seen, show]);

  // The card: a tapped title wins, then a neighbourhood. Highlighting only changes the map.
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
  } else if (focus?.kind === 'hood') {
    const hood = focus.hood;
    const inGroup = (_: Title, i: number | undefined) => i !== undefined && i < sky.n && sky.c[i] === hood.id;
    const mine = [...ratings.values()].filter((r) => inGroup(BY_ID.get(r.id)!, ORDER.get(r.id)));
    const n = countVerdicts(mine);
    const picks = suggest(inGroup);
    card = (
      <div className="sky-card group-card" key={`h${hood.id}`} style={{ ['--c' as string]: hood.color }}>
        <div className="group-head">
          <span className="swatch" />
          <div>
            <strong>{hood.label}</strong>
            <small>{hood.n.toLocaleString()} titles · {mine.length ? `you've rated ${mine.length}` : 'uncharted for you'}</small>
          </div>
          {mine.length > 0 && <VerdictMix n={n} />}
          <button className="icon-btn ghost" onClick={() => setFocus(null)} aria-label="Close"><XIcon size={14} /></button>
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
        <SkyMap ratings={shownRatings} seen={seen} watch={watch} highlight={highlight} size={sky.n}
          selected={focus?.kind === 'title' ? focus.i : null} fly={fly} bottom={focus?.kind === 'title' ? 110 : focus ? 220 : 0}
          show={show} names={names === 'on'} posters={posters === 'on'} focusHood={focus?.kind === 'hood' ? focus.hood.id : null}
          onHood={(h) => setFocus({ kind: 'hood', hood: h })}
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
          <p className="filter-count" aria-live="polite">
            <b>{shownCount.toLocaleString()}</b> {shownCount === sky.n ? 'titles: everything' : `of ${sky.n.toLocaleString()} titles shown`}
          </p>
          <div className="filter-group" role="group" aria-label="Show">
            <p className="filter-label">Show</p>
            <Segmented<Show> value={show} options={SHOWS} onChange={(v) => { setShow(v); setFocus(null); }} />
            <div className="look-row">
              <button className={`chip toggle ${names === 'on' ? 'on' : ''}`} onClick={() => setNames(names === 'on' ? 'off' : 'on')}
                aria-pressed={names === 'on'}>Names</button>
              <button className={`chip toggle ${posters === 'on' && names === 'on' ? 'on' : ''}`} disabled={names === 'off'}
                onClick={() => setPosters(posters === 'on' ? 'off' : 'on')} aria-pressed={posters === 'on' && names === 'on'}>Posters</button>
            </div>
            <p className="filter-hint">
              {show === 'seen' ? 'Only titles you\u2019ve rated.' : show === 'unseen' ? 'Only titles you haven\u2019t rated yet.' : 'Every title, with yours lit up.'}
              {names === 'off' ? ' Names are off: tap your own stars.' : posters === 'on' ? ' Posters beside names, so fewer fit.' : ''}
            </p>
          </div>
          {DIMS.map(({ value, label }) => {
            const open = unfolded.includes(value);
            const n = picks[value].length;
            return (
              <div key={value} className="filter-group" role="group" aria-label={label}>
                <button className={`filter-label filter-fold ${open ? 'open' : ''}`} aria-expanded={open}
                  onClick={() => setUnfolded(open ? unfolded.filter((d) => d !== value) : [...unfolded, value])}>
                  <span>{label}{n > 1 && open ? ' \u00b7 any of these' : ''}</span>
                  {n > 0 && <b className="fold-count">{n}</b>}
                  <ChevronDown size={16} />
                </button>
                {open && (
                  <div className={`genre-wrap ${UNIVERSE[value].length > 24 ? 'chip-scroll' : ''}`}>
                    {UNIVERSE[value].map((k) => {
                      const on = picks[value].includes(k);
                      return <button key={k} className={`chip toggle any ${on ? 'on' : ''}`} onClick={() => togglePick(value, k)} aria-pressed={on}>{k}</button>;
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {new Set(picked.map((p) => p.dim)).size > 1 && <p className="filter-hint">Highlighting titles that match every section you picked from.</p>}
          {show !== 'unseen' && <ReviewFilterGroups value={rf} onChange={setRf} />}
        </div>
      ) : anyFilter && (
        <div className="sky-chips genre-wrap">
          {show !== 'all' && (
            <button className="chip removable" style={{ ['--c' as string]: 'var(--accent-2)' }} onClick={() => setShow('all')} aria-label={`Stop showing ${SHOW_CHIP[show].toLowerCase()}`}>
              {SHOW_CHIP[show]} <XIcon size={12} strokeWidth={3} />
            </button>
          )}
          {picked.map(({ dim, k }) => (
            <button key={`${dim}:${k}`} className="chip removable" onClick={() => togglePick(dim, k)} aria-label={`Stop highlighting ${k}`}>
              {k} <XIcon size={12} strokeWidth={3} />
            </button>
          ))}
          {show !== 'unseen' && <ReviewFilterChips value={rf} onChange={setRf} />}
        </div>
      )}

      {card && <div className="sky-bottom">{card}</div>}
    </Screen>
  );
}
