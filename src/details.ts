/**
 * Board, class, subject, chapter and topic: reading them, checking them, writing them the same way every time,
 * and the chapter and topic IDs made from them.
 *
 * Chapter ID = board code + class (2 digits) + subject code (3 letters) + chapter number (2 digits): CBSE11CHE01.
 * Topic ID   = chapter ID + "T" + topic number (2 digits): CBSE11CHE01T03.
 * The same details always give the same ID, so questions can be linked to their chapter without looking anything up.
 */

// ---------------------------------------------------------------- text

/** Collapses spaces and removes Markdown bold and wrappers or quotes around the whole text. Never touches the words. */
export function tidy(s: string): string {
  let t = s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  for (;;) {
    const m = t.match(/^(__|`|"|“)(.+)(__|`|"|”)$/);
    if (!m || (m[1] === '“' ? '”' : m[1]) !== m[3]) return t;
    t = m[2].trim();
  }
}

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'per', 'than', 'the', 'to', 'via', 'vs', 'with']);
const ROMAN_WORD = /^(?:ii|iii|iv|vi|vii|viii|ix|xi|xii)$/;

/**
 * Capitalises the start of each word: "chemical reactions and equations" → "Chemical Reactions and Equations".
 * Short joining words stay lower case unless they start the name or follow ":", "–" or "(".
 * Words that already contain a capital or a digit (DNA, pH, CO2) are left as they are; Roman numerals become upper case.
 */
