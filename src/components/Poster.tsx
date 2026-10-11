import type { CSSProperties } from 'react';
import type { Rating, Title } from '../types';

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
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  rating?: Rating;
  className?: string;
  style?: CSSProperties;
}

export function Poster({ t, size = 'md', rating, className = '', style }: PosterProps) {
  const art = posterArt(t);
  const tiny = size === 'xs' || size === 'sm';
  return (
    <div className={`poster poster-${size} font-${art.font} align-${art.align} ${className}`}
      style={{ background: art.background, ['--fit' as string]: art.fit, ...style }} aria-hidden="true">
      {tiny ? (
        <span className="poster-initials">{initials(t.title)}</span>
      ) : (
        <span className="poster-title">{t.title}</span>
      )}
      {!tiny && t.type === 'tv' && <span className="poster-tag">TV</span>}
      {rating && !tiny && <ScoreBadge rating={rating} size="sm" className="poster-score" />}
    </div>
  );
}

function initials(title: string) {
  const words = title.replace(/^(the|a|an)\s+/i, '').split(/[\s:–-]+/).filter((w) => /[A-Za-z0-9]/.test(w));
  return words.slice(0, 2).map((w) => w.replace(/[^A-Za-z0-9]/g, '')[0] ?? '').join('').toUpperCase();
}

export function ScoreBadge({ rating, size = 'md', className = '' }: {
  rating: Pick<Rating, 'score' | 'sentiment'>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  return (
    <span className={`score score-${size} s-${rating.sentiment} ${className}`}>
      {rating.score.toFixed(1)}
    </span>
  );
}

