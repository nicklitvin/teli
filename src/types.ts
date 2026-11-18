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
  /** Poster or lead image: [path, width, height]. The path becomes a URL through imageSrc(). */
  image?: [string, number, number];
}

/** What you thought of a title. */
export interface Review {
  verdict: Verdict;
  /** A short note about it, up to MAX_NOTE characters (lib/rating). */
  note?: string;
  /** Would you watch it again? */
  again: boolean;
  /** When you first logged it (ms since epoch). */
  at: number;
  /** Carried over from the old ranking system and not reviewed yet. */
  pending?: boolean;
  /** It was on your watchlist when you rated it: when you'd saved it (0 if that wasn't kept). */
  fromList?: number;
}

export interface Rating extends Review {
  id: string;
  type: MediaType;
}