export function titleCase(s: string): string {
  let start = true;
  return s.replace(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’]*|[:–—(]|\s-\s/gu, (tok) => {
    if (/^(?:[:–—(]|\s-\s)$/u.test(tok)) { start = true; return tok; }
    const first = start;
    start = false;
    if (/\d/.test(tok) || tok !== tok.toLowerCase()) return tok;
    if (ROMAN_WORD.test(tok)) return tok.toUpperCase();
    if (!first && SMALL.has(tok)) return tok;
    return tok[0].toUpperCase() + tok.slice(1);
  });
}

/** Edit distance (insertions, deletions, substitutions), for "did you mean" hints. */
export function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export type Level = 'error' | 'warn';
export interface Problem { level: Level; text: string }

export const MAX_NO = 99;
export const MAX_NAME = 120;

// ---------------------------------------------------------------- boards

export const BOARDS: { name: string; code: string; also: string[] }[] = [
  { name: 'CBSE', code: 'CBSE', also: ['central board of secondary education', 'ncert'] },
  { name: 'ICSE', code: 'ICSE', also: ['cisce'] },
  { name: 'ISC', code: 'ISC', also: [] },
  { name: 'IB', code: 'IB', also: ['international baccalaureate'] },
  { name: 'IGCSE', code: 'IGCSE', also: ['cambridge igcse'] },
  { name: 'Cambridge', code: 'CAIE', also: ['caie', 'cie', 'cambridge international', 'a level', 'a levels'] },
  { name: 'NIOS', code: 'NIOS', also: ['national institute of open schooling'] },
];

/** State boards: the state's name and its two-letter code, plus the board's own short names. */
export const STATES: { name: string; code: string; also: string[] }[] = [
  { name: 'Andhra Pradesh', code: 'AP', also: ['bseap', 'bieap'] },
  { name: 'Arunachal Pradesh', code: 'AR', also: [] },
  { name: 'Assam', code: 'AS', also: ['seba', 'ahsec'] },
  { name: 'Bihar', code: 'BR', also: ['bseb'] },
  { name: 'Chhattisgarh', code: 'CG', also: ['cgbse'] },
  { name: 'Delhi', code: 'DL', also: [] },
  { name: 'Goa', code: 'GA', also: ['gbshse'] },
  { name: 'Gujarat', code: 'GJ', also: ['gseb'] },
  { name: 'Haryana', code: 'HR', also: ['hbse', 'bseh'] },
  { name: 'Himachal Pradesh', code: 'HP', also: ['hpbose'] },
  { name: 'Jammu and Kashmir', code: 'JK', also: ['jkbose', 'j and k'] },
  { name: 'Jharkhand', code: 'JH', also: ['jac'] },
  { name: 'Karnataka', code: 'KA', also: ['kseeb', 'kseab'] },
  { name: 'Kerala', code: 'KL', also: ['kbpe', 'dhse'] },
  { name: 'Madhya Pradesh', code: 'MP', also: ['mpbse'] },
  { name: 'Maharashtra', code: 'MH', also: ['msbshse'] },
  { name: 'Manipur', code: 'MN', also: ['bosem', 'cohsem'] },
  { name: 'Meghalaya', code: 'ML', also: ['mbose'] },
  { name: 'Mizoram', code: 'MZ', also: ['mbse'] },
  { name: 'Nagaland', code: 'NL', also: ['nbse'] },
  { name: 'Odisha', code: 'OD', also: ['orissa', 'chse'] },
  { name: 'Punjab', code: 'PB', also: ['pseb'] },
  { name: 'Rajasthan', code: 'RJ', also: ['rbse', 'bser'] },
  { name: 'Sikkim', code: 'SK', also: [] },
  { name: 'Tamil Nadu', code: 'TN', also: ['tnbse', 'samacheer', 'samacheer kalvi'] },
  { name: 'Telangana', code: 'TS', also: ['bsets', 'tsbie'] },
  { name: 'Tripura', code: 'TR', also: ['tbse'] },
  { name: 'Uttar Pradesh', code: 'UP', also: ['upmsp', 'up'] },
  { name: 'Uttarakhand', code: 'UK', also: ['ubse'] },
  { name: 'West Bengal', code: 'WB', also: ['wbbse', 'wbchse'] },
];

const key = (s: string) => tidy(s).toLowerCase().replace(/&/g, ' and ').replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
const words = (s: string) => new RegExp(`(^|[^a-z])${s.replace(/[&]/g, '\\$&')}($|[^a-z])`);
const STATE_ALIASES = STATES.flatMap((s) => [key(s.name), ...s.also].map((a) => ({ a, s })));
const BOARD_LIST = 'CBSE, ICSE, ISC, IB, IGCSE, Cambridge, NIOS or a state board such as Maharashtra';

/** Letters for a made-up code: one word → its first letters, several → their initials. */
function madeCode(name: string, len: number): string | null {
  const ws = name.normalize('NFKD').replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter((w) => w && !['and', 'of', 'the', 'board'].includes(w.toLowerCase()));
  if (!ws.length) return null;
  // a board (5 letters) uses initials for a long name; a subject (3 letters) mixes the first word with the next initial
  const code = ws.length === 1 ? ws[0].slice(0, len) : len > 3 || ws.length > 2 ? ws.slice(0, len).map((w) => w[0]).join('') : ws[0].slice(0, len - 1) + ws[1][0];
  return code.toUpperCase().padEnd(len === 3 ? 3 : 2, 'X');
}

export function checkBoard(raw: string): { name: string; code: string | null; problem?: Problem } {
  const k = key(raw);
  if (!k) return { name: '', code: null };
  const kk = k.replace(/\bboard\b/g, ' ').replace(/\s+/g, ' ').trim();
  const known = BOARDS.find((b) => [k, kk].some((x) => x === key(b.name) || b.also.includes(x)));
  if (known) return { name: known.name, code: known.code };
  const state = STATE_ALIASES.find(({ a }) => words(a).test(k))?.s;
  if (state) return { name: `${state.name} State Board`, code: state.code };
  if (/^(state|state board|board)$/.test(k)) return { name: tidy(raw), code: null, problem: { level: 'warn', text: 'Which state? For example: Maharashtra State Board.' } };
  const near = BOARDS.find((b) => distance(k, key(b.name)) === 1 && k.length >= 3);
  const name = /^[a-z]{2,6}$/.test(k) ? k.toUpperCase() : titleCase(tidy(raw));
  const code = madeCode(name, 5);
  if (!code) return { name, code, problem: { level: 'warn', text: 'Write the board in English letters, so it can go in the chapter ID.' } };
  return { name, code, problem: { level: 'warn', text: near ? `Did you mean ${near.name}?` : `Not a board this site knows (${BOARD_LIST}). Its code ${code} was made from the name.` } };
}

// ---------------------------------------------------------------- class

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

/** "10", "10th", "Class 10", "X", "Std. 8", "Grade 7" → the text after the label, with "th" dropped from a number. */
function normClass(s: string): string {
  return tidy(s).replace(/^(?:class|grade|std\.?|standard)\s*[:\-–]?\s*/i, '').replace(/^(\d+)\s*(?:st|nd|rd|th)$/i, '$1');
}

export function checkClass(raw: string): { value: number | null; problem?: Problem } {
  const t = normClass(raw).toLowerCase();
  if (!t) return { value: null };
  const n = /^\d+$/.test(t) ? Number(t) : ROMAN[t];
  if (n === undefined) return { value: null, problem: { level: 'error', text: 'Class must be a number from 1 to 12, like 10 or X.' } };
  if (n < 1 || n > 12) return { value: null, problem: { level: 'error', text: 'Class must be from 1 to 12.' } };
  return { value: n };
}

// ---------------------------------------------------------------- subjects

export const SUBJECTS: { name: string; code: string; also: string[] }[] = [
  { name: 'Physics', code: 'PHY', also: ['phy', 'phys'] },
  { name: 'Chemistry', code: 'CHE', also: ['chem'] },
  { name: 'Biology', code: 'BIO', also: ['bio'] },
  { name: 'Mathematics', code: 'MAT', also: ['maths', 'math'] },
  { name: 'Science', code: 'SCI', also: ['general science', 'sci'] },
  { name: 'Social Science', code: 'SST', also: ['sst', 'social studies', 'social'] },
  { name: 'English', code: 'ENG', also: ['eng'] },
  { name: 'English Language', code: 'ENL', also: [] },
  { name: 'English Literature', code: 'ELT', also: ['literature in english'] },
  { name: 'Hindi', code: 'HIN', also: [] },
  { name: 'Sanskrit', code: 'SAN', also: [] },
  { name: 'History', code: 'HIS', also: ['hist'] },
  { name: 'Geography', code: 'GEO', also: ['geo'] },
  { name: 'Civics', code: 'CIV', also: [] },
  { name: 'History and Civics', code: 'HCV', also: [] },
  { name: 'Political Science', code: 'POL', also: ['pol sci', 'polity'] },
  { name: 'Economics', code: 'ECO', also: ['eco'] },
  { name: 'Computer Science', code: 'CSC', also: ['cs', 'comp sci', 'computer'] },
  { name: 'Computer Applications', code: 'CAP', also: [] },
  { name: 'Informatics Practices', code: 'INP', also: ['ip'] },
  { name: 'Accountancy', code: 'ACC', also: ['accounts', 'accounting'] },
  { name: 'Business Studies', code: 'BST', also: ['bst'] },
  { name: 'Commercial Studies', code: 'COM', also: [] },
  { name: 'Environmental Studies', code: 'EVS', also: ['evs'] },
  { name: 'Environmental Science', code: 'ENV', also: [] },
  { name: 'Statistics', code: 'STA', also: [] },
  { name: 'Psychology', code: 'PSY', also: [] },
  { name: 'Sociology', code: 'SOC', also: [] },
  { name: 'Physical Education', code: 'PED', also: ['pe'] },
  { name: 'Biotechnology', code: 'BTE', also: [] },
  { name: 'Home Science', code: 'HSC', also: [] },
  { name: 'Legal Studies', code: 'LGS', also: [] },
  { name: 'General Knowledge', code: 'GKN', also: ['gk'] },
  { name: 'French', code: 'FRE', also: [] },
  { name: 'German', code: 'GER', also: [] },
  { name: 'Marathi', code: 'MAR', also: [] },
  { name: 'Bengali', code: 'BEN', also: [] },
  { name: 'Tamil', code: 'TAM', also: [] },
  { name: 'Telugu', code: 'TEL', also: [] },
  { name: 'Kannada', code: 'KAN', also: [] },
  { name: 'Malayalam', code: 'MAL', also: [] },
  { name: 'Gujarati', code: 'GUJ', also: [] },
  { name: 'Punjabi', code: 'PUN', also: [] },
  { name: 'Urdu', code: 'URD', also: [] },
];
const KNOWN_CODES = new Set(SUBJECTS.map((s) => s.code));

export function checkSubject(raw: string): { name: string; code: string | null; problem?: Problem } {
  const k = key(raw);
  if (!k) return { name: '', code: null };
  const known = SUBJECTS.find((s) => k === key(s.name) || s.also.includes(k));
  if (known) return { name: known.name, code: known.code };
  const name = titleCase(tidy(raw));
  if (name.length > 60) return { name, code: null, problem: { level: 'error', text: 'Subject is longer than 60 characters.' } };
  const near = k.length >= 4 && SUBJECTS.find((s) => [key(s.name), ...s.also].some((n) => n.length >= 4 && distance(k, n) <= (n.length >= 8 ? 2 : 1)));
  if (near) return { name, code: madeCode(name, 3), problem: { level: 'warn', text: `Did you mean ${near.name}?` } };
  let code = madeCode(name, 3);
  if (!code) return { name, code, problem: { level: 'warn', text: 'Write the subject in English letters, so it can go in the chapter ID.' } };
  if (KNOWN_CODES.has(code)) code = code.slice(0, 2) + 'X';
  return { name, code, problem: { level: 'warn', text: `Not a subject this site knows, so its code ${code} was made from the name. Use the same spelling every time.` } };
}

// ---------------------------------------------------------------- chapter and topic

/** "10: Light", "Chapter 10 - Light", "10. Light", "Light" or "10" → number and name. For a topic "10.2" means topic 2. */
export function parseNumbered(s: string, kind: 'chapter' | 'topic'): { no: number | null; name: string } {
  const t = tidy(s).replace(kind === 'chapter' ? /^(?:chapter|ch|lesson)\b\.?\s*/i : /^(?:topic|sub-?topic|section)\b\.?\s*/i, '');
  const m = t.match(/^(\d+(?:\.\d+)*)(?:\s*[:\-–—.)]\s*|\s+|$)(.*)$/);
  if (!m) return { no: null, name: t.replace(/^[:\-–—.)]\s*/, '') };
  const parts = m[1].split('.').map(Number);
  return { no: kind === 'chapter' ? parts[0] : parts[parts.length - 1], name: tidy(m[2]) };
}

