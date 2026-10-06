import type { GameId, QA } from '../types';
import { parseCsv } from './csv';

const HEADERS: Record<string, string[]> = {
  question: ['question', 'q', 'prompt', 'clue'],
  answer: ['answer', 'a'],
  type: ['type', 'game', 'games'],
  subject: ['subject', 'topic'],
  difficulty: ['difficulty', 'level'],
};

const GAME_NAMES: Record<string, GameId> = {
  matching: 'matching',
  match: 'matching',
  fillblank: 'fillBlank',
  fill: 'fillBlank',
  fillintheblank: 'fillBlank',
  crossword: 'crossword',
  wordsearch: 'wordSearch',
};

const MAX_QUESTION = 300;
const MAX_ANSWER = 100;

export interface ParseResult {
  items: QA[];
  skipped: { row: number; reason: string }[];
}

/** Turn a "Type" cell into a game list. Blank / "all" means any game. */
function parseGames(cell: string, problems: string[]): GameId[] | null {
  const parts = cell.split(/[,;|/]/).map((p) => p.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean);
  if (!parts.length || parts.includes('all') || parts.includes('any')) return null;
  const games: GameId[] = [];
  for (const p of parts) {
    const g = GAME_NAMES[p];
    if (g) games.push(g);
    else problems.push(`unknown type "${p}"`);
  }
  return games.length ? games : null;
}

/**
 * Sheet CSV → validated questions. The first row is a header when it has
 * Question + Answer columns; otherwise columns are read in template order
 * (Question, Answer, Type, Subject, Difficulty).
 */
export function parseQuestions(csv: string): ParseResult {
  const rows = parseCsv(csv);
  const cols = { question: 0, answer: 1, type: 2, subject: 3, difficulty: 4 };
  let first = 0;

  if (rows.length) {
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const find = (k: keyof typeof HEADERS) => head.findIndex((h) => HEADERS[k].includes(h));
    const q = find('question');
    const a = find('answer');
    if (q >= 0 && a >= 0) {
      first = 1;
      Object.assign(cols, { question: q, answer: a, type: find('type'), subject: find('subject'), difficulty: find('difficulty') });
    }
  }

  const items: QA[] = [];
  const skipped: ParseResult['skipped'] = [];
  const seen = new Set<string>();
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

  rows.slice(first).forEach((r, idx) => {
    const row = idx + first + 1; // 1-based sheet row number
    const question = cell(r, cols.question);
    const [answer, ...alts] = cell(r, cols.answer).split('|').map((s) => s.trim()).filter(Boolean);

    if (!question || !answer) return void skipped.push({ row, reason: 'missing question or answer' });
    if (question.length > MAX_QUESTION) return void skipped.push({ row, reason: `question longer than ${MAX_QUESTION} characters` });
    if (answer.length > MAX_ANSWER) return void skipped.push({ row, reason: `answer longer than ${MAX_ANSWER} characters` });

    const key = `${question.toLowerCase()}\u0000${answer.toLowerCase()}`;
    if (seen.has(key)) return void skipped.push({ row, reason: 'duplicate of an earlier row' });
    seen.add(key);

    const problems: string[] = [];
    const games = parseGames(cell(r, cols.type), problems);
    if (problems.length) skipped.push({ row, reason: `${problems.join(', ')} (row kept, type ignored)` });

    items.push({
      id: `row-${row}`,
      question,
      answer,
      alts,
      games: problems.length ? null : games,
      subject: cell(r, cols.subject),
      difficulty: cell(r, cols.difficulty),
    });
  });

  return { items, skipped };
}
