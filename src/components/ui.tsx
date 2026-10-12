import type { ReactNode, Ref } from 'react';
import type { Title } from '../types';
import { metaLine } from '../lib/catalog';
import { useStore } from '../lib/store';
import { useNav } from '../nav';
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