/** A chapter or topic: its number (null when missing or out of range), its name capitalised, and any problem. */
export function checkNumbered(value: string, kind: 'chapter' | 'topic'): { no: number | null; name: string; problem?: Problem } {
  const { no, name } = parseNumbered(value, kind);
  const Kind = kind === 'chapter' ? 'Chapter' : 'Topic';
  const inRange = no !== null && no >= 1 && no <= MAX_NO;
  const problem: Problem | undefined = no !== null && !inRange ? { level: 'error', text: `${Kind} number must be from 1 to ${MAX_NO}.` }
    : name.length > MAX_NAME ? { level: 'error', text: `${Kind} name is longer than ${MAX_NAME} characters.` }
    : kind === 'chapter' && no === null ? { level: 'warn', text: 'Add the chapter number, for example "3: Acids". It is part of the chapter ID.' }
    : !name ? { level: 'warn', text: `Add the ${kind} name.` }
    : undefined;
  return { no: inRange ? no : null, name: titleCase(name), problem };
}

// ---------------------------------------------------------------- IDs

export function chapterId(boardCode: string | null, cls: number | null, subjectCode: string | null, chapterNo: number | null): string | null {
  return boardCode && cls && subjectCode && chapterNo ? `${boardCode}${pad2(cls)}${subjectCode}${pad2(chapterNo)}` : null;
}

