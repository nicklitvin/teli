import { useState, type ReactNode } from 'react';
import type { Title } from '../types';
import { metaLine } from '../lib/catalog';
import { useStore } from '../lib/store';
import { useNav } from '../nav';
import { ChevronRight, UserIcon } from './Icons';
import { Poster, ScoreBadge } from './Poster';

/** A tab's scroll container with a compact top bar; the avatar opens profile & settings. */
export function Screen({ title, active, children }: { title: string; active: boolean; children: ReactNode }) {
  const nav = useNav();
  const [scrolled, setScrolled] = useState(false);
  return (
    <div className="screen" hidden={!active} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}>
      <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
        <h1>{title}</h1>
        <button className="avatar" onClick={nav.openProfile} aria-label="Profile and settings">
          <UserIcon size={17} />
        </button>
      </header>
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

/** `accessory` sits inside the tap target; `actions` are separate buttons at the end of the row. */
export function TitleRow({ t, rank, detail, accessory, actions }: {
  t: Title;
  rank?: number;
  detail?: ReactNode;
  accessory?: ReactNode;
  actions?: ReactNode;
}) {
  const { ratings } = useStore();
  const nav = useNav();
  const r = ratings.get(t.id);
  return (
    <div className="row">
      <button className="row-main" onClick={() => nav.openDetail(t.id)}>
        {rank !== undefined && <span className="row-rank">{rank}</span>}
        <Poster t={t} size="sm" />
        <span className="row-text">
          <span className="row-title">{t.title}</span>
          <span className="row-sub">{detail ?? metaLine(t)}</span>
        </span>
        {accessory ?? (r ? <ScoreBadge rating={r} /> : !actions && <ChevronRight size={16} className="row-chevron" />)}
      </button>
      {actions && <span className="row-actions">{actions}</span>}
    </div>
  );
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
