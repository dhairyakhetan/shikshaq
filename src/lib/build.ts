import type { GameId, Pair } from '../types';
import { buildCrossword } from './crossword';
import { LIMITS, usable } from './games';
import { rng } from './rng';
import { shuffle } from './shuffle';
import { buildWordSearch } from './wordsearch';

export const BLANK = '_____';
/** Puzzles stay a printable size: beyond this a seeded random subset is used ("New layout" picks another). */
export const CROSSWORD_MAX = 40;
export const WORDSEARCH_MAX = 30;

export interface MatchRow { n: number; q: string; a: string; correct: string }
export interface MatchOption { letter: string; answer: string }
export interface FillRow { n: number; text: string; before: string; after: string; answer: string; auto: boolean; answerIndex: number }
export interface ClueEntry { number: number; direction: 'across' | 'down'; row: number; col: number; length: number; answer: string; clue: string }
export interface SearchWord { word: string; clue: string; row: number; col: number; direction: 'across' | 'down' | 'diagonal'; dr: number; dc: number }

export type Built =
  | { ok: false; game: GameId; msg: string }
  | { ok: true; game: 'matching'; rows: MatchRow[]; options: MatchOption[]; note: string }
  | { ok: true; game: 'fillBlank'; rows: FillRow[]; note: string }
  | { ok: true; game: 'crossword'; rows: number; cols: number; grid: string[]; numAt: Record<string, number>; across: ClueEntry[]; down: ClueEntry[]; placedCount: number; total: number; note: string }
  | { ok: true; game: 'wordSearch'; size: number; grid: string[]; mark: boolean[]; words: SearchWord[]; total: number; note: string };
export type BuiltOk = Extract<Built, { ok: true }>;

const list = (xs: string[]) => (xs.length > 8 ? `${xs.slice(0, 8).join(', ')} and ${xs.length - 8} more` : xs.join(', '));