export const topicId = (chapter: string | null, topicNo: number | null) => (chapter && topicNo ? `${chapter}T${pad2(topicNo)}` : null);

/** Board mismatches worth a warning, such as ICSE in class 11 (that is ISC). */
export function boardClassProblem(boardCode: string | null, cls: number | null): string | undefined {
  if (!cls) return undefined;
  if (boardCode === 'ICSE' && cls >= 11) return 'ICSE ends at class 10. Classes 11 and 12 are ISC.';
  if (boardCode === 'ISC' && cls <= 10) return 'ISC is for classes 11 and 12. Up to class 10 it is ICSE.';
  if (boardCode === 'IGCSE' && cls >= 11) return 'IGCSE ends at grade 10. For 11 and 12 use Cambridge or IB.';
  return undefined;
}

// ---------------------------------------------------------------- detail lines

export type MetaKey = 'board' | 'class' | 'subject' | 'chapter' | 'topic' | 'difficulty';

const META = /^(board|class|grade|std|standard|subject|chapter|ch|lesson|topic|sub-?topic|section|difficulty|level)\b\.?\s*(.*)$/i;
const KEY_OF: Record<string, MetaKey> = {
  board: 'board', class: 'class', grade: 'class', std: 'class', standard: 'class', subject: 'subject',
  chapter: 'chapter', ch: 'chapter', lesson: 'chapter', topic: 'topic', subtopic: 'topic', 'sub-topic': 'topic', section: 'topic',
  difficulty: 'difficulty', level: 'difficulty',
};

/** Removes a Markdown heading mark, a bullet and bold from a line. Spaces inside are kept, so a box can be typed into word by word. */
const unmark = (line: string) => line.replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, '').replace(/^\s+/, '');
export const plainLine = (line: string) => tidy(unmark(line));

/**
 * A detail line such as "Chapter 3: Acids", "Class 10", "**Board:** CBSE" or "## Topic 2 - Indicators", or null.
 * The value is the text after the label (and after ":" or "-"), as written.
 * A sentence that only starts with one of the words ("Class of compounds that ...") is not a detail line.
 */
