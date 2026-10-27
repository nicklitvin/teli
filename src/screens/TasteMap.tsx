import { useEffect, useMemo, useRef, useState } from 'react';
import type { Verdict } from '../types';
import { BY_ID, GENRE_COLORS } from '../lib/catalog';
import { NO_FILTER, VERDICTS, filtering, passes, verdictSummary, type ReviewFilter } from '../lib/rating';
import { recommend } from '../lib/recommend';
import { useStore } from '../lib/store';
import { UNIVERSE, groupStats, groupTitles, keysOf, type Dimension } from '../lib/taste';
import { useNav } from '../nav';
import { ChevronDown, FilterIcon } from '../components/Icons';
import { GalaxyView, LOOKS, type GalaxyItem, type Look } from '../components/Galaxy';
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

/** Your good / ok / bad split in a group, as a small bar. */
function VerdictMix({ n }: { n: Record<Verdict, number> }) {
  return (
    <span className="mix" role="img" aria-label={verdictSummary(n)}>
      {VERDICTS.filter((v) => n[v]).map((v) => <i key={v} className={`v-${v}`} style={{ flexGrow: n[v] }} />)}
    </span>
  );
}

const MAX_BUBBLES = 18;

const LOOK_KEY = 'teli:galaxy-look';
const savedLook = (): Look => {
  try {
    const v = localStorage.getItem(LOOK_KEY);
    return LOOKS.some((l) => l.value === v) ? (v as Look) : 'planets';
  } catch {
    return 'planets';
  }
};

export function TasteMap({ active }: { active: boolean }) {
  const { data, ratings } = useStore();
  const nav = useNav();
  const [dim, setDim] = useState<Dimension>('genres');
  const [picked, setPicked] = useState<Record<Dimension, string | null>>({ genres: null, themes: null, decades: null, makers: null });
  const panelRef = useRef<HTMLDivElement>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [rf, setRf] = useState<ReviewFilter>(NO_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [look, setLook] = useState<Look>(savedLook);
  useEffect(() => {
    try {
      localStorage.setItem(LOOK_KEY, look);
    } catch {
      /* private mode */
    }
  }, [look]);
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

  // Each group wears your favourite title in it, but never one another group already uses, so
  // Drama, Crime and Action don't all wear the same poster. Bigger groups choose first.
  const items = useMemo(() => {
    const used = new Set<string>();
    return explored.slice(0, MAX_BUBBLES).map((s): GalaxyItem => {
      const withImage = s.rated.map((r) => BY_ID.get(r.id)!).filter((t) => t.image);
      const cover = withImage.find((x) => !used.has(x.id)) ?? withImage[0];
      if (cover) used.add(cover.id);
      return { name: s.name, s, color: colorOf(dim, s.name), cover };
    });
  }, [explored, dim]);

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

        {items.length > 0 ? (
          <GalaxyView look={look} items={items} total={shownRatings.size} selected={selected} onPick={pick} label={`Your ${noun}`} />
        ) : (
          <p className="theater-empty">{narrowed && ratings.size ? 'None of your ratings match these filters.' : 'Rate a few titles and your first planets appear here.'}</p>
        )}

        {/* Trying out different looks for the map. */}
        <div className="look-row" role="group" aria-label="Map look">
          <span>Look</span>
          <div className="look-pills">
            {LOOKS.map((l) => (
              <button key={l.value} className={`pill ${look === l.value ? 'on' : ''}`} onClick={() => setLook(l.value)} aria-pressed={look === l.value}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

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
