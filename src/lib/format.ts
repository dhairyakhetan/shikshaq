/**
 * Turns questions and answers pasted in almost any shape into flat rows for a database:
 * one row per question, tagged with board, class, subject, chapter and topic.
 *
 * Accepted shapes, mixed freely: "Question | Answer" lines (an optional third part is the difficulty),
 * tab-separated cells copied from a spreadsheet, Markdown tables, CSV with a header row,
 * numbered or bulleted lists, "Q: ... Ans: ...", a question line followed by an answer line,
 * and "question? answer", "question = answer" or "question - answer".
 * Lines such as "Chapter 1: Acids" or "Topic 2: Indicators" set the details for the questions below them.
 *
 * The wording is never changed. Only numbering, labels, bullets, Markdown markers and extra spaces are removed.
 * Every line that can't be used is reported with its line number.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
export const MAX_QUESTION = 300;
export const MAX_ANSWER = 100;

/** The columns of a row, in order. These are the column names of the CSV and the keys of the JSON. */
export const COLUMNS = ['board', 'class', 'subject', 'chapter_no', 'chapter', 'topic_no', 'topic', 'question_no', 'question', 'answer', 'difficulty'] as const;

export interface Details { board: string; class: string; subject: string; chapter: string }

export interface Row {
  board: string;
  class: string;
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

export interface Issue { line: number; text: string }
export interface Formatted { rows: Row[]; issues: Issue[] }

interface Context {
  board: string; class: string; subject: string;
  chapter_no: number | null; chapter: string;
  topic_no: number | null; topic: string;
  difficulty: Difficulty | null;
}

type Field = keyof Context | 'question' | 'answer' | 'skip';

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
};
const headerField = (cell: string): Field | undefined => HEADERS[tidy(cell).toLowerCase().replace(/[_.\s]+/g, ' ').trim()];

/** Collapses spaces and removes Markdown wrappers and quotes around the whole text. Never touches the words. */
export function tidy(s: string): string {
  let t = s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  for (;;) {
    const m = t.match(/^(__|`|"|“)(.+)(__|`|"|”)$/);
    if (!m || (m[1] === '“' ? '”' : m[1]) !== m[3]) return t;
    t = m[2].trim();
  }
}

const BULLET = /^[-*•▪◦·]\s+/;
const NUMBER = /^(?:\(\d{1,3}\)|\[\d{1,3}\]|\d{1,3}[.):\]]|\d{1,3}\s+[-–])\s+/;
const QPREFIX = /^q(?:ues(?:tion)?)?\s*(?:\.?\s*\d{1,3}\s*[.):\-–]?|[.):\-–])\s*/i;
const APREFIX = /^(?:ans(?:wer)?\s*(?:\.?\s*\d{1,3}\s*[.):\-–]?|[.):\-–])\s*|a\s*[.):\-–]\s+)/i;
const INLINE_ANS = /^(.*?\S)\s+(?:ans(?:wer)?\s*(?:[.):\-–—]\s*)|→|->|=>)\s*(.+)$/i;
const META = /^(board|class|grade|std|standard|subject|chapter|ch|lesson|topic|sub-?topic|section|difficulty|level)\b\.?\s*(.*)$/i;

type Meta =
  | { kind: 'chapter' | 'topic'; no: number | null; name: string }
  | { kind: 'board' | 'class' | 'subject'; value: string }
  | { kind: 'difficulty'; value: string };

const lastInt = (s: string) => Number(s.split('.').pop());

/** "10", "10th", "Class 10" → "10". Roman numerals and other values are kept as written. */
export function normClass(s: string): string {
  return tidy(s).replace(/^(?:class|grade|std\.?|standard)\s*[:\-–]?\s*/i, '').replace(/^(\d+)(?:st|nd|rd|th)$/i, '$1');
}

/** "Chapter 10: Light", "10. Light", "Light" or "10" → number and name. */
export function parseChapter(s: string): { no: number | null; name: string } {
  const t = tidy(s).replace(/^(?:chapter|ch|lesson)\b\.?\s*/i, '');
  const m = t.match(/^(\d+(?:\.\d+)*)(?:\s*[:\-–—.)]\s*|\s+|$)(.*)$/);
  return m ? { no: lastInt(m[1]), name: tidy(m[2]) } : { no: null, name: t };
}

