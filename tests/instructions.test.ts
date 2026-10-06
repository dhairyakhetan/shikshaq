import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { build } from '../src/lib/build';
import { GAMES, LIMITS } from '../src/lib/games';
import { FORMATS, gameObject } from '../src/lib/output';
import { MAX_ANSWER, MAX_QUESTION, parsePairs } from '../src/lib/parse';
import { SAMPLE } from '../src/sample';
import type { Pair } from '../src/types';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('src/instructions.html');
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const pair = (len: number): Pair => ({ n: 1, q: 'q', a: 'a', clean: 'A'.repeat(len) });

describe('the chatbot instructions agree with the code', () => {
  it('give the exact line format', () => {
    expect(html).toContain('<pre><code>Question | Answer</code></pre>');
    expect(parsePairs('Question | Answer text\nQ2 | A2').pairs.map((p) => p.a)).toEqual(['Answer text', 'A2']);
  });

  it('state the length limits the parser enforces', () => {
    expect(text).toContain(`A question is at most ${MAX_QUESTION} characters and an answer at most ${MAX_ANSWER}`);
    expect(text).toContain(`Every question is at most ${MAX_QUESTION} characters and every answer at most ${MAX_ANSWER}`);
    const { pairs, warns } = parsePairs(`${'q'.repeat(MAX_QUESTION + 1)} | a\nq | ${'a'.repeat(MAX_ANSWER + 1)}\n${'q'.repeat(MAX_QUESTION)} | ${'a'.repeat(MAX_ANSWER)}`);
    expect(pairs).toHaveLength(1);
    expect(warns).toHaveLength(2);
  });

  it('state the answer lengths each puzzle accepts', () => {
    const fits = (id: 'crossword' | 'wordSearch', len: number) => GAMES.find((g) => g.id === id)!.fits(pair(len));
    const { crossword: c, wordSearch: w } = LIMITS;
    expect([fits('crossword', c.min - 1), fits('crossword', c.min), fits('crossword', c.max), fits('crossword', c.max + 1)]).toEqual([false, true, true, false]);
    expect([fits('wordSearch', w.min - 1), fits('wordSearch', w.min), fits('wordSearch', w.max), fits('wordSearch', w.max + 1)]).toEqual([false, true, true, false]);
    expect(text).toContain(`is ${c.min} to ${c.max} letters or digits`);
    expect(text).toContain(`is ${w.min} to ${w.max} letters or digits`);
  });

  it('list every game with the number of pairs it really needs', () => {
    for (const g of GAMES) {
      const row = html.match(new RegExp(`<tr><td>${g.name}</td>.*?<td>(\\d+)</td></tr>`, 's'));
      expect(row, `table row for ${g.name}`).not.toBeNull();
      expect(Number(row![1]), g.name).toBe(g.need);
    }
    // the minimums are real: one pair below the minimum cannot be built, the minimum can
    const lines = ['Alpha | Cat', 'Beta | Rat', 'Gamma | Bat'];
    for (const g of GAMES) {
      const enough = parsePairs(lines.slice(0, g.need).join('\n')).pairs;
      const short = parsePairs(lines.slice(0, g.need - 1).join('\n')).pairs;
      expect(build(g.id, enough, 1).ok, `${g.name} with ${g.need}`).toBe(true);
      expect(build(g.id, short, 1).ok, `${g.name} with ${g.need - 1}`).toBe(false);
    }
  });

  it('use the same names as the interface the user sees', () => {
    const data = read('src/components/DataStep.tsx');
    const game = read('src/components/GameStep.tsx');
    const dl = read('src/components/DownloadStep.tsx');
    for (const label of ['1. Add your questions', 'Game title', 'Questions and answers']) expect(data).toContain(label);
    expect(game).toContain('2. Pick a game');
    expect(dl).toContain('3. Check it, then download');
    expect(html).toContain("Under '1. Add your questions', type the title into 'Game title' and paste the lines into 'Questions and answers'");
    expect(html).toContain("Under '2. Pick a game', choose " + GAMES.map((g) => g.name).slice(0, 3).join(', ') + ' or ' + GAMES[3].name);
    expect(html).toContain("Under '3. Check it, then download', pick a file type and press Download");
    expect(html).toContain('Layout buttons'); // the tabs in step 3
    expect(read('src/components/DownloadStep.tsx')).toContain('Layout {k + 1}');
    expect(dl).toMatch(/<b>Download[^<]*<\/b>/); // the button reads "Download" or "Download layout 2"
    expect(read('src/components/Header.tsx')).toContain('#chatbots'); // the header link lands on the instructions
    expect(html).toContain('id="chatbots"');
  });

  it('walk through steps 1 to 7 in order', () => {
    const steps = [...html.matchAll(/<h4>Step (\d+):/g)].map((m) => Number(m[1]));
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('name the file types and the game types the site really produces', () => {
    for (const f of FORMATS) expect(text.toLowerCase()).toContain(f.label.toLowerCase());
    const { pairs } = parsePairs(SAMPLE);
    for (const g of GAMES) {
      const b = build(g.id, pairs, 1);
      if (!b.ok) throw new Error(b.msg);
      expect(html).toContain(`<code>${gameObject(b, 't').gameType}</code>`);
    }
    const c = build('crossword', pairs, 1);
    if (!c.ok) throw new Error();
    for (const key of ['id', 'gameType', 'title', 'rows', 'cols', 'grid', 'clues']) expect(Object.keys(gameObject(c, 't'))).toContain(key);
  });

  it('has a worked example that is valid input and works in all four games', () => {
    const block = [...html.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => m[1]).find((b) => b.startsWith('Process by which'))!;
    const { pairs, warns } = parsePairs(block);
    expect(warns).toEqual([]);
    expect(pairs).toHaveLength(6);
    expect(pairs[4]).toMatchObject({ q: 'Plants make food using sunlight, water and ___', a: 'carbon dioxide' });
    for (const g of GAMES) expect(build(g.id, pairs, 1).ok, g.name).toBe(true);
  });

  it('rejects, with a clear message, the mistakes it warns chatbots about', () => {
    // numbering, bullets and a header line are NOT silently fixed by the site: the instructions forbid them
    expect(text).toContain('No header line, no numbering, no bullets');
    expect(parsePairs('1. Q | A').pairs[0].q).toBe('1. Q'); // so a chatbot that numbers its lines would pollute the questions
  });
});

describe('the guidance on what good data looks like', () => {
  it('has a recommended range for every game, at least as large as the game\'s minimum', () => {
    for (const g of GAMES) {
      // every table row for this game, each confined to its own <tr>
      const rows = [...html.matchAll(new RegExp(`<tr><td>${g.name}</td>((?:(?!</tr>)[\\s\\S])*)</tr>`, 'g'))].map((m) => m[1]);
      expect(rows, `rows for ${g.name}`).toHaveLength(2); // the rules table and the "what good looks like" table
      const rec = rows.map((r) => r.match(/<td>(\d+) to (\d+)[^<]*<\/td>$/)).find(Boolean);
      expect(rec, `recommendation for ${g.name}`).toBeTruthy();
      const [lo, hi] = [Number(rec![1]), Number(rec![2])];
      expect(lo, g.name).toBeGreaterThanOrEqual(g.need);
      expect(hi, g.name).toBeGreaterThan(lo);
    }
  });

  it('puts the priorities up front and separates material from a bare reference', () => {
    expect(html.indexOf('<strong>Priorities.</strong>')).toBeGreaterThan(html.indexOf('id="what-you-must-do"'));
    expect(html.indexOf('<strong>Priorities.</strong>')).toBeLessThan(html.indexOf('<h4>Step 1:'));
    expect(text).toContain('Case A: the user gave study material');
    expect(text).toContain('Case B: the user gave only a reference');
    expect(text).toContain('follow it exactly'); // a named board, textbook or syllabus
    expect(text).toContain('state it in your reply'); // never ask which curriculum: decide and say so
    expect(text).toContain('which curriculum you assumed');
  });

  it('keeps "ask no other question" and the first question consistent with accepting a bare reference', () => {
    expect(text).toContain('or tell me the subject, class and chapter');
    expect(text).toContain('do not ask which curriculum, chapter or game they mean');
  });

  it("the 'bad' word-search example really is unusable in a word search", () => {
    const bad = parsePairs("What is Avogadro's constant? | 6.022 x 10^23 per mole").pairs[0];
    expect(GAMES.find((g) => g.id === 'wordSearch')!.fits(bad)).toBe(false);
    expect(GAMES.find((g) => g.id === 'matching')!.fits(bad)).toBe(true); // valid data, poor word-search material
  });

  it('has a second worked example (a bare reference, one game) that is exactly the data a word search wants', () => {
    const block = [...html.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => m[1]).find((b) => b.startsWith('Scientist who proposed the atomic theory'))!;
    const { pairs, warns } = parsePairs(block);
    expect(warns).toEqual([]);
    expect(pairs.length).toBeGreaterThanOrEqual(10);
    expect(pairs.length).toBeLessThanOrEqual(20);
    const ws = GAMES.find((g) => g.id === 'wordSearch')!;
    for (const p of pairs) {
      expect(ws.fits(p), p.a).toBe(true);
      expect(p.clean.length, p.a).toBeGreaterThanOrEqual(3); // "distinctive single words of 3 to 12 letters"
      expect(p.clean.length, p.a).toBeLessThanOrEqual(12);
      expect(p.a, p.a).toMatch(/^[A-Za-z]+$/); // single word, no digits or punctuation
    }
    const b = build('wordSearch', pairs, 1);
    if (!b.ok || b.game !== 'wordSearch') throw new Error('word search should build');
    expect(b.words).toHaveLength(pairs.length); // every word placed
    expect(new Set(pairs.map((p) => p.clean)).size).toBe(pairs.length); // all different
  });
});

describe('the sample', () => {
  it('builds all four games', () => {
    const { pairs, warns } = parsePairs(SAMPLE);
    expect(warns).toEqual([]);
    expect(pairs).toHaveLength(8);
    for (const g of GAMES) expect(build(g.id, pairs, 1).ok, g.name).toBe(true);
  });
});
