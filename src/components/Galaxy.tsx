import { useMemo, type ReactNode } from 'react';
import type { Title } from '../types';
import { BY_ID } from '../lib/catalog';
import { VERDICTS, verdictSummary } from '../lib/rating';
import { bubbleLayout, type GroupStat } from '../lib/taste';

/** One explored group on the map: its stats, color and the poster it wears. */
export interface GalaxyItem {
  name: string;
  s: GroupStat;
  color: string;
  cover?: Title;
}

interface ViewProps {
  /** Most rated first. */
  items: GalaxyItem[];
  /** How many titles are on the map in all (a title can be in several groups). */
  total: number;
  selected: string | null;
  onPick: (name: string) => void;
  label: string;
}

/** Different ways to draw the map, to try out. */
export type Look = 'planets' | 'orbits' | 'stars' | 'nebula';

export const LOOKS: { value: Look; label: string }[] = [
  { value: 'planets', label: 'Planets' },
  { value: 'orbits', label: 'Solar system' },
  { value: 'stars', label: 'Constellations' },
  { value: 'nebula', label: 'Nebula' },
];

export function GalaxyView({ look, ...p }: ViewProps & { look: Look }) {
  if (look === 'orbits') return <OrbitsView {...p} />;
  if (look === 'stars') return <StarsView {...p} />;
  if (look === 'nebula') return <NebulaView {...p} />;
  return <PlanetsView {...p} />;
}

/** A stable number in [0, 1) for a string, so the same title always lands in the same spot. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

// Themes are stored lowercase ("heist", "ai"); show them like names.
const display = (name: string) => (name.length <= 2 ? name.toUpperCase() : name[0].toUpperCase() + name.slice(1));

/** Splits a label over at most two lines, breaking at the space nearest the middle. */
function lines(label: string): string[] {
  if (label.length <= 11 || !label.includes(' ')) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) if (label[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return [label.slice(0, best), label.slice(best + 1)];
}

const stillMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A tappable group on the map. */
function Hit({ it, on, onPick, className, transform, children }: {
  it: GalaxyItem;
  on: boolean;
  onPick: (name: string) => void;
  className: string;
  transform?: string;
  children: ReactNode;
}) {
  const n = it.s.rated.length;
  return (
    <g className={`${className} ${on ? 'on' : ''}`} transform={transform} style={{ ['--c' as string]: it.color }}
      role="button" tabIndex={0} aria-pressed={on} aria-label={`${it.name}: ${n} rated, ${verdictSummary(it.s.verdicts)}`}
      onClick={() => onPick(it.name)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(it.name)}>
      {children}
    </g>
  );
}

/** Faint background stars across a view box, the same every time. */
function Starfield({ x, y, w, h, n = 70 }: { x: number; y: number; w: number; h: number; n?: number }) {
  const dots = useMemo(() => {
    // mulberry32: neighbouring seeds give unrelated numbers, so the stars don't line up.
    let t = 0x9e3779b9;
    const rand = () => {
      t = (t + 0x6d2b79f5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 2 ** 32;
    };
    return Array.from({ length: n }, () => ({ x: x + rand() * w, y: y + rand() * h, r: 0.4 + rand() * 0.9, d: rand() * 6 }));
  }, [x, y, w, h, n]);
  return (
    <g className="starfield" aria-hidden="true">
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} style={{ animationDelay: `${d.d}s` }} />)}
    </g>
  );
}

const MAX_W = 340;

/* ---------- Planets: groups packed like bubbles, each a planet wearing a favourite's poster ---------- */

function PlanetsView({ items, selected, onPick, label }: ViewProps) {
  const layout = useMemo(() => {
    const max = Math.max(1, ...items.map((s) => s.s.rated.length));
    return bubbleLayout(items.map((s) => ({ name: s.name, r: 27 + 31 * Math.sqrt(s.s.rated.length / max) })));
  }, [items]);
  const byName = new Map(items.map((it) => [it.name, it]));
  const [bx, by, bw, bh] = layout.box;
  const PAD = 26; // room for the ring around the selected planet
  const vw = Math.max(bw + PAD * 2, MAX_W);
  const vh = bh + PAD * 2;
  const vx = bx + bw / 2 - vw / 2;
  return (
    <svg viewBox={`${vx} ${by - PAD} ${vw} ${vh}`} role="group" aria-label={label}>
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
        <PlanetNode key={b.name} b={b} it={byName.get(b.name)!} i={i} on={selected === b.name} onPick={onPick} />
      ))}
    </svg>
  );
}

