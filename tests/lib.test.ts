import { describe, expect, it } from 'vitest';
import { build, BLANK, CROSSWORD_MAX, letter, type BuiltOk } from '../src/lib/build';
import { LIMITS, usable } from '../src/lib/games';
import { makeAllGames, makeOutput } from '../src/lib/output';
import { MAX_ANSWER, MAX_QUESTION, parsePairs } from '../src/lib/parse';
import { gridWord } from '../src/lib/text';
import type { GameId } from '../src/types';

const SAMPLE = [
  'Capital of France | Paris', 'Largest planet in the solar system | Jupiter', 'The ___ is the powerhouse of the cell | Mitochondria',
  'Plants make food from sunlight by ___ | Photosynthesis', 'Frozen water | Ice', 'Hardest natural substance | Diamond',
  'Fastest land animal | Cheetah', 'The red planet | Mars',
].join('\n');
const pairs = (raw = SAMPLE) => parsePairs(raw).pairs;
const ok = (game: GameId, raw?: string, seed = 1): BuiltOk => {
  const b = build(game, pairs(raw), seed);
  if (!b.ok) throw new Error(b.msg);
  return b;
};

describe('parsePairs', () => {
  it('reads pipes, tabs and " = "', () => {
    const { pairs: p, warns } = parsePairs('Q1 | A1\nQ2\tA2\nQ3 = A3');
    expect(p.map((x) => [x.q, x.a])).toEqual([['Q1', 'A1'], ['Q2', 'A2'], ['Q3', 'A3']]);
    expect(warns).toEqual([]);
  });

  it('copes with a Markdown table from a chatbot: edges, header and divider lines', () => {
    const md = '| Question | Answer |\n|---|---|\n| Capital of France | Paris |\n| Frozen water | Ice |';
    const { pairs: p, warns } = parsePairs(md);
    expect(p.map((x) => [x.q, x.a])).toEqual([['Capital of France', 'Paris'], ['Frozen water', 'Ice']]);
    expect(warns).toEqual([]);
  });

  it('does not mistake "| answer" or "question |" for a table row', () => {
    const { pairs: p, warns } = parsePairs('| A3\nQ4 |');
    expect(p).toEqual([]);
    expect(warns).toEqual(['Line 1: the question is empty.', 'Line 2: the answer is empty.']);
  });

  it('skips a Question/Answer header row but only on the first line', () => {
    expect(parsePairs('Question | Answer\nQ | A').pairs).toHaveLength(1);
    expect(parsePairs('Q | A\nQuestion | Answer').pairs).toHaveLength(2);
  });

  it('reads cells copied from a spreadsheet and ignores extra columns without complaint', () => {
    const { pairs: p, warns } = parsePairs('Q1\tA1\tEasy\tBiology\nQ2\tA2\t\t');
    expect(p).toHaveLength(2);
    expect(warns).toEqual([]);
  });

  it('reports what it cannot use, with the real line number (blank lines count)', () => {
    const { pairs: p, warns } = parsePairs('Q1 | A1\n\nno separator here\n | A3\nQ4 | \nQ5 | A5 | extra');
    expect(p.map((x) => x.q)).toEqual(['Q1', 'Q5']);
    expect(warns).toEqual([
      'Line 3: put " | " between the question and the answer.',
      'Line 4: the question is empty.',
      'Line 5: the answer is empty.',
      'Line 6: only the text before the second separator was used as the answer.',
    ]);
  });

  it('skips repeats and over-long lines', () => {
    const long = `${'q'.repeat(MAX_QUESTION + 1)} | a\nq | ${'a'.repeat(MAX_ANSWER + 1)}`;
    const { pairs: p, warns } = parsePairs(`Q | A\nq | a\n${long}`);
    expect(p).toHaveLength(1);
    expect(warns.map((w) => w.replace(/^Line \d+: /, ''))).toEqual([
      'same as line 1, skipped.', `the question is longer than ${MAX_QUESTION} characters, skipped.`, `the answer is longer than ${MAX_ANSWER} characters, skipped.`,
    ]);
  });

  it('numbers pairs from 1 and handles Windows line endings and Hindi', () => {
    const { pairs: p } = parsePairs('Q1 | A1\r\nभारत की राजधानी | नई दिल्ली\r\n');
    expect(p.map((x) => x.n)).toEqual([1, 2]);
    expect(p[1].a).toBe('नई दिल्ली');
    expect(p[1].clean).toBe(''); // no Latin letters: never used in a grid
  });

  it('turns answers into grid words: accents out, digits kept', () => {
    expect(gridWord('Café au lait!')).toBe('CAFEAULAIT');
    expect(gridWord('H2O')).toBe('H2O');
  });
});

