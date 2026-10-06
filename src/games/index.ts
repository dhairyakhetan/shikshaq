import type { ComponentType } from 'react';
import { gridWord } from '../lib/text';
import type { GameId, GameProps, QA } from '../types';
import { Crossword } from './Crossword';
import { FillBlank } from './FillBlank';
import { Matching } from './Matching';
import { WordSearch } from './WordSearch';

export interface GameDef {
  id: GameId;
  title: string;
  emoji: string;
  blurb: string;
  /** Questions per round. */
  roundSize: number;
  /** Fewest questions needed to play. */
  min: number;
  /** Does this row's shape suit the game (before the sheet's Type restriction)? */
  suits: (q: QA) => boolean;
  Component: ComponentType<GameProps>;
}

const gridLength = (q: QA) => gridWord(q.answer).length;

export const GAMES: Record<GameId, GameDef> = {
  matching: {
    id: 'matching', title: 'Matching', emoji: '🔗', roundSize: 6, min: 2,
    blurb: 'Pair each question with its answer.',
    suits: () => true,
    Component: Matching,
  },
  fillBlank: {
    id: 'fillBlank', title: 'Fill in the blank', emoji: '✏️', roundSize: 10, min: 1,
    blurb: 'Type the missing answer.',
    suits: () => true,
    Component: FillBlank,
  },
  crossword: {
    id: 'crossword', title: 'Crossword', emoji: '🧩', roundSize: 10, min: 4,
    blurb: 'Questions become clues in an interlocking grid.',
    suits: (q) => gridLength(q) >= 3 && gridLength(q) <= 15,
    Component: Crossword,
  },
  wordSearch: {
    id: 'wordSearch', title: 'Word search', emoji: '🔎', roundSize: 8, min: 3,
    blurb: 'Find the answers hidden in the letters.',
    suits: (q) => gridLength(q) >= 3 && gridLength(q) <= 12,
    Component: WordSearch,
  },
};

export const GAME_LIST = Object.values(GAMES);

/** Rows eligible for a game: right shape, allowed by the Type column, and (for grids) unique answers. */
export function eligible(game: GameDef, items: QA[]): QA[] {
  const pool = items.filter((q) => game.suits(q) && (q.games === null || q.games.includes(game.id)));
  if (game.id !== 'crossword' && game.id !== 'wordSearch') return pool;
  const seen = new Set<string>();
  return pool.filter((q) => {
    const w = gridWord(q.answer);
    return seen.has(w) ? false : (seen.add(w), true);
  });
}
