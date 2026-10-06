import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/lib/csv';
import { buildCrossword } from '../src/lib/crossword';
import { parseQuestions } from '../src/lib/questions';
import { shuffle } from '../src/lib/shuffle';
import { gridWord, judge, norm } from '../src/lib/text';
import { buildWordSearch, wordCells } from '../src/lib/wordsearch';

/** Small deterministic PRNG so failures are reproducible. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const WORDS = ['PARIS', 'TOKYO', 'ROME', 'BERLIN', 'CAIRO', 'OTTAWA', 'CANBERRA', 'NILE', 'PACIFIC', 'EVEREST'];

describe('parseCsv', () => {
  it('handles quotes, commas, escaped quotes, CRLF and BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\nlast,row');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['last', 'row']]);
  });
  it('keeps newlines inside quoted cells', () => {
    expect(parseCsv('a,"line1\nline2"')).toEqual([['a', 'line1\nline2']]);
  });
});

describe('parseQuestions', () => {
  it('maps headers in any order and reads metadata', () => {
    const { items } = parseQuestions('Subject,Answer,Question,Difficulty\nGeo,Paris,Capital of France?,Easy');
    expect(items[0]).toMatchObject({ question: 'Capital of France?', answer: 'Paris', subject: 'Geo', difficulty: 'Easy', games: null });
  });
  it('falls back to template column order without a header', () => {
    const { items } = parseQuestions('Capital of France?,Paris,matching');
    expect(items[0]).toMatchObject({ question: 'Capital of France?', answer: 'Paris', games: ['matching'] });
  });
  it('parses type lists and accepted alternatives', () => {
    const { items } = parseQuestions('Question,Answer,Type\nQ1,"Paris|paris france","Fill-Blank; word search"');
    expect(items[0].games).toEqual(['fillBlank', 'wordSearch']);
    expect(items[0].alts).toEqual(['paris france']);
  });
  it('skips blanks and duplicates with row numbers, keeps rows with unknown types', () => {
    const { items, skipped } = parseQuestions('Question,Answer,Type\nQ1,A1,\n,A2,\nQ3,,\nQ1,A1,\nQ5,A5,bogus');
    expect(items.map((i) => i.id)).toEqual(['row-2', 'row-6']);
    expect(items[1].games).toBeNull();
    expect(skipped.map((s) => s.row)).toEqual([3, 4, 5, 6]);
  });
});

describe('answer checking', () => {
  it('ignores case, punctuation and Latin accents', () => {
    expect(judge('  PARIS! ', ['Paris'])).toBe('exact');
    expect(judge('cafe', ['Café'])).toBe('exact');
  });
  it('keeps Devanagari intact', () => {
    expect(norm('नई दिल्ली')).toBe('नईदिल्ली');
    expect(judge('नई दिल्ली', ['नई दिल्ली'])).toBe('exact');
    expect(judge('नई', ['नई दिल्ली'])).toBe('wrong');
  });
  it('allows one typo in longer words only', () => {
    expect(judge('mitochondira', ['mitochondria'])).toBe('close');
    expect(judge('Pari', ['Paris'])).toBe('close'); // 5 letters → 1 typo
    expect(judge('Rom', ['Rome'])).toBe('wrong'); // short words are exact
    expect(judge('16', ['15'])).toBe('wrong'); // numbers are exact
  });
  it('accepts any listed alternative', () => {
    expect(judge('green plants', ['plants', 'green plants'])).toBe('exact');
    expect(judge('', ['x'])).toBe('wrong');
  });
  it('gridWord keeps A-Z and 0-9 only', () => {
    expect(gridWord('New York!')).toBe('NEWYORK');
    expect(gridWord('Zoë 2')).toBe('ZOE2');
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const src = [1, 2, 3, 4, 5, 6];
    const out = shuffle(src, seeded(1));
    expect(src).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(src);
  });
});

describe('buildCrossword', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`builds a valid grid (seed ${seed})`, () => {
      const cw = buildCrossword(WORDS.map((w) => ({ id: w, word: w, clue: w })), seeded(seed));
      expect(cw.words.length).toBeGreaterThanOrEqual(7);
      expect(cw.words.length + cw.skipped.length).toBe(WORDS.length);

      // Rebuild the grid; shared cells must agree.
      const grid = new Map<string, string>();
      for (const w of cw.words) {
        for (let i = 0; i < w.word.length; i++) {
          const r = w.row + (w.dir === 'down' ? i : 0);
          const c = w.col + (w.dir === 'across' ? i : 0);
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThan(cw.rows);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThan(cw.cols);
          const k = `${r},${c}`;
          if (grid.has(k)) expect(grid.get(k)).toBe(w.word[i]);
          grid.set(k, w.word[i]);
        }
      }

      // Every run of 2+ letters must be exactly a placed word (no accidental words).
      const runs = new Set(cw.words.map((w) => `${w.dir}:${w.row},${w.col}:${w.word}`));
      for (const dir of ['across', 'down'] as const) {
        const [dr, dc] = dir === 'across' ? [0, 1] : [1, 0];
        for (let r = 0; r < cw.rows; r++) {
          for (let c = 0; c < cw.cols; c++) {
            if (!grid.has(`${r},${c}`) || grid.has(`${r - dr},${c - dc}`)) continue; // not a run start
            let word = '';
            for (let rr = r, cc = c; grid.has(`${rr},${cc}`); rr += dr, cc += dc) word += grid.get(`${rr},${cc}`);
            if (word.length > 1) expect(runs.has(`${dir}:${r},${c}:${word}`)).toBe(true);
          }
        }
      }
    });
  }

  it('numbers words in reading order and shares numbers on a common start cell', () => {
    const cw = buildCrossword(WORDS.map((w) => ({ id: w, word: w, clue: w })), seeded(9));
    const nums = cw.words.map((w) => w.n);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
    expect(nums[0]).toBe(1);
    for (const a of cw.words) for (const b of cw.words) {
      if (a.row === b.row && a.col === b.col) expect(a.n).toBe(b.n);
    }
  });

  it('copes with a single word and with no overlap possible', () => {
    expect(buildCrossword([{ id: 'a', word: 'ABC', clue: '' }]).words).toHaveLength(1);
    const cw = buildCrossword([{ id: 'a', word: 'ABC', clue: '' }, { id: 'b', word: 'XYZ', clue: '' }]);
    expect(cw.words).toHaveLength(1);
    expect(cw.skipped).toHaveLength(1);
  });
});

describe('buildWordSearch', () => {
  for (const seed of [1, 2, 3]) {
    it(`hides every word where it says (seed ${seed})`, () => {
      const ws = buildWordSearch(WORDS.slice(0, 8).map((w) => ({ id: w, word: w, clue: w })), seeded(seed));
      expect(ws.words).toHaveLength(8);
      expect(ws.grid).toHaveLength(ws.size);
      for (const w of ws.words) {
        expect(wordCells(w).map(([r, c]) => ws.grid[r][c]).join('')).toBe(w.word);
      }
      for (const row of ws.grid) for (const ch of row) expect(ch).toMatch(/^[A-Z]$/);
    });
  }
  it('reports words that cannot fit', () => {
    const ws = buildWordSearch([{ id: 'x', word: 'A'.repeat(30), clue: '' }], seeded(1));
    expect(ws.skipped).toHaveLength(1);
  });
});