describe('which pairs a game can use', () => {
  const p = pairs('Q1 | Ice\nQ2 | ice\nQ3 | A\nQ4 | ' + 'x'.repeat(21) + '\nQ5 | Mars');
  it('crossword keeps lengths 2–20 and drops repeated answers', () => {
    expect(usable('crossword', p).map((x) => x.a)).toEqual(['Ice', 'Mars']);
    expect(LIMITS.crossword).toEqual({ min: 2, max: 20 });
  });
  it('word search keeps 2–15; matching and fill-in-the-blank take everything', () => {
    expect(usable('wordSearch', p).map((x) => x.a)).toEqual(['Ice', 'Mars']);
    expect(usable('matching', p)).toHaveLength(5);
    expect(usable('fillBlank', p)).toHaveLength(5);
  });
});

describe('matching', () => {
  it('names options A, B … Z, AA, AB', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(letter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
  it('gives every question the letter of its own answer and never leaves the answers in order', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const b = ok('matching', 'Q1 | A\nQ2 | B', seed);
      if (b.game !== 'matching') throw new Error();
      expect(b.options.map((o) => o.answer)).not.toEqual(['A', 'B']);
      for (const r of b.rows) expect(b.options.find((o) => o.letter === r.correct)!.answer).toBe(r.a);
    }
  });
  it('needs two pairs', () => {
    expect(build('matching', pairs('Q | A'), 1)).toMatchObject({ ok: false, msg: 'Matching needs at least 2 pairs.' });
  });
});

describe('fill in the blank', () => {
  const row = (raw: string) => {
    const b = ok('fillBlank', raw);
    if (b.game !== 'fillBlank') throw new Error();
    return b.rows[0];
  };
  it('uses the user\'s ___ as the gap', () => {
    expect(row('The ___ is big | sun')).toMatchObject({ text: `The ${BLANK} is big`, before: 'The ', after: ' is big', auto: false, answerIndex: 1 });
  });
  it('blanks the answer where it appears as a whole word, case-insensitively', () => {
    expect(row('Paris is the capital of France | Paris')).toMatchObject({ text: `${BLANK} is the capital of France`, auto: true, answerIndex: 0 });
  });
  it('does not blank part of a longer word', () => {
    expect(row('Which category is this? | cat').text).toBe(`Which category is this: ${BLANK}`);
  });
  it('appends a gap when the answer is not in the question, and survives regex characters', () => {
    expect(row('Capital of France? | Paris').text).toBe(`Capital of France: ${BLANK}`);
    expect(row('What is (a+b)? | (a+b)').text).toBe(`What is ${BLANK}?`);
  });
  it('tells the user how many gaps it added', () => {
    const b = ok('fillBlank');
    expect(b.note).toMatch(/^\d+ questions had no ___/);
  });
});

/** Rebuilds the grid from the clue list and checks every run of two or more letters is a listed word. */
function expectValidCrossword(b: Extract<BuiltOk, { game: 'crossword' }>) {
  const words = [...b.across, ...b.down];
  const cells = new Map<string, string>();
  for (const w of words) {
    for (let i = 0; i < w.length; i++) {
      const r = w.row + (w.direction === 'down' ? i : 0);
      const c = w.col + (w.direction === 'across' ? i : 0);
      const k = `${r},${c}`;
      if (cells.has(k)) expect(cells.get(k)).toBe(w.answer[i]);
      cells.set(k, w.answer[i]);
      expect(b.grid[r][c]).toBe(w.answer[i]);
    }
  }
  // no letters outside words, and every cell is either a block or a letter of a word
  b.grid.forEach((row, r) => row.split('').forEach((ch, c) => expect(ch === '#' ? !cells.has(`${r},${c}`) : cells.has(`${r},${c}`)).toBe(true)));
  const listed = new Set(words.map((w) => `${w.direction}:${w.row},${w.col}:${w.answer}`));
  for (const dir of ['across', 'down'] as const) {
    const [dr, dc] = dir === 'across' ? [0, 1] : [1, 0];
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
      if (!cells.has(`${r},${c}`) || cells.has(`${r - dr},${c - dc}`)) continue;
      let word = '';
      for (let rr = r, cc = c; cells.has(`${rr},${cc}`); rr += dr, cc += dc) word += cells.get(`${rr},${cc}`);
      if (word.length > 1) expect(listed.has(`${dir}:${r},${c}:${word}`), `${dir} ${r},${c} ${word}`).toBe(true);
    }
  }
  for (const w of words) expect(b.numAt[`${w.row},${w.col}`]).toBe(w.number);
}