/** A, B … Z, AA, AB … */
export function letter(i: number): string {
  return (i >= 26 ? letter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
}

function buildMatching(pairs: Pair[], R: () => number): Built {
  if (pairs.length < 2) return { ok: false, game: 'matching', msg: 'Matching needs at least 2 pairs.' };
  const order = pairs.map((_, i) => i);
  let idx = shuffle(order, R);
  if (idx.every((v, i) => v === i)) idx = [...idx.slice(1), idx[0]]; // never leave the answers in question order
  const options = idx.map((pi, pos) => ({ letter: letter(pos), answer: pairs[pi].a }));
  const rows = pairs.map((p, i) => ({ n: i + 1, q: p.q, a: p.a, correct: letter(idx.indexOf(i)) }));
  return { ok: true, game: 'matching', rows, options, note: '' };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where the gap goes: the user's ___, else the answer if it appears as a whole word, else the end. */
function blankify(q: string, a: string): { text: string; auto: boolean } {
  if (/_{2,}/.test(q)) return { text: q.replace(/_{2,}/, BLANK), auto: false };
  const hit = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(a)})(?=$|[^\\p{L}\\p{N}])`, 'iu').exec(q);
  if (hit) {
    const at = hit.index + hit[1].length;
    return { text: q.slice(0, at) + BLANK + q.slice(at + a.length), auto: true };
  }
  return { text: `${q.replace(/[?.!:\s]+$/, '')}: ${BLANK}`, auto: true };
}

function buildFill(pairs: Pair[]): Built {
  if (!pairs.length) return { ok: false, game: 'fillBlank', msg: 'Fill-in-the-Blank needs at least 1 pair.' };
  const rows = pairs.map((p, i) => {
    const b = blankify(p.q, p.a);
    const k = b.text.indexOf(BLANK);
    return {
      n: i + 1, text: b.text, answer: p.a, auto: b.auto,
      before: b.text.slice(0, k), after: b.text.slice(k + BLANK.length),
      answerIndex: b.text.split(/\s+/).findIndex((w) => w.includes(BLANK)),
    };
  });
  const auto = rows.filter((r) => r.auto).length;
  const note = auto
    ? `${auto} question${auto > 1 ? 's had' : ' had'} no ___, so a blank was added for you. Put ___ in your data to choose the spot.`
    : '';
  return { ok: true, game: 'fillBlank', rows, note };
}

function pick<T>(items: T[], cap: number, R: () => number): T[] {
  return items.length > cap ? shuffle(items, R).slice(0, cap) : items;
}

function buildCross(pairs: Pair[], R: () => number): Built {
  const fit = usable('crossword', pairs);
  const { min, max } = LIMITS.crossword;
  if (fit.length < 2) {
    return { ok: false, game: 'crossword', msg: `Crossword needs at least 2 different answers of ${min}–${max} letters or digits. Yours has ${fit.length}.` };
  }
  const chosen = pick(fit, CROSSWORD_MAX, R);
  const tries = Math.max(6, Math.min(40, Math.floor(3000 / chosen.length)));
  const cw = buildCrossword(chosen.map((p) => ({ id: String(p.n), word: p.clean, clue: p.q })), R, tries);
  if (cw.words.length < 2) {
    return { ok: false, game: 'crossword', msg: 'These answers share no letters, so they cannot cross. Add more words or press New layout.' };
  }

  const grid = Array.from({ length: cw.rows }, () => Array<string>(cw.cols).fill('#'));
  const numAt: Record<string, number> = {};
  const entries: ClueEntry[] = cw.words.map((w) => {
    for (let i = 0; i < w.word.length; i++) {
      grid[w.row + (w.dir === 'down' ? i : 0)][w.col + (w.dir === 'across' ? i : 0)] = w.word[i];
    }
    numAt[`${w.row},${w.col}`] = w.n;
    return { number: w.n, direction: w.dir, row: w.row, col: w.col, length: w.word.length, answer: w.word, clue: w.clue };
  });
  const byNumber = (a: ClueEntry, b: ClueEntry) => a.number - b.number;

  const placed = new Set(cw.words.map((w) => w.id));
  const left = pairs.filter((p) => !placed.has(String(p.n))).map((p) => p.a);
  return {
    ok: true, game: 'crossword', rows: cw.rows, cols: cw.cols, grid: grid.map((r) => r.join('')), numAt,
    across: entries.filter((e) => e.direction === 'across').sort(byNumber),
    down: entries.filter((e) => e.direction === 'down').sort(byNumber),
    placedCount: cw.words.length, total: pairs.length,
    note: left.length ? `Left out (wrong length, repeated, or no shared letters): ${list(left)}. Try New layout, or add more words.` : '',
  };
}

function buildSearch(pairs: Pair[], R: () => number): Built {
  const fit = usable('wordSearch', pairs);
  const { min, max } = LIMITS.wordSearch;
  if (!fit.length) {
    return { ok: false, game: 'wordSearch', msg: `Word Search needs at least 1 answer of ${min}–${max} letters or digits.` };
  }
  const chosen = pick(fit, WORDSEARCH_MAX, R);
  const ws = buildWordSearch(chosen.map((p) => ({ id: String(p.n), word: p.clean, clue: p.q })), R);

  const mark = new Array<boolean>(ws.size * ws.size).fill(false);
  const words: SearchWord[] = ws.words.map((w) => {
    for (let i = 0; i < w.word.length; i++) mark[(w.row + w.dr * i) * ws.size + w.col + w.dc * i] = true;
    const direction: SearchWord['direction'] = w.dr === 0 ? 'across' : w.dc === 0 ? 'down' : 'diagonal';
    return { word: w.word, clue: w.clue, row: w.row, col: w.col, direction, dr: w.dr, dc: w.dc };
  }).sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));

  const placed = new Set(ws.words.map((w) => w.id));
  const left = pairs.filter((p) => !placed.has(String(p.n))).map((p) => p.a);
  return {
    ok: true, game: 'wordSearch', size: ws.size, grid: ws.grid.map((r) => r.join('')), mark, words, total: pairs.length,
    note: left.length ? `Left out (wrong length, repeated, or no room): ${list(left)}.` : '',
  };
}

/** The same pairs and seed always give the same game. */
export function build(game: GameId, pairs: Pair[], seed: number): Built {
  const R = rng(seed);
  switch (game) {
    case 'matching': return buildMatching(pairs, R);
    case 'fillBlank': return buildFill(pairs);
    case 'crossword': return buildCross(pairs, R);
    case 'wordSearch': return buildSearch(pairs, R);
  }
}