function readMeta(s: string): Meta | null {
  const m = s.match(META);
  if (!m) return null;
  const key = m[1].toLowerCase();
  const rest = m[2];
  if (['chapter', 'ch', 'lesson', 'topic', 'subtopic', 'sub-topic', 'section'].includes(key)) {
    const r = rest.match(/^(\d+(?:\.\d+)*)?\s*([:\-–—.)]\s*)?(.*)$/)!;
    if (!r[1] && !r[2]) return null; // "Section of a cell ..." is a sentence, not a heading
    const name = tidy(r[3]);
    if (!name && !r[1]) return null;
    return { kind: ['chapter', 'ch', 'lesson'].includes(key) ? 'chapter' : 'topic', no: r[1] ? lastInt(r[1]) : null, name };
  }
  if (['class', 'grade', 'std', 'standard'].includes(key)) {
    const r = rest.match(/^([:\-–—]\s*)?(.+)$/);
    if (!r) return null;
    if (!r[1] && !/^[\divxlc]+(?:st|nd|rd|th)?$/i.test(r[2].trim())) return null; // "Class 10" yes, "Class of compounds" no
    return { kind: 'class', value: normClass(r[2]) };
  }
  const r = rest.match(/^[:\-–—]\s*(.+)$/);
  if (!r) return null;
  if (key === 'difficulty' || key === 'level') return { kind: 'difficulty', value: r[1] };
  return { kind: key as 'board' | 'subject', value: tidy(r[1]) };
}

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

