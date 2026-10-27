import { useState, type CSSProperties } from 'react';
import type { Review, Title } from '../types';
import { VERDICT_LABEL } from '../lib/rating';
import { RefreshIcon } from './Icons';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SERIF = new Set(['Drama', 'Romance', 'History', 'War', 'Western', 'Documentary']);
const ROUNDED = new Set(['Animation', 'Family', 'Comedy', 'Musical']);

/** Generated "key art": deterministic gradient + type treatment per title, no images needed. */
export function posterArt(t: Title) {
  const h = hash(t.id);
  const hue = h % 360;
  const hue2 = (hue + 25 + ((h >>> 9) % 80)) % 360;
  const sat = 55 + ((h >>> 5) % 30);
  const angle = 140 + ((h >>> 17) % 100);
  const gx = 20 + ((h >>> 3) % 60);
  const gy = 10 + ((h >>> 11) % 40);
  const background = [
    `radial-gradient(circle at ${gx}% ${gy}%, hsla(${(hue + 180) % 360} 90% 70% / .35), transparent 55%)`,
    `linear-gradient(${angle}deg, hsl(${hue} ${sat}% 50%), hsl(${hue2} ${Math.min(95, sat + 10)}% 20%))`,
  ].join(',');
  const main = t.genres[0];
  const font = ROUNDED.has(main) ? 'rounded' : SERIF.has(main) ? 'serif' : 'sans';
  const align = (['bottom', 'top', 'center'] as const)[(h >>> 7) % 3];
  // Shrink the type so the longest word fits on one line instead of breaking mid-word.
  const longest = Math.max(...t.title.split(/\s+/).map((w) => w.length));
  const fit = Math.min(1, (font === 'sans' ? 8.5 : 10) / longest);
  return { background, font, align, hue, fit };
}

interface PosterProps {
  t: Title;
  /** `fill` stretches to its positioned parent, for full-bleed cards. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill';
  /** Always crop to fill, even title cards and logos (for landscape cards, where they fit anyway). */
  cover?: boolean;
  rating?: Review;
  className?: string;
  style?: CSSProperties;
}

/** Image URLs that failed this session (offline, removed upstream), so we don't retry them every render. */
const BROKEN = new Set<string>();

/** The Wikipedia image when there is one, drawn over generated art that doubles as placeholder and fallback. */
export function Poster({ t, size = 'md', cover, rating, className = '', style }: PosterProps) {
  const art = posterArt(t);
  const tiny = size === 'xs' || size === 'sm';
  const [, setBroken] = useState(0);
  const img = t.image && !BROKEN.has(t.image[0]) ? t.image : null;
  // Title cards and logos are landscape: show them whole over a blurred copy instead of cropping.
  const wide = !cover && !!img && img[1] / img[2] > 0.85;
  const onError = () => {
    BROKEN.add(img![0]);
    setBroken((n) => n + 1);
  };
  return (
    <div className={`poster poster-${size} font-${art.font} align-${art.align} ${className}`}
      style={{ background: art.background, ['--fit' as string]: art.fit, ...style }} aria-hidden="true">
      {tiny ? (
        <span className="poster-initials">{initials(t.title)}</span>
      ) : (
        <span className="poster-title">{t.title}</span>
      )}
      {img && wide && <img className="poster-img blur" src={img[0]} alt="" loading="lazy" decoding="async" />}
      {img && (
        <img key={img[0]} className={`poster-img ${wide ? 'contain' : ''}`} src={img[0]} alt="" loading="lazy" decoding="async"
          onLoad={(e) => e.currentTarget.classList.add('loaded')} onError={onError} />
      )}
      {!tiny && size !== 'fill' && t.type === 'tv' && <span className="poster-tag">TV</span>}
      {rating && !tiny && <VerdictBadge rating={rating} size="sm" className="poster-score" />}
    </div>
  );
}

function initials(title: string) {
  const words = title.replace(/^(the|a|an)\s+/i, '').split(/[\s:–-]+/).filter((w) => /[A-Za-z0-9]/.test(w));
  return words.slice(0, 2).map((w) => w.replace(/[^A-Za-z0-9]/g, '')[0] ?? '').join('').toUpperCase();
}

/** Your verdict as a colored tag, with a rewatch mark when you'd watch it again. Dashed while it still needs a review. */
export function VerdictBadge({ rating, size = 'md', className = '' }: {
  rating: Pick<Review, 'verdict' | 'again' | 'pending'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const label = `${VERDICT_LABEL[rating.verdict]}${rating.again ? ', would watch again' : ''}${rating.pending ? ', needs a review' : ''}`;
  return (
    <span className={`score score-${size} v-${rating.verdict} ${rating.pending ? 'pending' : ''} ${className}`} role="img" aria-label={label}>
      {VERDICT_LABEL[rating.verdict]}
      {rating.again && <RefreshIcon size={size === 'lg' ? 14 : size === 'md' ? 12 : 10} strokeWidth={2.6} />}
    </span>
  );
}
