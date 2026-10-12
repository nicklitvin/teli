import { useState, type ReactNode, type Ref } from 'react';
import type { Title } from '../types';
import { GENRE_COLORS, metaLine } from '../lib/catalog';
import { useStore } from '../lib/store';
import { useNav } from '../nav';
import { FilterIcon, SearchIcon, XIcon } from './Icons';
import { Poster, ScoreBadge } from './Poster';

/** A tab's scroll container. There's no top bar: content starts under the status bar. */
export function Screen({ title, active, children, className = '', scrollRef, onScroll }: {
  /** Read out by screen readers only. */
  title: string;
  active: boolean;
  children: ReactNode;
  className?: string;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: (el: HTMLDivElement) => void;
}) {
  return (
    <div className={`screen ${className}`} hidden={!active} ref={scrollRef} onScroll={(e) => onScroll?.(e.currentTarget)}>
      <h1 className="visually-hidden">{title}</h1>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="segmented" role="tablist" style={{ ['--n' as string]: options.length, ['--i' as string]: i }}>
      <span className="segmented-thumb" />
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Tabs for a list plus two small tools: a filter panel (genre, plus an optional extra choice) and
 * an optional search box. Each opens under the row; active filters stay visible as removable chips.
 */
export function ListTools<T extends string>({ tab, tabs, onTab, genre, genres, onGenre, query, onQuery, placeholder, option }: {
  tab: T;
  tabs: { value: T; label: string }[];
  onTab: (t: T) => void;
  genre: string | null;
  genres: string[];
  onGenre: (g: string | null) => void;
  query?: string;
  onQuery?: (q: string) => void;
  placeholder?: string;
  /** An extra single-choice filter shown above the genres; anything but `initial` counts as active. */
  option?: { label: string; value: string; initial: string; choices: { value: string; label: string }[]; onChange: (v: string) => void };
}) {
  const [open, setOpen] = useState<'search' | 'genre' | null>(null);
  const optionOn = !!option && option.value !== option.initial;
  const toggle = (k: 'search' | 'genre') => setOpen((o) => (o === k ? null : k));
  return (
    <div className="tools">
      <div className="tools-row">
        <Segmented<T> value={tab} options={tabs} onChange={onTab} />
        {onQuery && (
          <button className={`icon-btn tool ${open === 'search' || query ? 'on' : ''}`} onClick={() => toggle('search')}
            aria-expanded={open === 'search'} aria-label="Search this list">
            <SearchIcon size={17} />
          </button>
        )}
        <button className={`icon-btn tool ${open === 'genre' || genre || optionOn ? 'on' : ''}`} onClick={() => toggle('genre')}
          aria-expanded={open === 'genre'} aria-label="Filters">
          <FilterIcon size={17} />
        </button>
      </div>
      {onQuery && (open === 'search' || query) && (
        <label className="search-field slim">
          <SearchIcon size={16} />
          <input type="search" autoFocus value={query} placeholder={placeholder ?? 'Search'} onChange={(e) => onQuery(e.target.value)}
            enterKeyHint="search" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
          {query && (
            <button className="clear-btn" onClick={() => onQuery('')} aria-label="Clear"><XIcon size={12} strokeWidth={3} /></button>
          )}
        </label>
      )}
      {open === 'genre' ? (
        <div className="filter-panel">
          {option && (
            <div className="filter-group" role="group" aria-label={option.label}>
              <p className="filter-label">{option.label}</p>
              <div className="genre-wrap">
                {option.choices.map((c) => (
                  <button key={c.value} className={`chip toggle any ${option.value === c.value ? 'on' : ''}`}
                    onClick={() => option.onChange(c.value)} aria-pressed={option.value === c.value}>{c.label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="filter-group" role="group" aria-label="Genres">
            {option && <p className="filter-label">Genre</p>}
            <div className="genre-wrap">
              <button className={`chip toggle any ${genre ? '' : 'on'}`} onClick={() => { onGenre(null); setOpen(null); }}
                aria-pressed={!genre}>Any genre</button>
              {genres.map((g) => (
                <button key={g} className={`chip toggle ${genre === g ? 'on' : ''}`} style={{ ['--c' as string]: GENRE_COLORS[g] }}
                  onClick={() => { onGenre(genre === g ? null : g); setOpen(null); }} aria-pressed={genre === g}>{g}</button>
              ))}
            </div>
          </div>
        </div>
      ) : (genre || optionOn) && (
        <div className="genre-wrap">
          {option && optionOn && (
            <button className="chip removable" style={{ ['--c' as string]: 'var(--accent-2)' }} onClick={() => option.onChange(option.initial)}
              aria-label={`Remove ${option.label} filter`}>
              {option.choices.find((c) => c.value === option.value)?.label} <XIcon size={12} strokeWidth={3} />
            </button>
          )}
          {genre && (
            <button className="chip removable" style={{ ['--c' as string]: GENRE_COLORS[genre] }} onClick={() => onGenre(null)}
              aria-label={`Remove ${genre} filter`}>
              {genre} <XIcon size={12} strokeWidth={3} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * A title as a wide image card: the art fills it and the name, a line of detail and a score tag
 * sit over the bottom. `accessory` replaces the score tag; `actions` are buttons in the top corner.
 */
export function TitleRow({ t, rank, detail, accessory, actions, readOnly }: {
  t: Title;
  rank?: number;
  detail?: ReactNode;
  accessory?: ReactNode;
  actions?: ReactNode;
  /** Not a link to the title page (e.g. inside the profile sheet). */
  readOnly?: boolean;
}) {
  const { ratings } = useStore();
  const nav = useNav();
  const r = ratings.get(t.id);
  const tag = accessory ?? (r ? <ScoreBadge rating={r} size="lg" /> : null);
  return (
    <div className="tcard">
      <Poster t={t} size="fill" cover />
      {!readOnly && <button className="tcard-hit" onClick={() => nav.openDetail(t.id)} aria-label={`${t.title}, ${t.year}`} />}
      {rank !== undefined && <span className="tcard-rank">#{rank}</span>}
      {actions && <span className="tcard-actions">{actions}</span>}
      <span className="tcard-info">
        <span className="tcard-text">
          <span className="tcard-title">{t.title}</span>
          <span className="tcard-sub">{detail ?? metaLine(t)}</span>
        </span>
        {tag && <span className="tcard-tag">{tag}</span>}
      </span>
    </div>
  );
}

/** A grid of title cards: one column on phones, two on wider screens. */
export function Cards({ children }: { children: ReactNode }) {
  return <div className="cards">{children}</div>;
}

export function PosterCard({ t, size = 'md', caption }: { t: Title; size?: 'md' | 'lg'; caption?: ReactNode }) {
  const { ratings } = useStore();
  const nav = useNav();
  return (
    <button className={`card card-${size}`} onClick={() => nav.openDetail(t.id)}>
      <Poster t={t} size={size} rating={ratings.get(t.id)} />
      <span className="card-title">{t.title}</span>
      <span className="card-sub">{caption ?? `${t.year} · ${t.type === 'movie' ? 'Movie' : 'TV'}`}</span>
    </button>
  );
}

export function Shelf({ children }: { children: ReactNode }) {
  return <div className="shelf">{children}</div>;
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