/** One explored group as a planet: your favourite title in it for a surface, its name and your good / ok / bad split. */
function PlanetNode({ b, it, i, on, onPick }: {
  b: { name: string; x: number; y: number; r: number };
  it: GalaxyItem;
  i: number;
  on: boolean;
  onPick: (name: string) => void;
}) {
  const { s, cover } = it;
  const ls = lines(display(b.name));
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
    <Hit it={it} on={on} onPick={onPick} className="bubble" transform={`translate(${b.x} ${b.y})`}>
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
    </Hit>
  );
}

/* ---------- Solar system: you're the sun, your most rated groups orbit closest ---------- */

const TILT = 0.6; // orbits seen from a little above
const RINGS = [
  { r: 80, cap: 3, dur: 80 },
  { r: 132, cap: 5, dur: 130 },
  { r: 184, cap: 8, dur: 190 },
];

function OrbitsView({ items, total, selected, onPick, label }: ViewProps) {
  const still = useMemo(stillMotion, []);
  const max = Math.max(1, ...items.map((it) => it.s.rated.length));
  const rings = useMemo(() => {
    let at = 0;
    return RINGS.map((ring, k) => {
      const these = items.slice(at, at + ring.cap);
      at += ring.cap;
      return { ...ring, items: these, offset: k * 47 - 90 };
    }).filter((ring) => ring.items.length);
  }, [items]);
  const outer = rings[rings.length - 1]?.r ?? RINGS[0].r;
  const halfW = Math.max(outer + 34, MAX_W / 2);
  const halfH = outer * TILT + 36;
  return (
    <svg viewBox={`${-halfW} ${-halfH} ${halfW * 2} ${halfH * 2}`} role="group" aria-label={label}>
      <defs>
        <radialGradient id="sun-core" cx="42%" cy="38%" r="70%">
          <stop offset="0" stopColor="#fff8e0" />
          <stop offset="0.45" stopColor="#ffc46b" />
          <stop offset="1" stopColor="#ff7a59" />
        </radialGradient>
        <radialGradient id="sun-glow">
          <stop offset="0" stopColor="#ffb86b" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb86b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="orb-shade" cx="34%" cy="28%" r="78%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.75" />
        </radialGradient>
      </defs>
      <Starfield x={-halfW} y={-halfH} w={halfW * 2} h={halfH * 2} />
      {rings.map((ring) => (
        <ellipse key={ring.r} className={`orbit ${ring.items.some((it) => it.name === selected) ? 'on' : ''}`} rx={ring.r} ry={ring.r * TILT} />
      ))}
      <circle r={62} fill="url(#sun-glow)" className="sun-glow" />
      <circle r={24} fill="url(#sun-core)" className="sun" />
      <text className="sun-count" y={-1} dy="0.35em">{total}</text>
      <text className="sun-label" y={14}>rated</text>
      {rings.map((ring, k) => (
        <g key={ring.r} transform={`scale(1 ${TILT})`}>
          <g transform={still ? `rotate(${ring.offset})` : undefined}>
            {!still && (
              <animateTransform attributeName="transform" type="rotate" from={`${ring.offset} 0 0`} to={`${ring.offset + 360} 0 0`}
                dur={`${ring.dur}s`} repeatCount="indefinite" />
            )}
            {ring.items.map((it, j) => {
              const a = (j / ring.items.length) * Math.PI * 2;
              const r = 8 + 12 * Math.sqrt(it.s.rated.length / max);
              const clip = `orb-${k}-${j}`;
              return (
                <g key={it.name} transform={`translate(${Math.cos(a) * ring.r} ${Math.sin(a) * ring.r})`}>
                  <g transform={still ? `rotate(${-ring.offset})` : undefined}>
                    {!still && (
                      <animateTransform attributeName="transform" type="rotate" from={`${-ring.offset} 0 0`} to={`${-ring.offset - 360} 0 0`}
                        dur={`${ring.dur}s`} repeatCount="indefinite" />
                    )}
                    <g transform={`scale(1 ${1 / TILT})`}>
                      <Hit it={it} on={selected === it.name} onPick={onPick} className="orb">
                        <circle r={r + 7} className="orb-hit" />
                        <circle r={r + 3} className="orb-glow" />
                        <clipPath id={clip}><circle r={r} /></clipPath>
                        <circle r={r} className="orb-base" />
                        {it.cover && (
                          <image href={it.cover.image![0]} x={-r} y={-r} width={r * 2} height={r * 2}
                            preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
                        )}
                        <circle r={r} className="orb-tint" />
                        <circle r={r} fill="url(#orb-shade)" />
                        <circle r={r} className="orb-rim" />
                        <text className="orb-name" y={r + 11}>{display(it.name)}</text>
                      </Hit>
                    </g>
                  </g>
                </g>
              );
            })}
          </g>
        </g>
      ))}
    </svg>
  );
}

