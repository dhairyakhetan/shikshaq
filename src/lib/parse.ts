import type { Pair, Parsed } from '../types';
import { gridWord } from './text';

export const MAX_QUESTION = 300;
export const MAX_ANSWER = 100;

const HEADER_Q = new Set(['question', 'questions', 'prompt', 'clue']);
const HEADER_A = new Set(['answer', 'answers']);

/**
 * Text → question/answer pairs. One pair per line, split on a tab (cells copied from a
 * spreadsheet), a vertical bar, or " = ". Markdown tables, a header row and divider lines
 * are tolerated, because chatbots like to produce them. Every line that can't be used
 * is reported with its line number instead of being dropped silently.
 */
export function parsePairs(raw: string): Parsed {
  const pairs: Pair[] = [];
  const warns: string[] = [];
  const seen = new Map<string, number>();
  let first = true;

  raw.split(/\r?\n/).forEach((line, i) => {
    const no = i + 1;
    let t = line.trim();
    if (!t || /^[\s|:\-–—]+$/.test(t)) return; // blank line or a Markdown divider such as |---|---|
    const isFirst = first;
    first = false;
    // Markdown table row such as "| Q | A |": drop the outer pipes. A lone "| A" is an empty question, not a table.
    if (/^\|.*\|/.test(t)) t = t.replace(/^\|/, '').replace(/\|\s*$/, '').trim();

    let parts: string[];
    let lossy = false;
    if (t.includes('\t')) parts = t.split('\t');
    else if (t.includes('|')) { parts = t.split('|'); lossy = true; }
    else if (t.includes(' = ')) { parts = t.split(' = '); lossy = true; }
    else {
      warns.push(`Line ${no}: put " | " between the question and the answer.`);
      return;
    }

    const q = parts[0].trim();
    const a = (parts[1] ?? '').trim();
    if (isFirst && HEADER_Q.has(q.toLowerCase()) && HEADER_A.has(a.toLowerCase())) return; // header row
    if (!q || !a) {
      warns.push(`Line ${no}: the ${q ? 'answer' : 'question'} is empty.`);
      return;
    }
    if (q.length > MAX_QUESTION) {
      warns.push(`Line ${no}: the question is longer than ${MAX_QUESTION} characters, skipped.`);
      return;
    }
    if (a.length > MAX_ANSWER) {
      warns.push(`Line ${no}: the answer is longer than ${MAX_ANSWER} characters, skipped.`);
      return;
    }
    const key = `${q.toLowerCase()}\u0000${a.toLowerCase()}`;
    const earlier = seen.get(key);
    if (earlier) {
      warns.push(`Line ${no}: same as line ${earlier}, skipped.`);
      return;
    }
    seen.set(key, no);
    if (lossy && parts.slice(2).some((p) => p.trim())) {
      warns.push(`Line ${no}: only the text before the second separator was used as the answer.`);
    }
    pairs.push({ n: pairs.length + 1, q, a, clean: gridWord(a) });
  });

  return { pairs, warns };
}
