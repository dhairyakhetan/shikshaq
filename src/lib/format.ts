/**
 * Turns questions and answers pasted in almost any shape into flat rows for a database:
 * one row per question, tagged with board, class, subject, chapter and topic, and linked to its chapter and topic by ID.
 *
 * Accepted shapes, mixed freely: "Question | Answer" lines (an optional third part is the difficulty),
 * tab-separated cells copied from a spreadsheet, Markdown tables, CSV with a header row,
 * numbered or bulleted lists, "Q: ... Ans: ...", a question line followed by an answer line,
 * and "question? answer", "question = answer" or "question - answer".
 * Lines such as "Chapter 1: Acids" or "Topic 2: Indicators" set the details for the questions below them.
 *
 * Questions and answers are never reworded: only numbering, labels, bullets, Markdown markers and extra spaces go.
 * Names of boards, subjects, chapters and topics are written the standard way (CBSE, Chemistry, "Acids, Bases and Salts").
 * Every problem is reported with its line number: an error means the line was left out, a warning means "check this".
 */
import {
  boardClassProblem, chapterId, checkBoard, checkClass, checkNumbered, checkSubject, parseNumbered, plainLine, readMeta, topicId,
  type Level, type MetaKey,
} from './details';
import { tidy, titleCase } from './text';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
export const MAX_QUESTION = 300;
export const MAX_ANSWER = 100;

/** The columns of a row, in order. These are the column names of the CSV and the keys of the JSON. */
export const COLUMNS = ['chapter_id', 'topic_id', 'board', 'class', 'subject', 'chapter_no', 'chapter', 'topic_no', 'topic', 'question_no', 'question', 'answer', 'difficulty'] as const;

export interface Row {
  /** Board code + class + subject code + chapter number, such as CBSE10SCI01. Null until all four are known. */
  chapter_id: string | null;
  /** Chapter ID + "T" + topic number, such as CBSE10SCI01T02. */
  topic_id: string | null;
  board: string;
  class: number | null;
  subject: string;
  chapter_no: number | null;
  chapter: string;
  topic_no: number | null;
  topic: string;
  /** Position of the question within its topic (within its chapter when there is no topic), from 1. */
  question_no: number;
  question: string;
  answer: string;
  difficulty: Difficulty | null;
  /** The line of the pasted text the question came from. Not exported. */
  line: number;
}

export interface Issue { line: number; level: Level; text: string }
export interface Formatted { rows: Row[]; issues: Issue[] }

interface Context {
  board: string; boardCode: string | null;
  class: number | null;
  subject: string; subjectCode: string | null;
  chapter_no: number | null; chapter: string;
  topic_no: number | null; topic: string;
  difficulty: Difficulty | null;
  /** Lines that set the board, chapter and topic, for pointing at them in warnings. */
  boardLine: number; chapterLine: number; topicLine: number;
}

type Field = 'board' | 'class' | 'subject' | 'chapter' | 'chapter_no' | 'topic' | 'topic_no' | 'difficulty' | 'question' | 'answer' | 'skip';

const DIFF: Record<string, Difficulty> = {
  easy: 'easy', e: 'easy', '1': 'easy', low: 'easy', simple: 'easy', basic: 'easy',
  medium: 'medium', med: 'medium', m: 'medium', '2': 'medium', moderate: 'medium', average: 'medium', intermediate: 'medium',
  hard: 'hard', h: 'hard', '3': 'hard', high: 'hard', difficult: 'hard', tough: 'hard', advanced: 'hard',
};

/** '' → null, a known word → the difficulty, anything else → undefined. */
export function toDifficulty(s: string): Difficulty | null | undefined {
  const t = tidy(s).toLowerCase();
  return t ? DIFF[t] : null;
}

