export type MediaType = 'movie' | 'tv';
export type Verdict = 'good' | 'ok' | 'bad';

export interface Title {
  id: string;
  title: string;
  year: number;
  type: MediaType;
  genres: string[];
  tags: string[];
  /** Director for movies, network for shows. */
  creator: string;
  /** Wikipedia lead image: [url, width, height]. */
  image?: [string, number, number];
}

/** What you thought of a title. */
export interface Review {
  verdict: Verdict;
  /** What stood out, as ids from `TAGS`. */
  tags: string[];
  /** Would you watch it again? */
  again: boolean;
  /** When you first logged it (ms since epoch). */
  at: number;
  /** Carried over from the old ranking system and not reviewed yet. */
  pending?: boolean;
}

export interface Rating extends Review {
  id: string;
  type: MediaType;
}
