export interface WsEntry {
  id: string;
  word: string; // A–Z / 0–9
  clue: string;
}

export interface WsWord extends WsEntry {
  row: number;
  col: number;
  dr: number;
  dc: number;
}

export interface WordSearch {
  size: number;
  grid: string[][];
  words: WsWord[];
  skipped: WsEntry[];
}

/** Across →, down ↓ and diagonal ↘: the three directions in the Game Maker file format. */
export const DIRECTIONS: [number, number][] = [[0, 1], [1, 0], [1, 1]];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_SIZE = 20;

function tryPlace(grid: string[][], word: string, rand: () => number, attempts = 200) {
  const size = grid.length;
  for (let a = 0; a < attempts; a++) {
    const [dr, dc] = DIRECTIONS[Math.floor(rand() * DIRECTIONS.length)];
    const row = Math.floor(rand() * size);
    const col = Math.floor(rand() * size);
    const endR = row + dr * (word.length - 1);
    const endC = col + dc * (word.length - 1);
    if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
    let ok = true;
    for (let i = 0; i < word.length && ok; i++) {
      const cur = grid[row + dr * i][col + dc * i];
      ok = cur === '' || cur === word[i];
    }
    if (!ok) continue;
    for (let i = 0; i < word.length; i++) grid[row + dr * i][col + dc * i] = word[i];
    return { row, col, dr, dc };
  }
  return null;
}

/** Hide words in a square grid and pad the rest with random letters. */
export function buildWordSearch(entries: WsEntry[], rand: () => number = Math.random): WordSearch {
  const sorted = entries.slice().sort((a, b) => b.word.length - a.word.length);
  const letters = sorted.reduce((n, e) => n + e.word.length, 0);
  const longest = sorted[0]?.word.length ?? 0;
  const base = Math.min(MAX_SIZE, Math.max(8, longest, Math.ceil(Math.sqrt(letters * 2.2))));

  let best: { size: number; grid: string[][]; words: WsWord[] } | null = null;
  // If something won't fit, retry on a slightly bigger board.
  for (let size = base; size <= Math.min(MAX_SIZE, base + 3); size++) {
    const grid = Array.from({ length: size }, () => Array<string>(size).fill(''));
    const words: WsWord[] = [];
    for (const e of sorted) {
      const pos = tryPlace(grid, e.word, rand);
      if (pos) words.push({ ...e, ...pos });
    }
    if (!best || words.length > best.words.length) best = { size, grid, words };
    if (words.length === sorted.length) break;
  }

  const { size, grid, words } = best ?? { size: base, grid: [], words: [] as WsWord[] };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) if (grid[r][c] === '') grid[r][c] = LETTERS[Math.floor(rand() * 26)];
  }
  const placed = new Set(words.map((w) => w.id));
  return { size, grid, words, skipped: entries.filter((e) => !placed.has(e.id)) };
}

/** Cells covered by a placed word. */
export function wordCells(w: WsWord): [number, number][] {
  return Array.from({ length: w.word.length }, (_, i) => [w.row + w.dr * i, w.col + w.dc * i]);
}