export function format(raw: string, details: Details): Formatted {
  const rows: Row[] = [];
  const issues: Issue[] = [];
  const base = parseChapter(details.chapter);
  const ctx: Context = {
    board: tidy(details.board), class: normClass(details.class), subject: tidy(details.subject),
    chapter_no: base.no, chapter: base.name, topic_no: null, topic: '', difficulty: null,
  };
  const topicNos = new Map<string, number>();
  const topicMax = new Map<string, number>();
  const counts = new Map<string, number>();
  const seen = new Map<string, number>();
  const headers: Record<string, Field[]> = {};
  let pending: { q: string; line: number } | null = null;

  const issue = (line: number, text: string) => { issues.push({ line, text }); };
  const dropPending = () => {
    if (pending) issue(pending.line, 'This question has no answer.');
    pending = null;
  };

  const add = (line: number, q0: string, a0: string, over: Partial<Context> = {}) => {
    const q = tidy(q0);
    const a = tidy(a0);
    if (!q || !a) return issue(line, `The ${q ? 'answer' : 'question'} is empty.`);
    if (q.length > MAX_QUESTION) return issue(line, `The question is longer than ${MAX_QUESTION} characters.`);
    if (a.length > MAX_ANSWER) return issue(line, `The answer is longer than ${MAX_ANSWER} characters. Puzzles need short answers.`);
    const c = { ...ctx, ...over };
    const chapterKey = [c.board, c.class, c.subject, c.chapter_no, c.chapter].join('\u0000').toLowerCase();
    const dupKey = `${chapterKey}\u0001${q.toLowerCase()}`;
    const earlier = seen.get(dupKey);
    if (earlier) return issue(line, `Same question as line ${earlier}, skipped.`);
    seen.set(dupKey, line);

    let topicNo = c.topic_no;
    const topicKey = `${chapterKey}\u0001${c.topic ? c.topic.toLowerCase() : `#${topicNo ?? ''}`}`;
    if (c.topic || topicNo !== null) {
      topicNo ??= topicNos.get(topicKey) ?? (topicMax.get(chapterKey) ?? 0) + 1;
      topicNos.set(topicKey, topicNo);
      topicMax.set(chapterKey, Math.max(topicMax.get(chapterKey) ?? 0, topicNo));
    }
    const n = (counts.get(topicKey) ?? 0) + 1;
    counts.set(topicKey, n);
    rows.push({
      board: c.board, class: c.class, subject: c.subject, chapter_no: c.chapter_no, chapter: c.chapter,
      topic_no: topicNo, topic: c.topic, question_no: n, question: q, answer: a, difficulty: c.difficulty, line,
    });
  };

  const fromCells = (line: number, cells: string[], fields: Field[]) => {
    const extra = cells.slice(fields.length).filter((c) => c.trim());
    if (extra.length) return issue(line, 'This line has more parts than expected. Add a header row such as "Topic | Question | Answer".');
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
        if (d === undefined) issue(line, `"${tidy(v)}" is not easy, medium or hard, so no difficulty was set.`);
        else over.difficulty = d;
      } else if (f === 'chapter') {
        const ch = parseChapter(v);
        over.chapter = ch.name;
        if (ch.no !== null) over.chapter_no = ch.no;
      } else if (f === 'chapter_no' || f === 'topic_no') {
        const no = parseInt(v, 10);
        if (Number.isFinite(no)) over[f] = no;
      } else if (f === 'class') over.class = normClass(v);
      else over[f] = tidy(v);
    });
    if ('chapter' in over && !('topic' in over)) { over.topic = ''; over.topic_no = null; }
    if ('topic' in over && !('topic_no' in over)) over.topic_no = null;
    add(line, q, a, over);
  };

  raw.split(/\r?\n/).forEach((text, i) => {
    const line = i + 1;
    const t = text.trim();
    if (!t || /^(```|~~~)/.test(t) || (/^[\s|:\-–—=*_]+$/.test(t) && /[-–—=]/.test(t))) return; // blank, code fence, divider

    const delim = t.includes('\t') ? '\t' : t.includes('|') ? '|' : t.includes(',') && headers[','] ? ',' : '';

    // details: "Chapter 1: Acids", "## Topic 2 - Indicators", "**Class:** 10"
    if (!delim || delim === ',') {
      const heading = /^#{1,6}\s/.test(t);
      const plain = tidy(t.replace(/^#{1,6}\s*/, '').replace(BULLET, ''));
      const meta = readMeta(plain);
      if (meta) {
        dropPending();
        if ('name' in meta) {
          if (meta.kind === 'chapter') Object.assign(ctx, { chapter_no: meta.no, chapter: meta.name, topic_no: null, topic: '' });
          else Object.assign(ctx, { topic_no: meta.no, topic: meta.name });
        } else if (meta.kind === 'difficulty') {
          const d = toDifficulty(meta.value);
          if (d === undefined) issue(line, `"${tidy(meta.value)}" is not easy, medium or hard.`);
          else ctx.difficulty = d;
        } else ctx[meta.kind] = meta.value;
        return;
      }
      if (heading) {
        dropPending();
        return issue(line, 'Heading ignored. Write it as "Topic: name" or "Chapter: name" to use it.');
      }
    }

    // a header row such as "Topic | Question | Answer", or "question,answer" for CSV
    const csvHeader = !delim && t.includes(',');
    const hDelim = delim || (csvHeader ? ',' : '');
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
      let fields = headers[delim] ?? DEFAULT_FIELDS;
      // an unlabelled numbering column copied from a spreadsheet: "1 <tab> question <tab> answer"
      if (!headers[delim] && cells.length >= 3 && /^\s*\d{1,4}[.)]?\s*$/.test(cells[0])) cells = cells.slice(1);
      if (!headers[delim] && cells.length >= 2) cells = [stripLead(cells[0]).body, ...cells.slice(1)];
      if (cells.length < 2) return issue(line, 'Couldn\'t find a question and an answer. Put " | " between them.');
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
      return issue(line, 'This answer has no question above it.');
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
    issue(line, 'Couldn\'t find a question and an answer. Put " | " between them.');
  });
  dropPending();

  issues.sort((x, y) => x.line - y.line);
  return { rows, issues };
}

/** Questions missing a detail the question bank needs, e.g. { topic: 3 }. */
export function missing(rows: Row[]): { class: number; subject: number; chapter: number; topic: number } {
  return {
    class: rows.filter((r) => !r.class).length,
    subject: rows.filter((r) => !r.subject).length,
    chapter: rows.filter((r) => !r.chapter && r.chapter_no === null).length,
    topic: rows.filter((r) => !r.topic && r.topic_no === null).length,
  };
}
