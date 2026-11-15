import { useState, type CSSProperties } from 'react';
import type { Review, Title } from '../types';
import { imageSrc } from '../lib/catalog';
import { VERDICT_LABEL } from '../lib/rating';

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

/** About how wide (in image pixels, allowing for sharp screens) each poster size needs its image. */
export const POSTER_PX: Record<NonNullable<PosterProps['size']>, number> = { xs: 120, sm: 120, md: 330, lg: 330, xl: 330, fill: 500 };

/**
 * Failed loads this session, per URL. A failure is often just the image host asking us to slow
 * down, so try again a couple of times, further apart each time, before settling for the art.
 */
const FAILS = new Map<string, number>();
const RETRIES = 2;

/** The poster image when there is one, drawn over generated art that doubles as placeholder and fallback. */
export function Poster({ t, size = 'md', cover, rating, className = '', style }: PosterProps) {
  const art = posterArt(t);
  const tiny = size === 'xs' || size === 'sm';
  const [, setTick] = useState(0);
  const url = t.image ? imageSrc(t.image, POSTER_PX[size]) : null;
  const fails = url ? FAILS.get(url) ?? 0 : 0;
  const img = url && fails <= RETRIES ? t.image! : null;
  const src = fails ? `${url}?retry=${fails}` : url!;
  // Title cards and logos are landscape: show them whole over a blurred copy instead of cropping.
  const wide = !cover && !!img && img[1] / img[2] > 0.85;
  const onError = () => {
    if ((FAILS.get(url!) ?? 0) !== fails) return; // the blurred copy and the poster share a URL
    FAILS.set(url!, fails + 1);
    if (fails < RETRIES) setTimeout(() => setTick((n) => n + 1), 2000 * 3 ** fails + Math.random() * 1000);
    else setTick((n) => n + 1);
  };
  return (
    <div className={`poster poster-${size} font-${art.font} align-${art.align} ${className}`}
      style={{ background: art.background, ['--fit' as string]: art.fit, ...style }} aria-hidden="true">
      {tiny ? (
        <span className="poster-initials">{initials(t.title)}</span>
      ) : (
        <span className="poster-title">{t.title}</span>
      )}
      {img && wide && <img key={`b${src}`} className="poster-img blur" src={src} alt="" loading="lazy" decoding="async" onError={onError} />}
      {img && (
        <img key={src} className={`poster-img ${wide ? 'contain' : ''}`} src={src} alt="" loading="lazy" decoding="async"
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

/** Your verdict as a colored tag. Dashed while it still needs a review. */
export function VerdictBadge({ rating, size = 'md', className = '' }: {
  rating: Pick<Review, 'verdict' | 'again' | 'pending'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const label = `${VERDICT_LABEL[rating.verdict]}${rating.again ? ', would watch again' : ''}${rating.pending ? ', needs a review' : ''}`;
  return (
    <span className={`score score-${size} v-${rating.verdict} ${rating.pending ? 'pending' : ''} ${className}`} role="img" aria-label={label}>
      {VERDICT_LABEL[rating.verdict]}
    </span>
  );
}
