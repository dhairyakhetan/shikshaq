import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAMES } from '../src/games';
import { parseCsv } from '../src/lib/csv';
import { MAX_ANSWER, MAX_QUESTION, parseQuestions } from '../src/lib/questions';
import type { GameId, QA } from '../src/types';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('src/instructions.html');
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const qa = (answer: string): QA => ({ id: 'x', question: 'q', answer, alts: [], games: null, subject: '', difficulty: '' });

describe('instructions page stays in sync with the code', () => {
  it('states the CSV header the parser reads', () => {
    expect(html).toContain('<code>Question,Answer,Type,Subject,Difficulty</code>');
  });

  it('states the length limits the parser enforces', () => {
    expect(text).toContain(`at most ${MAX_QUESTION} characters`);
    expect(text).toContain(`at most ${MAX_ANSWER}`);
    const tooLong = `Question,Answer\n${'q'.repeat(MAX_QUESTION + 1)},a\nq,${'a'.repeat(MAX_ANSWER + 1)}\n${'q'.repeat(MAX_QUESTION)},${'a'.repeat(MAX_ANSWER)}`;
    const { items, skipped } = parseQuestions(tooLong);
    expect(items).toHaveLength(1);
    expect(skipped).toHaveLength(2);
  });

  it('lists every game with its real minimum and round size', () => {
    for (const g of Object.values(GAMES)) {
      const row = html.match(new RegExp(`<tr><td>${g.id}</td>.*?<td>(\\d+)</td><td>(\\d+)</td></tr>`, 's'));
      expect(row, `table row for ${g.id}`).not.toBeNull();
      expect([Number(row![1]), Number(row![2])], g.id).toEqual([g.min, g.roundSize]);
    }
  });

  it('states the real grid length ranges', () => {
    const fits = (id: GameId, len: number) => GAMES[id].suits(qa('A'.repeat(len)));
    expect([fits('crossword', 2), fits('crossword', 3), fits('crossword', 15), fits('crossword', 16)]).toEqual([false, true, true, false]);
    expect([fits('wordSearch', 2), fits('wordSearch', 3), fits('wordSearch', 12), fits('wordSearch', 13)]).toEqual([false, true, true, false]);
    expect(text).toContain('3 to 15 characters');
    expect(text).toContain('3 to 12 characters');
  });

  it('names every Type value the parser accepts, and only those', () => {
    const allowed = Object.keys(GAMES).sort();
    const listed = [...html.matchAll(/<code>(matching|fillBlank|crossword|wordSearch)<\/code>/g)].map((m) => m[1]);
    expect([...new Set(listed)].sort()).toEqual(allowed);
    const { items } = parseQuestions(`Question,Answer,Type\nq,a,${allowed.join(';')}`);
    expect(items[0].games?.slice().sort()).toEqual(allowed);
  });

  it('uses the same labels as the interface the user will see', () => {
    const input = read('src/pages/DataInput.tsx');
    const menu = read('src/pages/Menu.tsx');
    expect(input).toContain('Step 1 · Paste your questions');
    expect(input).toContain('Load questions');
    expect(menu).toContain('Step 2 · Pick a game');
    expect(html).toContain("Under 'Step 1 · Paste your questions', paste the CSV above and press 'Load questions'");
    expect(html).toContain("Under 'Step 2 · Pick a game'");
  });

  it('has exactly one interactive-part marker, after the intro', () => {
    expect(html.split('<!--APP-->')).toHaveLength(2);
    expect(html.indexOf('<!--APP-->')).toBeGreaterThan(html.indexOf('id="what-this-site-does"'));
    expect(html.indexOf('<!--APP-->')).toBeLessThan(html.indexOf('id="what-you-must-do"'));
  });

  it("includes every step the assistant must follow", () => {
    for (let n = 1; n <= 8; n++) expect(html).toMatch(new RegExp(`<h3>Step ${n}:`));
  });
});

describe('the worked examples in the instructions are valid input', () => {
  const blocks = [...html.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => m[1]);
  const csvBlocks = blocks.filter((b) => b.startsWith('Question,Answer,Type,Subject,Difficulty\n'));

  it('parses the main example with no skipped rows', () => {
    expect(csvBlocks).toHaveLength(1);
    const { items, skipped } = parseQuestions(csvBlocks[0]);
    expect(skipped).toEqual([]);
    expect(items).toHaveLength(6);
    expect(items[3].alts).toEqual(['Chloroplasts']);
    expect(items[4].question).toBe('Plants make food using sunlight, water and ___'); // quoted comma survives
    for (const row of parseCsv(csvBlocks[0])) expect(row).toHaveLength(5);
  });

  it('parses the optional-features example (Hindi, restricted type, escaped quote)', () => {
    const extra = blocks.find((b) => b.startsWith('भारत'))!;
    const { items, skipped } = parseQuestions(extra);
    expect(skipped).toEqual([]);
    expect(items[0]).toMatchObject({ answer: 'नई दिल्ली', games: ['matching', 'fillBlank'] });
    expect(items[1]).toMatchObject({ question: 'Who wrote "Hamlet"?', answer: 'Shakespeare', alts: ['William Shakespeare'] });
  });

  it('gives the main example enough rows for all four games', () => {
    const { items } = parseQuestions(csvBlocks[0]);
    for (const g of Object.values(GAMES)) {
      const usable = items.filter((q) => g.suits(q) && (!q.games || q.games.includes(g.id)));
      expect(usable.length, g.id).toBeGreaterThanOrEqual(g.min);
    }
  });
});

describe('pasted spreadsheet data', () => {
  it('reads tab-separated cells copied from a spreadsheet', () => {
    const tsv = 'Question\tAnswer\tType\tSubject\tDifficulty\nCapital of France?\tParis\t\tGeography\tEasy\n"Large, wild cat"\tLion\t\t\t';
    const { items, skipped } = parseQuestions(tsv);
    expect(skipped).toEqual([]);
    expect(items.map((i) => [i.question, i.answer, i.subject])).toEqual([
      ['Capital of France?', 'Paris', 'Geography'],
      ['Large, wild cat', 'Lion', ''],
    ]);
  });

  it('still reads comma-separated text whose later lines contain tabs', () => {
    const { items } = parseQuestions('Question,Answer\nIt\tworks,yes');
    expect(items[0]).toMatchObject({ question: 'It\tworks', answer: 'yes' });
  });

  it('handles a BOM and Windows line endings in pasted TSV', () => {
    const { items } = parseQuestions('﻿Question\tAnswer\r\nQ1\tA1\r\nQ2\tA2\r\n');
    expect(items.map((i) => i.answer)).toEqual(['A1', 'A2']);
  });
});