describe('crossword', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`builds a valid interlocking grid (seed ${seed})`, () => {
      const b = ok('crossword', undefined, seed);
      if (b.game !== 'crossword') throw new Error();
      expectValidCrossword(b);
      expect(b.placedCount).toBeGreaterThanOrEqual(6);
      expect(b.total).toBe(8);
    });
  }

  it('handles digits and accents in answers', () => {
    const b = ok('crossword', 'Water formula | H2O\nCold | Glacé\nHeat | Éclair\nShort | Ice');
    if (b.game !== 'crossword') throw new Error();
    expectValidCrossword(b);
    expect([...b.across, ...b.down].some((w) => w.answer === 'GLACE')).toBe(true);
  });

  it('is repeatable for one seed and varies between seeds', () => {
    const a = JSON.stringify(ok('crossword', undefined, 7));
    expect(JSON.stringify(ok('crossword', undefined, 7))).toBe(a);
    const others = [8, 9, 10, 11, 12].map((s) => JSON.stringify(ok('crossword', undefined, s)));
    expect(others.some((o) => o !== a)).toBe(true);
  });

  it('explains itself when it cannot build', () => {
    expect(build('crossword', pairs('Q | A'), 1)).toMatchObject({ ok: false });
    const none = build('crossword', pairs('Q1 | AAA\nQ2 | BBB'), 1);
    expect(none).toMatchObject({ ok: false });
    expect((none as { msg: string }).msg).toContain('share no letters');
  });

  it('reports the answers it left out', () => {
    const b = ok('crossword', 'Q1 | Paris\nQ2 | Rome\nQ3 | Zzzzz\nQ4 | Q');
    expect(b.note).toContain('Zzzzz');
    expect(b.note).toContain('Q');
  });

  it('caps a very large paste and stays fast', () => {
    const words = Array.from({ length: 150 }, (_, i) => `Clue ${i} | ${['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'][i % 8]}${letter(i)}${i}`).join('\n');
    const t0 = performance.now();
    const b = ok('crossword', words);
    if (b.game !== 'crossword') throw new Error();
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(b.placedCount).toBeLessThanOrEqual(CROSSWORD_MAX);
    expectValidCrossword(b);
  });
});

describe('word search', () => {
  for (const seed of [1, 2, 3]) {
    it(`hides every word exactly where it says (seed ${seed})`, () => {
      const b = ok('wordSearch', undefined, seed);
      if (b.game !== 'wordSearch') throw new Error();
      expect(b.words).toHaveLength(8);
      for (const w of b.words) {
        const text = Array.from({ length: w.word.length }, (_, i) => b.grid[w.row + w.dr * i][w.col + w.dc * i]).join('');
        expect(text).toBe(w.word);
        expect(['across', 'down', 'diagonal']).toContain(w.direction);
        expect(b.mark[w.row * b.size + w.col]).toBe(true);
      }
      expect(b.grid.every((row) => row.length === b.size)).toBe(true);
      expect(b.grid.join('')).toMatch(/^[A-Z0-9]+$/);
    });
  }
  it('lists words alphabetically and reports what did not fit', () => {
    const b = ok('wordSearch', 'Q1 | zebra\nQ2 | apple\nQ3 | ' + 'abcdefghijklmnop\nQ4 | x');
    if (b.game !== 'wordSearch') throw new Error();
    expect(b.words.map((w) => w.word)).toEqual(['APPLE', 'ZEBRA']);
    expect(b.note).toContain('abcdefghijklmnop');
  });
});

