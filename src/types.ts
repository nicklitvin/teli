export type MediaType = 'movie' | 'tv';
export type Sentiment = 'liked' | 'fine' | 'disliked';

export interface Title {
  id: string;
  title: string;
  year: number;
  type: MediaType;
  genres: string[];
  tags: string[];
  /** Director for movies, network for shows. */
  creator: string;
}

export interface Rating {
  id: string;
  type: MediaType;
  sentiment: Sentiment;
  score: number;
  /** 1-based position among all ranked titles of the same type. */
  rank: number;
  total: number;
}