const HEADERS: Record<string, Field> = {
  question: 'question', questions: 'question', q: 'question', prompt: 'question', clue: 'question',
  answer: 'answer', answers: 'answer', a: 'answer', ans: 'answer',
  board: 'board', class: 'class', grade: 'class', std: 'class', standard: 'class', cls: 'class',
  subject: 'subject', chapter: 'chapter', 'chapter name': 'chapter', lesson: 'chapter',
  'chapter no': 'chapter_no', 'chapter number': 'chapter_no', 'ch no': 'chapter_no',
  topic: 'topic', 'topic name': 'topic', 'topic no': 'topic_no', 'topic number': 'topic_no',
  difficulty: 'difficulty', level: 'difficulty',
  '#': 'skip', no: 'skip', 'sl no': 'skip', 's no': 'skip', sr: 'skip', 'sr no': 'skip', 'question no': 'skip', 'q no': 'skip',
  'chapter id': 'skip', 'topic id': 'skip', id: 'skip',
};
const headerField = (cell: string): Field | undefined => HEADERS[tidy(cell).toLowerCase().replace(/[_.\s]+/g, ' ').trim()];

const BULLET = /^[-*•▪◦·]\s+/;
const NUMBER = /^(?:\(\d{1,3}\)|\[\d{1,3}\]|\d{1,3}[.):\]]|\d{1,3}\s+[-–])\s+/;
const QPREFIX = /^q(?:ues(?:tion)?)?\s*(?:\.?\s*\d{1,3}\s*[.):\-–]?|[.):\-–])\s*/i;
const APREFIX = /^(?:ans(?:wer)?\s*(?:\.?\s*\d{1,3}\s*[.):\-–]?|[.):\-–])\s*|a\s*[.):\-–]\s+)/i;
const INLINE_ANS = /^(.*?\S)\s+(?:ans(?:wer)?\s*(?:[.):\-–—]\s*)|→|->|=>)\s*(.+)$/i;
const NAMES: Record<MetaKey, string> = { board: 'Board', class: 'Class', subject: 'Subject', chapter: 'Chapter', topic: 'Topic', difficulty: 'Difficulty' };

/** Removes bullets, numbering and a "Q." label. */
function stripLead(s: string): { body: string; hadQ: boolean } {
  let t = s.replace(BULLET, '').replace(NUMBER, '').trim() || s.trim();
  const rest = t.replace(QPREFIX, '').trim();
  const hadQ = rest !== t && rest !== '';
  if (hadQ) t = rest;
  return { body: t, hadQ };
}

const stripAnswerLabel = (s: string) => s.replace(/^[-–—:=]\s*/, '').replace(APREFIX, '');

/** A question and an answer from one free-form line, or null. A line ending in "?" is a question on its own. */
function splitLoose(t: string): [string, string] | null {
  let m = t.match(INLINE_ANS);
  if (m) return [m[1], m[2]];
  m = t.match(/^(.*\?)\s*(.*)$/);
  if (m) {
    const a = stripAnswerLabel(m[2]).trim();
    return a ? [m[1], a] : null;
  }
  for (const sep of [' → ', ' -> ', ' => ', ' = ']) {
    const i = t.indexOf(sep);
    if (i > 0) return [t.slice(0, i), t.slice(i + sep.length)];
  }
  m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/) ?? t.match(/^(.+?):\s+(.+)$/);
  return m ? [m[1], stripAnswerLabel(m[2])] : null;
}

function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = false;
    } else if (ch === '"' && !cur.trim()) { quoted = true; cur = ''; }
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function cellsOf(line: string, delim: string): string[] {
  if (delim === ',') return csvCells(line);
  if (delim === '|') return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
  return line.split('\t');
}

const DEFAULT_FIELDS: Field[] = ['question', 'answer', 'difficulty'];
export const NO_ANSWER = 'This question has no answer.';
const CANNOT_READ = 'Couldn\'t find a question and an answer. Put " | " between them.';