describe('files', () => {
  const all = (game: GameId, raw?: string) => ok(game, raw);

  it('JSON has the documented shape for every game', () => {
    const m = JSON.parse(makeOutput(all('matching'), 'json', 'Bio Quiz'));
    expect(Object.keys(m)).toEqual(['id', 'gameType', 'title', 'pairs', 'shuffledAnswers', 'answerShuffleMap']);
    expect(m).toMatchObject({ id: 'bio-quiz-matching', gameType: 'matching', title: 'Bio Quiz' });
    expect(m.pairs[0]).toHaveProperty('correctOption');
    expect(m.shuffledAnswers).toHaveLength(8);

    const f = JSON.parse(makeOutput(all('fillBlank'), 'json', 'T'));
    expect(Object.keys(f)).toEqual(['id', 'gameType', 'title', 'questions']);
    expect(Object.keys(f.questions[0])).toEqual(['id', 'text', 'answer', 'answerIndex']);

    const c = JSON.parse(makeOutput(all('crossword'), 'json', 'T'));
    expect(Object.keys(c)).toEqual(['id', 'gameType', 'title', 'rows', 'cols', 'grid', 'clues']);
    expect(Object.keys(c.clues)).toEqual(['across', 'down']);
    expect(Object.keys(c.clues.across[0])).toEqual(['number', 'row', 'col', 'length', 'answer', 'clue']);

    const w = JSON.parse(makeOutput(all('wordSearch'), 'json', 'T'));
    expect(Object.keys(w)).toEqual(['id', 'gameType', 'title', 'size', 'grid', 'words']);
    expect(Object.keys(w.words[0])).toEqual(['word', 'clue', 'row', 'col', 'direction']);
  });

  it('keeps answers such as "constructor" and "__proto__" in the matching map', () => {
    const m = JSON.parse(makeOutput(ok('matching', 'Q1 | constructor\nQ2 | __proto__\nQ3 | x'), 'json', 'T'));
    expect(Object.keys(m.answerShuffleMap).sort()).toEqual(['__proto__', 'constructor', 'x']);
  });

  it('falls back to "My Game" for an empty title', () => {
    expect(JSON.parse(makeOutput(all('fillBlank'), 'json', '   ')).title).toBe('My Game');
  });

  it('CSV quotes every field and doubles quotes; one header per game', () => {
    const out = makeOutput(ok('fillBlank', 'Say "hi", please | hello'), 'csv', 'T');
    expect(out).toBe('"number","sentence","answer","answer_word_index"\r\n"1","Say ""hi"", please: _____","hello","3"');
    for (const [g, head] of [['matching', 'number,question,answer,correct_option,option_letter,option_text'], ['crossword', 'number,direction,row,col,length,answer,clue'], ['wordSearch', 'word,clue,row,col,direction']] as const) {
      expect(makeOutput(all(g), 'csv', 'T').split('\r\n')[0].replace(/"/g, '')).toBe(head);
    }
  });

  it('plain text carries the title, the puzzle and an answer key', () => {
    for (const g of ['matching', 'fillBlank', 'crossword', 'wordSearch'] as const) {
      const t = makeOutput(all(g), 'txt', 'My Quiz');
      expect(t.startsWith('MY QUIZ\n')).toBe(true);
      expect(t).toContain('--- ANSWER KEY ---');
    }
    expect(makeOutput(all('crossword'), 'txt', 'T')).not.toMatch(/[A-Z0-9]{3}[^\n]*\n[^\n]*ACROSS/); // the puzzle half shows no letters
  });

  it('printable worksheet has an answer key on its own page and a print button', () => {
    for (const g of ['matching', 'fillBlank', 'crossword', 'wordSearch'] as const) {
      const h = makeOutput(all(g), 'html', 'T');
      expect(h.startsWith('<!doctype html>')).toBe(true);
      expect(h).toContain('class="key"');
      expect(h).toContain('window.print()');
    }
  });

  it('escapes everything the user typed in the printable file and in the JSON', () => {
    const evil = '<img src=x onerror=alert(1)> | <script>alert(2)</script>';
    for (const g of ['matching', 'fillBlank'] as const) {
      const h = makeOutput(ok(g, `${evil}\nQ2 | A2`), 'html', '"><script>alert(3)</script>');
      expect(h).not.toMatch(/<img src=x|<script>alert/);
      expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
    expect(JSON.parse(makeOutput(ok('matching', `${evil}\nQ2 | A2`), 'json', 'T')).pairs[0].question).toBe('<img src=x onerror=alert(1)>');
  });

  it('"all games" holds every buildable game and explains the ones that are missing', () => {
    const full = JSON.parse(makeAllGames(pairs(), 'Pack', 1));
    expect(full.games.map((g: { gameType: string }) => g.gameType)).toEqual(['crossword', 'matching', 'fillBlank', 'wordSearch']);
    expect(full.unavailable).toEqual([]);
    const small = JSON.parse(makeAllGames(pairs('Only | One'), 'Pack', 1));
    expect(small.games.map((g: { gameType: string }) => g.gameType)).toEqual(['fillBlank', 'wordSearch']);
    expect(small.unavailable.map((u: { gameType: string }) => u.gameType)).toEqual(['crossword', 'matching']);
    expect(small.unavailable[0].reason).toContain('Crossword needs');
  });
});
