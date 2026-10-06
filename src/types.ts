export type GameId = 'matching' | 'fillBlank' | 'crossword' | 'wordSearch';

/** One question/answer row from the sheet. */
export interface QA {
  id: string;
  question: string;
  /** Primary answer – the one that is displayed. */
  answer: string;
  /** Extra accepted spellings (sheet cell "Paris|paris, france"). */
  alts: string[];
  /** Games this row is restricted to; null = any game it fits. */
  games: GameId[] | null;
  subject: string;
  difficulty: string;
}

export interface Dataset {
  items: QA[];
  skipped: { row: number; reason: string }[];
  source: 'pasted' | 'sheet' | 'sample';
  /** Set when the sheet is configured but could not be loaded. */
  warning?: string;
}

export interface Outcome {
  correct: number;
  total: number;
}

export interface GameProps {
  items: QA[];
  onFinish: (outcome: Outcome) => void;
}
