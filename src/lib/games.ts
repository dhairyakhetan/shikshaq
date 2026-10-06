import type { GameId, Pair } from '../types';

/** Answer lengths (letters and digits, spaces and punctuation removed) each puzzle accepts. */
export const LIMITS = { crossword: { min: 2, max: 20 }, wordSearch: { min: 2, max: 15 } } as const;

export interface GameMeta {
  id: GameId;
  name: string;
  anchor: string;
  desc: string;
  color: string;
  tint: string;
  /** How many usable pairs the game needs. */
  need: number;
  /** What the game takes from the data, in words. */
  needs: string;
  fits: (p: Pair) => boolean;
}

const within = (p: Pair, lim: { min: number; max: number }) => p.clean.length >= lim.min && p.clean.length <= lim.max;

export const GAMES: GameMeta[] = [
  {
    id: 'crossword', name: 'Crossword', anchor: 'crossword', color: '#3A3FB5', tint: '#ECEDFC', need: 2,
    desc: 'Answers interlock in a grid. Questions become clues.',
    needs: `answers of ${LIMITS.crossword.min}–${LIMITS.crossword.max} letters`,
    fits: (p) => within(p, LIMITS.crossword),
  },
  {
    id: 'matching', name: 'Matching', anchor: 'matching', color: '#B4531B', tint: '#FCEBDD', need: 2,
    desc: 'Questions on the left, shuffled answers on the right.',
    needs: 'any questions and answers',
    fits: () => true,
  },
  {
    id: 'fillBlank', name: 'Fill-in-the-Blank', anchor: 'fill-blank', color: '#0C7A6B', tint: '#DDF3EF', need: 1,
    desc: 'Sentences with a gap. Type the missing word.',
    needs: 'any questions; ___ marks the gap',
    fits: () => true,
  },
  {
    id: 'wordSearch', name: 'Word Search', anchor: 'word-search', color: '#B0306B', tint: '#FBE3EE', need: 1,
    desc: 'Answers hidden in a letter grid. Questions as hints.',
    needs: `answers of ${LIMITS.wordSearch.min}–${LIMITS.wordSearch.max} letters`,
    fits: (p) => within(p, LIMITS.wordSearch),
  },
];

export const META = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameMeta>;

/** The pairs a game can use. The grid games also need every answer to be different. */
export function usable(game: GameId, pairs: Pair[]): Pair[] {
  const ok = pairs.filter(META[game].fits);
  if (game !== 'crossword' && game !== 'wordSearch') return ok;
  const seen = new Set<string>();
  return ok.filter((p) => !seen.has(p.clean) && (seen.add(p.clean), true));
}