export function format(raw: string): Formatted {
  const rows: Row[] = [];
  const issues: Issue[] = [];
  const ctx: Context = {
    board: '', boardCode: null, class: null, subject: '', subjectCode: null,
    chapter_no: null, chapter: '', topic_no: null, topic: '', difficulty: null, boardLine: 0, chapterLine: 0, topicLine: 0,
  };
  const topicNos = new Map<string, number>(); // chapter + topic name → number, for topics written without one
  const topicMax = new Map<string, number>();
  const counts = new Map<string, number>();
  const seen = new Map<string, number>();
  const names = new Map<string, { name: string; line: number }>(); // chapter or topic ID → the name it was first given
  const once = new Set<string>();
  const headers: Record<string, Field[]> = {};
  const lastSet: Partial<Record<MetaKey, { line: number; used: boolean }>> = {};
  let pending: { q: string; line: number } | null = null;

  const issue = (line: number, level: Level, text: string) => { issues.push({ line, level, text }); };
  const warnOnce = (id: string, line: number, text: string, level: Level = 'warn') => {
    if (once.has(id)) return;
    once.add(id);
    issue(line, level, text);
  };
  const dropPending = () => {
    if (pending) issue(pending.line, 'error', NO_ANSWER);
    pending = null;
  };

  /**
   * Checks a board, class, subject, chapter or topic and returns what to store. A detail line reports its own problem;
   * a table column reports each distinct wrong value once (the key), not on every row.
   */
  const board = (v: string, line: number, key = String(line)) => {
    const b = checkBoard(v);
    if (b.problem) warnOnce(`board\u0000${key}`, line, b.problem.text, b.problem.level);
    return { board: b.name, boardCode: b.code };
  };
  const klass = (v: string, line: number, key = String(line)) => {
    const c = checkClass(v);
    if (c.problem) warnOnce(`class\u0000${key}`, line, c.problem.text, c.problem.level);
    return c.value;
  };
  const subject = (v: string, line: number, key = String(line)) => {
    const s = checkSubject(v);
    if (s.problem) warnOnce(`subject\u0000${key}`, line, s.problem.text, s.problem.level);
    return { subject: s.name, subjectCode: s.code };
  };
  const numbered = (kind: 'chapter' | 'topic', v: string, line: number, key = String(line)) => {
    const p = parseNumbered(v, kind);
    const problem = checkNumbered(kind, p.no, p.name);
    if (problem) warnOnce(`${kind}\u0000${key}`, line, problem.text, problem.level);
    return { no: problem?.level === 'error' && p.no !== null && (p.no < 1 || p.no > 99) ? null : p.no, name: titleCase(p.name) };
  };

  const add = (line: number, q0: string, a0: string, over: Partial<Context> = {}) => {
    const q = tidy(q0);
    const a = tidy(a0);
    if (!q || !a) return issue(line, 'error', `The ${q ? 'answer' : 'question'} is empty.`);
    if (q.length > MAX_QUESTION) return issue(line, 'error', `The question is longer than ${MAX_QUESTION} characters.`);
    if (a.length > MAX_ANSWER) return issue(line, 'error', `The answer is longer than ${MAX_ANSWER} characters. Puzzles need short answers.`);
    const c = { ...ctx, ...over };
    const cid = chapterId(c.boardCode, c.class, c.subjectCode, c.chapter_no);
    const chapterKey = cid ?? [c.board, c.class, c.subject, c.chapter_no, c.chapter].join('\u0000').toLowerCase();
    const dupKey = `${chapterKey}\u0001${q.toLowerCase()}`;
    const earlier = seen.get(dupKey);
    if (earlier) return issue(line, 'error', `Same question as line ${earlier}, skipped.`);
    seen.set(dupKey, line);
    for (const k of Object.keys(lastSet) as MetaKey[]) lastSet[k]!.used = true;

    let topicNo = c.topic_no;
    if (topicNo === null && c.topic) {
      const nameKey = `${chapterKey}\u0001${c.topic.toLowerCase()}`;
      topicNo = topicNos.get(nameKey) ?? (topicMax.get(chapterKey) ?? 0) + 1;
      topicNos.set(nameKey, topicNo);
    }
    if (topicNo !== null) topicMax.set(chapterKey, Math.max(topicMax.get(chapterKey) ?? 0, topicNo));
    const tid = topicId(cid, topicNo);

    // the same ID must not mean two different chapters or topics
    for (const [id, name, at, what] of [[cid, c.chapter, c.chapterLine || line, 'Chapter'], [tid, c.topic, c.topicLine || line, 'Topic']] as const) {
      if (!id || !name) continue;
      const first = names.get(id);
      if (!first) names.set(id, { name, line: at });
      else if (first.name.toLowerCase() !== name.toLowerCase()) {
        warnOnce(`name\u0000${id}\u0000${name}`, at, `${what} ID ${id} is already "${first.name}" (line ${first.line}). Check the ${what.toLowerCase()} number.`);
      }
    }
    const bc = boardClassProblem(c.boardCode, c.class);
    if (bc) warnOnce(`bc\u0000${c.boardCode}\u0000${c.class}`, c.boardLine || line, bc);

    const countKey = `${chapterKey}\u0001${topicNo ?? ''}`;
    const n = (counts.get(countKey) ?? 0) + 1;
    counts.set(countKey, n);
    rows.push({
      chapter_id: cid, topic_id: tid, board: c.board, class: c.class, subject: c.subject, chapter_no: c.chapter_no, chapter: c.chapter,
      topic_no: topicNo, topic: c.topic, question_no: n, question: q, answer: a, difficulty: c.difficulty, line,
    });
  };

  const fromCells = (line: number, cells: string[], fields: Field[]) => {
    const extra = cells.slice(fields.length).filter((c) => c.trim());
    if (extra.length) return issue(line, 'error', 'This line has more parts than expected. Add a header row such as "Topic | Question | Answer".');
    const over: Partial<Context> = {};
    let q = '';
    let a = '';
    fields.forEach((f, i) => {
      const v = cells[i] ?? '';
      if (!v.trim() || f === 'skip') return;
      if (f === 'question') q = v;
      else if (f === 'answer') a = v;
      else if (f === 'difficulty') {
        const d = toDifficulty(v);
        if (d === undefined) issue(line, 'warn', `"${tidy(v)}" is not easy, medium or hard, so no difficulty was set.`);
        else over.difficulty = d;
      } else if (f === 'board') Object.assign(over, board(v, line, v), { boardLine: line });
      else if (f === 'class') over.class = klass(v, line, v);
      else if (f === 'subject') Object.assign(over, subject(v, line, v));
      else if (f === 'chapter' || f === 'topic') {
        const p = numbered(f, v, line, v);
        if (f === 'chapter') { over.chapter = p.name; over.chapterLine = line; if (p.no !== null) over.chapter_no = p.no; }
        else { over.topic = p.name; over.topic_no = p.no; over.topicLine = line; }
      } else {
        const no = parseInt(v, 10);
        if (Number.isFinite(no) && no >= 1 && no <= 99) over[f] = no;
        else warnOnce(`${f}\u0000${v}`, line, `"${tidy(v)}" is not a ${f === 'chapter_no' ? 'chapter' : 'topic'} number from 1 to 99.`);
      }
    });
    if (('chapter' in over || 'chapter_no' in over) && !('topic' in over) && !('topic_no' in over)) { over.topic = ''; over.topic_no = null; }
    if ('topic' in over && !('topic_no' in over)) over.topic_no = null;
    add(line, q, a, over);
  };

  const setMeta = (key: MetaKey, value: string, line: number) => {
    const prev = lastSet[key];
    if (prev && !prev.used) {
      issue(prev.line, 'warn', key === 'topic' ? 'No questions under this topic.' : `Not used: ${NAMES[key]} is set again on line ${line} before any question.`);
    }
    if (key === 'chapter' && lastSet.topic && !lastSet.topic.used) issue(lastSet.topic.line, 'warn', 'No questions under this topic.');
    lastSet[key] = { line, used: false };
    if (key === 'chapter') delete lastSet.topic;

    if (key === 'board') Object.assign(ctx, board(value, line), { boardLine: line });
    else if (key === 'class') ctx.class = klass(value, line);
    else if (key === 'subject') Object.assign(ctx, subject(value, line));
    else if (key === 'chapter') {
      const p = numbered('chapter', value, line);
      Object.assign(ctx, { chapter_no: p.no, chapter: p.name, topic_no: null, topic: '', chapterLine: line, topicLine: 0 });
    } else if (key === 'topic') {
      const p = numbered('topic', value, line);
      Object.assign(ctx, { topic_no: p.no, topic: p.name, topicLine: line });
    } else {
      const d = toDifficulty(value);
      if (d === undefined) issue(line, 'warn', `"${tidy(value)}" is not easy, medium or hard.`);
      else ctx.difficulty = d;
    }
  };

  raw.split(/\r?\n/).forEach((text, i) => {
    const line = i + 1;
    const t = text.trim();
    if (!t || /^(```|~~~)/.test(t) || (/^[\s|:\-–—=*_]+$/.test(t) && /[-–—=]/.test(t))) return; // blank, code fence, divider

    const delim = t.includes('\t') ? '\t' : t.includes('|') ? '|' : t.includes(',') && headers[','] ? ',' : '';

    // details: "Chapter 1: Acids", "## Topic 2 - Indicators", "**Class:** 10"
    if (!delim || delim === ',') {
      const meta = readMeta(t);
      if (meta) {
        dropPending();
        return setMeta(meta.key, meta.value, line);
      }
      if (/^#{1,6}\s/.test(t)) {
        dropPending();
        return issue(line, 'warn', `Heading ignored. Write it as "Topic: ${plainLine(t)}" or "Chapter: ${plainLine(t)}" to use it.`);
      }
    }

    // a header row such as "Topic | Question | Answer", or "question,answer" for CSV
    const hDelim = delim || (t.includes(',') ? ',' : '');
    if (hDelim) {
      const cells = cellsOf(t, hDelim).map((c) => c.trim());
      const fields = cells.map(headerField);
      if (cells.length >= 2 && fields.includes('question') && fields.includes('answer') && fields.every((f, k) => f || !cells[k])) {
        dropPending();
        headers[hDelim] = fields.map((f) => f ?? 'skip');
        // a difficulty may follow the named columns even when the header doesn't name it
        if (!fields.includes('difficulty')) headers[hDelim].push('difficulty');
        return;
      }
    }

    if (delim) {
      dropPending();
      let cells = cellsOf(t, delim);
      const fields = headers[delim] ?? DEFAULT_FIELDS;
      // an unlabelled numbering column copied from a spreadsheet: "1 <tab> question <tab> answer"
      if (!headers[delim] && cells.length >= 3 && /^\s*\d{1,4}[.)]?\s*$/.test(cells[0])) cells = cells.slice(1);
      if (!headers[delim] && cells.length >= 2) cells = [stripLead(cells[0]).body, ...cells.slice(1)];
      if (cells.length < 2) return issue(line, 'error', CANNOT_READ);
      return fromCells(line, cells, fields);
    }

    const { body, hadQ } = stripLead(t);
    if (APREFIX.test(body) && !hadQ) {
      const a = body.replace(APREFIX, '');
      if (pending) {
        const p: { q: string; line: number } = pending;
        pending = null;
        return add(p.line, p.q, a);
      }
      return issue(line, 'error', 'This answer has no question above it.');
    }

    const pair = splitLoose(body);
    if (pair) {
      dropPending();
      return add(line, pair[0], pair[1]);
    }
    if (/\?\s*$/.test(body) || hadQ) {
      dropPending();
      pending = { q: body, line };
      return;
    }
    if (pending) {
      const p: { q: string; line: number } = pending;
      pending = null;
      return add(p.line, p.q, body);
    }
    issue(line, 'error', CANNOT_READ);
  });
  dropPending();

  issues.sort((x, y) => x.line - y.line);
  return { rows, issues };
}

/** Questions missing a detail the question bank needs. */
export function missing(rows: Row[]): { board: number; class: number; subject: number; chapter: number; topic: number; id: number } {
  return {
    board: rows.filter((r) => !r.board).length,
    class: rows.filter((r) => r.class === null).length,
    subject: rows.filter((r) => !r.subject).length,
    chapter: rows.filter((r) => r.chapter_no === null).length,
    topic: rows.filter((r) => !r.topic && r.topic_no === null).length,
    id: rows.filter((r) => !r.chapter_id).length,
  };
}

/**
 * The problems to show right now. People get to finish writing first: nothing is flagged on the line being typed,
 * nor "no answer" on the line just above it (its answer is probably being typed), nor on the line a detail box is
 * writing while someone types in that box. Those appear once the cursor moves on. A fix still clears at once.
 */
export function visibleIssues(issues: Issue[], quiet: { caret?: number | null; line?: number | null }): Issue[] {
  const { caret, line } = quiet;
  return issues.filter((x) => !(caret && (x.line === caret || (x.line === caret - 1 && x.text === NO_ANSWER))) && x.line !== line);
}

/** The worst problem on each line: what the editor underlines. */
export function lineLevels(issues: Issue[]): Map<number, Level> {
  const out = new Map<number, Level>();
  for (const x of issues) if (out.get(x.line) !== 'error') out.set(x.line, x.level);
  return out;
}
