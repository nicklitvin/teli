import type { Sentiment } from '../types';

export const SENTIMENTS: Sentiment[] = ['liked', 'fine', 'disliked'];

/** Score band for each reaction, like Beli: your ranking within a band decides the exact score. */
export const BANDS: Record<Sentiment, [number, number]> = {
  liked: [6.8, 10],
  fine: [3.4, 6.7],
  disliked: [0, 3.3],
};

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  liked: 'I liked it',
  fine: 'It was fine',
  disliked: "I didn't like it",
};

/** index 0 = best in the band. A lone item sits in the middle of its band. */
export function scoreFor(index: number, count: number, s: Sentiment): number {
  const [lo, hi] = BANDS[s];
  const x = count <= 1 ? (lo + hi) / 2 : hi - ((hi - lo) * index) / (count - 1);
  return Math.round(x * 10) / 10;
}

/** Number of comparisons a binary insertion into `n` items can take. */
export function maxComparisons(n: number) {
  return n <= 0 ? 0 : Math.ceil(Math.log2(n + 1));
}
