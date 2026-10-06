import { shuffle } from './shuffle';

export interface CwEntry {
  id: string;
  word: string; // A–Z / 0–9
  clue: string;
}

export interface CwWord extends CwEntry {
  row: number;
  col: number;
  dir: 'across' | 'down';
  n: number; // clue number
}

export interface Crossword {
  rows: number;
  cols: number;
  words: CwWord[];
  skipped: CwEntry[];
}

type Dir = 'across' | 'down';
const key = (r: number, c: number) => `${r},${c}`;

interface Layout {
  letters: Map<string, string>;
  dirs: Map<string, Set<Dir>>;
  placed: { entry: CwEntry; row: number; col: number; dir: Dir }[];
}

function fits(l: Layout, word: string, row: number, col: number, dir: Dir): number {
  const dr = dir === 'down' ? 1 : 0;
  const dc = dir === 'across' ? 1 : 0;
  // The cells just before and after the word must be empty.
  if (l.letters.has(key(row - dr, col - dc)) || l.letters.has(key(row + dr * word.length, col + dc * word.length))) return -1;

  let crossings = 0;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const k = key(r, c);
    const have = l.letters.get(k);
    if (have !== undefined) {
      if (have !== word[i] || l.dirs.get(k)!.has(dir)) return -1;
      crossings++;
    } else if (l.letters.has(key(r + dc, c + dr)) || l.letters.has(key(r - dc, c - dr))) {
      return -1; // would sit right beside another word
    }
  }
  return crossings;
}

function put(l: Layout, entry: CwEntry, row: number, col: number, dir: Dir) {
  for (let i = 0; i < entry.word.length; i++) {
    const k = key(row + (dir === 'down' ? i : 0), col + (dir === 'across' ? i : 0));
    l.letters.set(k, entry.word[i]);
    (l.dirs.get(k) ?? l.dirs.set(k, new Set()).get(k)!).add(dir);
  }
  l.placed.push({ entry, row, col, dir });
}

function area(l: Layout, extra?: { row: number; col: number; len: number; dir: Dir }) {
  let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  const see = (r: number, c: number) => { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); };
  for (const k of l.letters.keys()) { const [r, c] = k.split(',').map(Number); see(r, c); }
  if (extra) {
    see(extra.row, extra.col);
    see(extra.row + (extra.dir === 'down' ? extra.len - 1 : 0), extra.col + (extra.dir === 'across' ? extra.len - 1 : 0));
  }
  return { h: r1 - r0 + 1, w: c1 - c0 + 1 };
}

function attempt(order: CwEntry[], rand: () => number): Layout {
  const l: Layout = { letters: new Map(), dirs: new Map(), placed: [] };
  let pending = order.slice();
  put(l, pending.shift()!, 0, 0, 'across');

  // Keep sweeping the leftovers until a full pass places nothing.
  for (let progress = true; progress && pending.length; ) {
    progress = false;
    const next: CwEntry[] = [];
    for (const entry of pending) {
      let best: { row: number; col: number; dir: Dir; score: number } | null = null;
      for (const [k, ch] of l.letters) {
        const [r, c] = k.split(',').map(Number);
        for (let i = 0; i < entry.word.length; i++) {
          if (entry.word[i] !== ch) continue;
          for (const dir of ['across', 'down'] as Dir[]) {
            const row = dir === 'down' ? r - i : r;
            const col = dir === 'across' ? c - i : c;
            const crossings = fits(l, entry.word, row, col, dir);
            if (crossings < 1) continue;
            const { h, w } = area(l, { row, col, len: entry.word.length, dir });
            // More crossings is better, then a squarer/smaller grid, then luck.
            const score = crossings * 100 - Math.max(h, w) * 3 - h * w * 0.1 + rand();
            if (!best || score > best.score) best = { row, col, dir, score };
          }
        }
      }
      if (best) { put(l, entry, best.row, best.col, best.dir); progress = true; } else next.push(entry);
    }
    pending = next;
  }
  return l;
}

/** Greedy interlocking-grid builder: longest word first, best of several random orders. */
export function buildCrossword(entries: CwEntry[], rand: () => number = Math.random, tries = 40): Crossword {
  if (!entries.length) return { rows: 0, cols: 0, words: [], skipped: [] };
  const byLength = entries.slice().sort((a, b) => b.word.length - a.word.length);

  let best: Layout | null = null;
  let bestSize = Infinity;
  for (let t = 0; t < tries; t++) {
    const [first, ...rest] = byLength;
    const order = t === 0 ? byLength : [first, ...shuffle(rest, rand)];
    const l = attempt(order, rand);
    const { h, w } = area(l);
    const size = h * w;
    if (!best || l.placed.length > best.placed.length || (l.placed.length === best.placed.length && size < bestSize)) {
      best = l; bestSize = size;
    }
  }

  const layout = best!;
  let r0 = Infinity, c0 = Infinity;
  for (const p of layout.placed) { r0 = Math.min(r0, p.row); c0 = Math.min(c0, p.col); }
  const { h, w } = area(layout);

  const words: CwWord[] = layout.placed
    .map((p) => ({ ...p.entry, row: p.row - r0, col: p.col - c0, dir: p.dir, n: 0 }))
    .sort((a, b) => a.row - b.row || a.col - b.col);

  // Standard numbering: reading order, words starting on the same cell share a number.
  let n = 0;
  let last = '';
  for (const w2 of words) {
    const k = key(w2.row, w2.col);
    if (k !== last) { n++; last = k; }
    w2.n = n;
  }

  const placedIds = new Set(words.map((x) => x.id));
  return { rows: h, cols: w, words, skipped: entries.filter((e) => !placedIds.has(e.id)) };
}