export function readMeta(line: string): { key: MetaKey; value: string } | null {
  if (/[|\t]/.test(line)) return null;
  const m = unmark(line).match(META);
  if (!m) return null;
  const k = KEY_OF[m[1].toLowerCase()];
  const rest = m[2];
  if (k === 'chapter' || k === 'topic') {
    const r = rest.match(/^(\d+(?:\.\d+)*)?\s*([:\-–—.)]\s*)?(.*)$/)!;
    if (!r[1] && !r[2]) return null;
    if (!r[1] && !tidy(r[3])) return null;
    return { key: k, value: rest.replace(/^[:\-–—]\s?/, '') };
  }
  if (k === 'class') {
    const r = rest.match(/^([:\-–—]\s?)?(.*)$/)!;
    if (!r[1] && !/^(?:\d+\s*(?:st|nd|rd|th)?|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)$/i.test(r[2].trim())) return null;
    return { key: k, value: r[2] };
  }
  const r = rest.match(/^[:\-–—]\s?(.*)$/);
  return r ? { key: k, value: r[1] } : null;
}

// ---------------------------------------------------------------- the four boxes, kept in the text

export type DetailKey = 'board' | 'class' | 'subject' | 'chapter';
export const DETAIL_KEYS: DetailKey[] = ['board', 'class', 'subject', 'chapter'];
export const LABEL: Record<DetailKey, string> = { board: 'Board', class: 'Class', subject: 'Subject', chapter: 'Chapter' };

const detailOf = (line: string) => {
  const m = readMeta(line);
  return m && m.key in LABEL ? (m as { key: DetailKey; value: string }) : null;
};

/** Where a box's line is: among the detail lines at the top of the text, before the first topic or question. -1 if none. */
function find(lines: string[], k: DetailKey): number {
  const end = lines.findIndex((l) => l.trim() && !detailOf(l));
  return lines.findIndex((l, i) => (end < 0 || i < end) && detailOf(l)?.key === k);
}

/** What the four boxes show: their lines at the top of the text. */
export function readDetails(text: string): Record<DetailKey, string> {
  const lines = text.split('\n');
  const get = (k: DetailKey) => {
    const i = find(lines, k);
    return i < 0 ? '' : detailOf(lines[i])!.value;
  };
  return { board: get('board'), class: get('class'), subject: get('subject'), chapter: get('chapter') };
}

/** The line (from 1) a box writes to, or null when it has none yet. */
export function detailLine(text: string, k: DetailKey): number | null {
  const i = find(text.split('\n'), k);
  return i < 0 ? null : i + 1;
}

/** Typing in a box writes its line at the top of the text (in the order Board, Class, Subject, Chapter); emptying it removes the line. */
export function writeDetail(text: string, k: DetailKey, value: string): string {
  const v = value.replace(/\s*[|\t\r\n]+\s*/g, ' ');
  const lines = text.split('\n');
  const at = find(lines, k);
  const line = k === 'chapter' && /^\d/.test(v) ? `Chapter ${v}` : `${LABEL[k]}: ${v}`;
  if (at >= 0) lines.splice(at, 1, ...(v.trim() ? [line] : []));
  else if (v.trim()) lines.splice(Math.max(-1, ...DETAIL_KEYS.slice(0, DETAIL_KEYS.indexOf(k)).map((b) => find(lines, b))) + 1, 0, line);
  return lines.join('\n');
}

const CHECK: Record<DetailKey, (v: string) => { problem?: Problem }> = {
  board: checkBoard, class: checkClass, subject: checkSubject, chapter: (v) => checkNumbered(v, 'chapter'),
};

/** A box's problem, shown under it. */
export const checkDetail = (k: DetailKey, value: string): Problem | undefined => (value.trim() ? CHECK[k](value).problem : undefined);

/** A box's value written the standard way (CBSE, 11, Chemistry, "1: Some Basic Concepts"), or as it was if it can't be read. */
export function standardDetail(k: DetailKey, value: string): string {
  if (!value.trim()) return '';
  if (k === 'board') { const b = checkBoard(value); return b.code ? b.name : value; }
  if (k === 'class') return String(checkClass(value).value ?? value);
  if (k === 'subject') return checkSubject(value).name || value;
  const c = checkNumbered(value, 'chapter');
  if (c.problem?.level === 'error') return value;
  return c.no === null ? c.name : c.name ? `${c.no}: ${c.name}` : String(c.no);
}

/** The chapter ID the four boxes make, if they are all there. */
export function detailsId(d: Record<DetailKey, string>): string | null {
  return chapterId(checkBoard(d.board).code, checkClass(d.class).value, checkSubject(d.subject).code, checkNumbered(d.chapter, 'chapter').no);
}