/* ---------- Constellations: every title you rated is a star, joined up within its group ---------- */

const STAR_R = { good: 2.9, ok: 2, bad: 1.4 } as const;

function StarsView({ items, selected, onPick, label }: ViewProps) {
  const layout = useMemo(() => {
    const max = Math.max(1, ...items.map((it) => it.s.rated.length));
    return bubbleLayout(items.map((it) => ({ name: it.name, r: 26 + 24 * Math.sqrt(it.s.rated.length / max) })));
  }, [items]);
  const byName = new Map(items.map((it) => [it.name, it]));
  const [bx, by, bw, bh] = layout.box;
  const PAD = 14;
  const vw = Math.max(bw + PAD * 2, MAX_W);
  const vh = bh + PAD * 2;
  const vx = bx + bw / 2 - vw / 2;
  return (
    <svg viewBox={`${vx} ${by - PAD} ${vw} ${vh}`} role="group" aria-label={label}>
      <Starfield x={vx} y={by - PAD} w={vw} h={vh} n={110} />
      {layout.bubbles.map((b) => (
        <Constellation key={b.name} b={b} it={byName.get(b.name)!} on={selected === b.name} onPick={onPick} />
      ))}
    </svg>
  );
}

function Constellation({ b, it, on, onPick }: {
  b: { name: string; x: number; y: number; r: number };
  it: GalaxyItem;
  on: boolean;
  onPick: (name: string) => void;
}) {
  const stars = useMemo(() => {
    const rs = it.s.rated.slice(0, 12);
    const spin = hash(it.name) * Math.PI * 2;
    return rs.map((r, j) => {
      const d = b.r * 0.72 * Math.sqrt((j + 0.6) / rs.length) * (0.85 + hash(`${r.id}d`) * 0.3);
      const a = spin + j * 2.39996 + (hash(r.id) - 0.5) * 0.9;
      return { r, x: Math.cos(a) * d, y: Math.sin(a) * d * 0.85 - 5 };
    });
  }, [it, b.r]);
  // Join the stars the way a constellation is drawn: each one to its nearest star already in the figure.
  const links = useMemo(() => {
    const out: [number, number][] = [];
    if (stars.length < 2) return out;
    const inTree = [0];
    const rest = new Set(stars.map((_, i) => i).slice(1));
    while (rest.size) {
      let best: [number, number, number] = [-1, -1, Infinity];
      for (const i of inTree) for (const j of rest) {
        const d = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y);
        if (d < best[2]) best = [i, j, d];
      }
      out.push([best[0], best[1]]);
      inTree.push(best[1]);
      rest.delete(best[1]);
    }
    return out;
  }, [stars]);
  const lowest = Math.max(...stars.map((s) => s.y));
  return (
    <Hit it={it} on={on} onPick={onPick} className="constellation" transform={`translate(${b.x} ${b.y})`}>
      <circle r={b.r} className="cst-hit" />
      {on && <circle r={b.r - 2} className="cst-halo" />}
      {links.map(([i, j]) => (
        <line key={`${i}-${j}`} className="cst-line" x1={stars[i].x} y1={stars[i].y} x2={stars[j].x} y2={stars[j].y} />
      ))}
      {stars.map((s) => (
        <g key={s.r.id} transform={`translate(${s.x} ${s.y})`} className={`cst-star v-${s.r.verdict} ${s.r.again ? 'again' : ''}`}
          style={{ animationDelay: `${hash(s.r.id) * 4}s` }}>
          {s.r.verdict === 'good' && <circle r={STAR_R.good * 2.6} className="cst-glow" />}
          <circle r={STAR_R[s.r.verdict]} className="cst-dot" />
        </g>
      ))}
      <text className="cst-name" y={lowest + 13}>{display(it.name)}</text>
    </Hit>
  );
}

