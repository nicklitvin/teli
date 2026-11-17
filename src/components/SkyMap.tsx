import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Rating } from '../types';
import { CATALOG, ORDER } from '../lib/catalog';
import { EXTENT, HOODS, sky, type Hood } from '../lib/skymap';

/** Where to point the view: a spot and how much of the map around it to show. `key` makes a repeat request fly again. */
export interface FlyTo { x: number; y: number; w: number; h: number; key: number }

const VERDICT_COLOR = { good: '#2fd393', ok: '#f8b940', bad: '#fb6b8a' };
const LINK = 0.045; // constellation lines longer than this (in map units) aren't drawn
const MAX_ZOOM = 140;
const REACH = 16; // how far from a dot (in screen pixels) a tap still counts as on it

/** Which titles the map shows: everything, only what you've rated, or only what you haven't. */
export type Show = 'all' | 'seen' | 'unseen';
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Your ratings joined into constellations: a minimum spanning tree over your rated titles'
 * spots, keeping only the short links, so nearby favourites connect and far-apart ones don't.
 */
function constellations(ids: number[]): [number, number][] {
  const n = ids.length;
  if (n < 2) return [];
  const inTree = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const edges: [number, number][] = [];
  best[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
    inTree[u] = 1;
    if (from[u] >= 0 && best[u] <= LINK) edges.push([ids[from[u]], ids[u]]);
    const ux = sky.x[ids[u]];
    const uy = sky.y[ids[u]];
    for (let i = 0; i < n; i++) {
      if (inTree[i]) continue;
      const d = Math.hypot(sky.x[ids[i]] - ux, sky.y[ids[i]] - uy);
      if (d < best[i]) { best[i] = d; from[i] = u; }
    }
  }
  return edges;
}

const FONT = '"Inter Variable", system-ui, sans-serif';

/** A label's box on screen: x, y, width, height. */
type Box = [number, number, number, number];
const NO_BOX: Box = [0, 0, 0, 0];
/** A title you can tap: its dot and its name's box. */
interface Target { i: number; x: number; y: number; box: Box }

/** A rounded rectangle path (canvas roundRect where there is one). */
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
  else ctx.rect(x, y, w, h);
}

/**
 * The whole library as a sky of dots, coloured by neighbourhood, with your rated titles as bright
 * stars joined into constellations and your watchlist as rings. Drag to pan, pinch or scroll to
 * zoom. Neighbourhood names show when zoomed out, titles when zoomed in, and only named things can
 * be tapped: a title's name (or its dot) picks it, a neighbourhood's name opens it. With `names`
 * off, your own stars and watchlist rings are what you can tap. `show` narrows the dots to the
 * titles you've rated (`seen`, the indices of all of them) or the ones you haven't.
 */
