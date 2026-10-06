import type { GameId } from '../types';

export type Scores = Partial<Record<GameId, { best: number; plays: number }>>;
const KEY = 'shikshaq:scores:v1';

export function loadScores(): Scores {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Scores;
  } catch {
    return {};
  }
}

/** Save a finished round (percentage 0–100); keeps the best per game. */
export function recordScore(game: GameId, pct: number): Scores {
  const all = loadScores();
  const prev = all[game];
  all[game] = { best: Math.max(prev?.best ?? 0, pct), plays: (prev?.plays ?? 0) + 1 };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode / storage full – scores just won't persist */
  }
  return all;
}