/* ---------- Nebula: soft clouds that blend into each other, with your top posters inside ---------- */

function NebulaView({ items, selected, onPick, label }: ViewProps) {
  const layout = useMemo(() => {
    const max = Math.max(1, ...items.map((it) => it.s.rated.length));
    return bubbleLayout(items.map((it) => ({ name: it.name, r: 28 + 26 * Math.sqrt(it.s.rated.length / max) })));
  }, [items]);
  const byName = new Map(items.map((it) => [it.name, it]));
  const [bx, by, bw, bh] = layout.box;
  const PAD = 20;
  const vw = Math.max(bw + PAD * 2, MAX_W);
  const vh = bh + PAD * 2;
  const vx = bx + bw / 2 - vw / 2;
  return (
    <svg viewBox={`${vx} ${by - PAD} ${vw} ${vh}`} role="group" aria-label={label}>
      <defs>
        <filter id="nebula-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
      </defs>
      <Starfield x={vx} y={by - PAD} w={vw} h={vh} n={90} />
      {/* One blur over all the clouds, so neighbours melt into each other. */}
      <g filter="url(#nebula-blur)" className="nebula-clouds" aria-hidden="true">
        {layout.bubbles.map((b) => {
          const it = byName.get(b.name)!;
          const h = hash(b.name) * Math.PI * 2;
          const on = selected === b.name;
          return (
            <g key={b.name} transform={`translate(${b.x} ${b.y})`} style={{ ['--c' as string]: it.color }} className={on ? 'on' : ''}>
              {[0, 2.1, 4.2].map((k, j) => (
                <ellipse key={k} className="cloud" cx={Math.cos(h + k) * b.r * 0.32} cy={Math.sin(h + k) * b.r * 0.26}
                  rx={b.r * (0.82 - j * 0.1)} ry={b.r * (0.68 - j * 0.08)} />
              ))}
            </g>
          );
        })}
      </g>
      {layout.bubbles.map((b) => (
        <Cloud key={b.name} b={b} it={byName.get(b.name)!} on={selected === b.name} onPick={onPick} />
      ))}
    </svg>
  );
}

function Cloud({ b, it, on, onPick }: {
  b: { name: string; x: number; y: number; r: number };
  it: GalaxyItem;
  on: boolean;
  onPick: (name: string) => void;
}) {
  // Up to three of your top titles in this group, as round thumbnails.
  const thumbs = it.s.rated.map((r) => BY_ID.get(r.id)!).filter((t) => t.image).slice(0, 3);
  const tr = Math.max(8, b.r * 0.27);
  const spots = thumbs.length === 1 ? [[0, 0]]
    : thumbs.length === 2 ? [[-tr * 0.95, 0], [tr * 0.95, 0]]
    : [[0, -tr * 0.85], [-tr * 1.05, tr * 0.7], [tr * 1.05, tr * 0.7]];
  const key = b.name.replace(/[^a-z0-9]/gi, '');
  return (
    <Hit it={it} on={on} onPick={onPick} className="nebula" transform={`translate(${b.x} ${b.y})`}>
      <circle r={b.r} className="neb-hit" />
      {on && <circle r={b.r - 2} className="neb-halo" />}
      <g transform={`translate(0 ${-tr * 0.35})`}>
        {thumbs.map((t, j) => {
          const [x, y] = spots[j];
          const clip = `neb-${key}-${j}`;
          return (
            <g key={t.id} transform={`translate(${x} ${y})`}>
              <clipPath id={clip}><circle r={tr} /></clipPath>
              <image href={t.image![0]} x={-tr} y={-tr} width={tr * 2} height={tr * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
              <circle r={tr} className="neb-rim" />
            </g>
          );
        })}
      </g>
      <text className="neb-name" y={(thumbs.length > 2 ? tr * 1.75 : tr * 1.1) + 9}>
        {display(it.name)} <tspan className="neb-count">{it.s.rated.length}</tspan>
      </text>
    </Hit>
  );
}