export function SkyMap({ ratings, seen, watch, highlight, selected, onPick, onHood, fly, size, bottom = 0, show = 'all', names = true, focusHood = null }: {
  /** The ratings drawn as stars (already narrowed by any rating filters). */
  ratings: Map<string, Rating>;
  /** Every title you've rated, by map index, so `show: 'unseen'` can leave them out. */
  seen: Set<number>;
  watch: Set<string>;
  /** Only these titles stay bright; the rest fade back. */
  highlight: Set<number> | null;
  selected: number | null;
  onPick: (i: number | null) => void;
  fly: FlyTo | null;
  /** Changes when the catalog grows, so new dots get drawn. */
  size: number;
  /** Pixels at the bottom covered by a card: labels stay out of it and flights centre above it. */
  bottom?: number;
  show?: Show;
  names?: boolean;
  /** A tap on a neighbourhood's name. */
  onHood?: (h: Hood) => void;
  /** The neighbourhood whose card is open, drawn brighter. */
  focusHood?: number | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ x: 0.5, y: 0.5, s: 0, fit: 0, w: 0, h: 0, dpr: 1 });
  const frame = useRef(0);
  const anim = useRef(0);

  // Dots grouped by neighbourhood, so each colour is set once per frame.
  const byHood = useMemo(() => {
    const m = new Map<number, number[]>();
    for (let i = 0; i < size; i++) {
      let a = m.get(sky.c[i]);
      if (!a) m.set(sky.c[i], (a = []));
      a.push(i);
    }
    return HOODS.map((h) => ({ h, ids: m.get(h.id) ?? [] }));
  }, [size]);

  const rated = useMemo(
    () => (show === 'unseen' ? [] : [...ratings.values()].map((r) => ({ i: ORDER.get(r.id)!, r })).filter((x) => x.i !== undefined && x.i < size)),
    [ratings, size, show],
  );
  const links = useMemo(() => constellations(rated.map((x) => x.i)), [rated]);
  const watched = useMemo(
    () => (show === 'seen' ? [] : [...watch].map((id) => ORDER.get(id)).filter((i): i is number => i !== undefined && i < size)),
    [watch, size, show],
  );

  // Everything the draw call reads, kept in a ref so pointer handlers and animation see the latest.
  const state = useRef({ byHood, rated, links, watched, highlight, selected, bottom, show, seen, names, focusHood });
  state.current = { byHood, rated, links, watched, highlight, selected, bottom, show, seen, names, focusHood };
  // What the last frame drew a name for, in screen pixels: these are all a tap can land on.
  const targets = useRef<{ titles: Target[]; hoods: { h: Hood; box: Box }[] }>({ titles: [], hoods: [] });

  const draw = () => {
    const el = canvas.current;
    const c = cam.current;
    if (!el || !c.w || !c.s) return;
    const ctx = el.getContext('2d')!;
    const { byHood, rated, links, watched, highlight, selected, bottom, show, seen, names, focusHood } = state.current;
    const hit: typeof targets.current = { titles: [], hoods: [] };
    targets.current = hit;
    ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    ctx.clearRect(0, 0, c.w, c.h);
    const sx = (x: number) => (x - c.x) * c.s + c.w / 2;
    const sy = (y: number) => (y - c.y) * c.s + c.h / 2;
    const zoom = c.s / c.fit;
    const N = CATALOG.length;

    const grow = Math.min(2.2, zoom ** 0.35);
    // Nebulae: a soft glow of each neighbourhood's colour, so the sky reads as regions.
    ctx.globalCompositeOperation = 'lighter';
    for (const { h } of byHood) {
      for (const p of h.parts) {
        const r = Math.sqrt(p.n) * 0.0042 * c.s;
        const g = ctx.createRadialGradient(sx(p.x), sy(p.y), 0, sx(p.x), sy(p.y), r);
        g.addColorStop(0, `${h.color}26`);
        g.addColorStop(1, `${h.color}00`);
        ctx.fillStyle = g;
        ctx.fillRect(sx(p.x) - r, sy(p.y) - r, r * 2, r * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // Dots: well-known titles a little bigger, everything grows a bit as you zoom in. Showing only
    // what you've seen leaves the dots out (your stars are drawn below); only what you haven't
    // skips the ones you've rated.
    for (const { h, ids } of show === 'seen' ? [] : byHood) {
      ctx.fillStyle = h.color;
      for (const pass of highlight ? [0, 1] : [1]) {
        ctx.beginPath();
        ctx.globalAlpha = highlight ? (pass ? 0.95 : 0.08) : 0.55;
        for (const i of ids) {
          if (highlight && highlight.has(i) !== !!pass) continue;
          if (show === 'unseen' && seen.has(i)) continue;
          const x = sx(sky.x[i]);
          const y = sy(sky.y[i]);
          if (x < -4 || y < -4 || x > c.w + 4 || y > c.h + 4) continue;
          const pop = 1 - i / N;
          const r = (0.45 + 1.3 * pop * pop * pop) * grow * (highlight && pass ? 1.25 : 1);
          // Tiny dots as squares (cheap, and they look the same); bigger ones round.
          if (r < 1.1) ctx.fillRect(x - r, y - r, r * 2, r * 2);
          else {
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
          }
        }
        ctx.fill();
        ctx.beginPath();
      }
    }
    ctx.globalAlpha = 1;

    // Constellations, then your stars on top.
    ctx.strokeStyle = 'rgba(220, 225, 255, 0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [a, b] of links) {
      ctx.moveTo(sx(sky.x[a]), sy(sky.y[a]));
      ctx.lineTo(sx(sky.x[b]), sy(sky.y[b]));
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(167, 155, 255, 0.85)';
    ctx.lineWidth = 1.3;
    for (const i of watched) {
      const x = sx(sky.x[i]);
      const y = sy(sky.y[i]);
      if (x < -10 || y < -10 || x > c.w + 10 || y > c.h + 10) continue;
      ctx.globalAlpha = highlight && !highlight.has(i) ? 0.25 : 1;
      ctx.beginPath();
      ctx.arc(x, y, 3.6 + grow * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const { i, r } of rated) {
      const x = sx(sky.x[i]);
      const y = sy(sky.y[i]);
      if (x < -12 || y < -12 || x > c.w + 12 || y > c.h + 12) continue;
      const big = r.verdict === 'good' ? 1.25 : r.verdict === 'ok' ? 1 : 0.8;
      ctx.globalAlpha = (r.verdict === 'bad' ? 0.7 : 1) * (highlight && !highlight.has(i) ? 0.22 : 1);
      ctx.fillStyle = `${VERDICT_COLOR[r.verdict]}40`;
      ctx.beginPath();
      ctx.arc(x, y, (5 + grow) * big, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = VERDICT_COLOR[r.verdict];
      ctx.beginPath();
      ctx.arc(x, y, (1.8 + grow * 0.45) * big, 0, Math.PI * 2);
      ctx.fill();
      if (r.verdict === 'good') {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, 1.1 * big, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // The tapped title: a ring, whatever else is showing.
    if (selected !== null && selected < sky.n) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(sky.x[selected]), sy(sky.y[selected]), 9 + grow, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!names) {
      // No names to tap, so your own stars and watchlist rings are the targets.
      for (const i of [...rated.map((x) => x.i), ...watched]) hit.titles.push({ i, x: sx(sky.x[i]), y: sy(sky.y[i]), box: NO_BOX });
      return;
    }

    // Labels in screen space, skipping any that would overlap one already placed. Each sits on a
    // dark pill or halo so it reads over bright patches.
    const boxes: [number, number, number, number][] = [];
    const fits = (x: number, y: number, w: number, h: number) => {
      if (x < 4 || y < 64 || x + w > c.w - 4 || y + h > c.h - 4 - bottom) return false;
      if (boxes.some(([bx, by, bw, bh]) => x < bx + bw && x + w > bx && y < by + bh && y + h > by)) return false;
      boxes.push([x, y, w, h]);
      return true;
    };
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (selected !== null && selected < sky.n) {
      const x = sx(sky.x[selected]);
      const y = sy(sky.y[selected]);
      ctx.font = `650 13.5px ${FONT}`;
      const text = CATALOG[selected].title;
      const w = ctx.measureText(text).width + 18;
      boxes.push([x - w / 2, y - 34, w, 24]);
      hit.titles.push({ i: selected, x, y, box: [x - w / 2, y - 34, w, 24] });
      ctx.fillStyle = 'rgba(5, 6, 16, 0.88)';
      pill(ctx, x - w / 2, y - 34, w, 24);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y - 21.5);
    }
    // Neighbourhood names: on the biggest patch of each, fading out as titles take over.
    const hoodAlpha = Math.max(0, Math.min(1, (5 - zoom) / 2.5));
    if (hoodAlpha > 0) {
      ctx.font = `650 12px ${FONT}`;
      const order = [...byHood].sort((a, b) => b.h.n - a.h.n);
      for (const { h } of order) {
        const text = h.label;
        const w = ctx.measureText(text).width + 30;
        const x = sx(h.x);
        const y = sy(h.y);
        if (!fits(x - w / 2, y - 12, w, 24)) continue;
        if (hoodAlpha > 0.4) hit.hoods.push({ h, box: [x - w / 2, y - 12, w, 24] });
        ctx.globalAlpha = hoodAlpha * (highlight ? 0.6 : 1);
        ctx.fillStyle = focusHood === h.id ? 'rgba(10, 12, 30, 0.95)' : 'rgba(5, 6, 16, 0.78)';
        pill(ctx, x - w / 2, y - 12, w, 24);
        ctx.fill();
        if (focusHood === h.id) {
          ctx.strokeStyle = h.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.fillStyle = h.color;
        ctx.beginPath();
        ctx.arc(x - w / 2 + 12, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f4f3ff';
        ctx.textAlign = 'left';
        ctx.fillText(text, x - w / 2 + 21, y + 0.5);
      }
      ctx.globalAlpha = 1;
    }
    // Zoomed in: titles, your stars first (highlighted ones before the rest), then the best known.
    // Showing only what you've seen, your stars are named at any zoom.
    const onlyMine = show === 'seen';
    if (zoom > 3 || (onlyMine && rated.length)) {
      const titleAlpha = onlyMine ? 1 : Math.min(1, (zoom - 3) / 2);
      ctx.textAlign = 'left';
      const picks: [number, number][] = [];
      for (const { i } of rated) picks.push([i, highlight && !highlight.has(i) ? -1e8 : -1e9]);
      if (!onlyMine) {
        // Visible dots, best known first (catalog order is popularity order).
        const x0 = c.x - c.w / 2 / c.s;
        const x1 = c.x + c.w / 2 / c.s;
        const y0 = c.y - c.h / 2 / c.s;
        const y1 = c.y + c.h / 2 / c.s;
        for (let i = 0; i < sky.n && picks.length < 600; i++) {
          if (sky.x[i] < x0 || sky.x[i] > x1 || sky.y[i] < y0 || sky.y[i] > y1) continue;
          if (highlight && !highlight.has(i)) continue;
          if (show === 'unseen' && seen.has(i)) continue;
          picks.push([i, i]);
        }
      }
      picks.sort((a, b) => a[1] - b[1]);
      let placed = 0;
      const ratedSet = new Set(rated.map((x) => x.i));
      for (const [i] of picks) {
        if (placed >= 45 || i === selected) continue;
        const mine = ratedSet.has(i);
        ctx.font = `${mine ? 650 : 550} 12px ${FONT}`;
        const text = CATALOG[i].title.length > 26 ? `${CATALOG[i].title.slice(0, 25)}…` : CATALOG[i].title;
        const w = ctx.measureText(text).width;
        const x = sx(sky.x[i]) + 8;
        const y = sy(sky.y[i]);
        if (!fits(x - 2, y - 8, w + 4, 16)) continue;
        if (titleAlpha > 0.4) hit.titles.push({ i, x: x - 8, y, box: [x - 2, y - 8, w + 4, 16] });
        ctx.globalAlpha = titleAlpha * (mine ? 1 : 0.85) * (highlight && !highlight.has(i) ? 0.5 : 1);
        ctx.strokeStyle = 'rgba(4, 5, 14, 0.92)';
        ctx.lineWidth = 4;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = mine ? '#ffffff' : '#d6d4f2';
        ctx.fillText(text, x, y);
        placed++;
      }
      ctx.globalAlpha = 1;
    }
  };

  const redraw = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  };

  const clamp = () => {
    const c = cam.current;
    c.s = Math.max(c.fit * 0.8, Math.min(c.fit * MAX_ZOOM, c.s));
    c.x = Math.max(0, Math.min(1, c.x));
    c.y = Math.max(0, Math.min(1, c.y));
  };

  // Size the canvas to its box (and the screen's pixel density); fit the whole sky the first time.
  useEffect(() => {
    const el = canvas.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const c = cam.current;
      c.dpr = Math.min(2, window.devicePixelRatio || 1);
      c.w = r.width;
      c.h = r.height;
      el.width = Math.round(r.width * c.dpr);
      el.height = Math.round(r.height * c.dpr);
      const fit = Math.min(r.width / (EXTENT.w * 1.08), r.height / (EXTENT.h * 1.08));
      if (!c.s) {
        c.s = fit;
        c.x = EXTENT.x;
        c.y = EXTENT.y;
      } else c.s *= fit / c.fit;
      c.fit = fit;
      draw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(redraw);

  // Fly to a requested spot, zoomed so its area fills most of the view.
  useEffect(() => {
    if (!fly) return;
    const c = cam.current;
    if (!c.fit) return;
    const room = c.h - state.current.bottom;
    const s = fly.w >= 1 ? c.fit : Math.max(c.fit * 1.5, Math.min(c.fit * 40, Math.min(c.w / Math.max(fly.w, 0.004), room / Math.max(fly.h, 0.004)) * 0.7));
    // Centre the spot in the part of the screen the card doesn't cover.
    const to = fly.w >= 1 ? { x: EXTENT.x, y: EXTENT.y } : { x: fly.x, y: fly.y + state.current.bottom / 2 / s };
    const from = { x: c.x, y: c.y, s: c.s };
    const t0 = performance.now();
    const ms = reduceMotion() ? 0 : 700;
    cancelAnimationFrame(anim.current);
    const step = (now: number) => {
      const k = ms ? Math.min(1, (now - t0) / ms) : 1;
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      c.x = from.x + (to.x - from.x) * e;
      c.y = from.y + (to.y - from.y) * e;
      // Zoom in log space, so it doesn't rush the last bit.
      c.s = Math.exp(Math.log(from.s) + (Math.log(s) - Math.log(from.s)) * e);
      draw();
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(anim.current);
  }, [fly?.key]);

  // ---- Gestures: one finger pans, two pinch, wheel zooms, a tap picks ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, t: 0, dist: 0 });

  const zoomAt = (px: number, py: number, factor: number) => {
    const c = cam.current;
    const wx = c.x + (px - c.w / 2) / c.s;
    const wy = c.y + (py - c.h / 2) / c.s;
    c.s *= factor;
    clamp();
    c.x = wx - (px - c.w / 2) / c.s;
    c.y = wy - (py - c.h / 2) / c.s;
    clamp();
    redraw();
  };

  const local = (e: ReactPointerEvent | WheelEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: ReactPointerEvent) => {
    cancelAnimationFrame(anim.current);
    canvas.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = { moved: 0, t: performance.now(), dist: 0 };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.dist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = 99;
    }
  };

  const move = (e: ReactPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    const c = cam.current;
    if (pointers.current.size === 1) {
      gesture.current.moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
      c.x -= (p.x - prev.x) / c.s;
      c.y -= (p.y - prev.y) / c.s;
      clamp();
      pointers.current.set(e.pointerId, p);
      redraw();
      return;
    }
    pointers.current.set(e.pointerId, p);
    const [a, b] = [...pointers.current.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (gesture.current.dist) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / gesture.current.dist);
    gesture.current.dist = dist;
  };

  const up = (e: ReactPointerEvent) => {
    const was = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) gesture.current.dist = 0;
    if (!was || pointers.current.size || gesture.current.moved > 8 || performance.now() - gesture.current.t > 500) return;
    // A tap only lands on something with a name showing: the title whose dot is within reach (the
    // nearest, if several) or whose name it's on, else the neighbourhood whose name it's on.
    const p = local(e);
    const on = ([x, y, w, h]: Box) => w > 0 && p.x >= x - 6 && p.x <= x + w + 6 && p.y >= y - 6 && p.y <= y + h + 6;
    let pick: number | null = null;
    let best = Infinity;
    for (const t of targets.current.titles) {
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      const score = d <= REACH ? d : on(t.box) ? REACH + 1 : Infinity;
      if (score < best) { best = score; pick = t.i; }
    }
    const hood = pick === null ? targets.current.hoods.find((t) => on(t.box)) : undefined;
    if (hood && onHood) return onHood(hood.h);
    onPick(pick);
  };

  useEffect(() => {
    const el = canvas.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  return (
    <canvas ref={canvas} className="sky-canvas" role="img" aria-label="Map of every title, with your ratings as constellations"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
  );
}

/** Zooms the map back out to the whole sky. */
export const WHOLE_SKY = { x: 0.5, y: 0.5, w: 1, h: 1 };
