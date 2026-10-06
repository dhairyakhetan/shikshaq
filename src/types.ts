export type GameId = 'crossword' | 'matching' | 'fillBlank' | 'wordSearch';
export type FormatId = 'json' | 'csv' | 'html' | 'txt';

/** One question/answer line from the user's data. */
export interface Pair {
  n: number;
  q: string;
  a: string;
  /** The answer as it sits in a grid: A–Z and 0–9 only. */
  clean: string;
}

export interface Parsed {
  pairs: Pair[];
  warns: string[];
}
