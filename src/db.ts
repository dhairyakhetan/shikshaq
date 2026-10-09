/**
 * The database, shared by the three parts and by nothing else:
 *   the question formatter writes questions into it, waiting for approval;
 *   the HoD desk approves them or sends them back;
 *   the revision games read only the approved ones.
 * None of the three uses another's code; they only agree on the shapes below.
 *
 * Demo: kept in this browser (localStorage key "question-bank:v1"), so it works with no server. The shapes match the
 * tables planned for Shikshaq's database (batches, and questions with a status), so moving to the real database means
 * changing `useBank` only.
 */
import { useEffect, useState } from 'react';

// ---------------------------------------------------------------- a question row

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

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

// ---------------------------------------------------------------- rows as files

type Record_ = Record<(typeof COLUMNS)[number], string | number | null>;

/** A row as the database sees it: the columns only, with an empty value as null. */
export function toRecord(r: Row): Record_ {
  const out = {} as Record_;
  for (const c of COLUMNS) out[c] = r[c] === '' ? null : r[c];
  return out;
}

/** A header row, then one line per question. */
function table(rows: Row[], sep: string, cell: (v: string) => string): string {
  const line = (r: Row) => {
    const rec = toRecord(r);
    return COLUMNS.map((c) => cell(String(rec[c] ?? ''))).join(sep);
  };
  return [COLUMNS.join(sep), ...rows.map(line)].join('\n');
}

/** CSV with a header row (RFC 4180 quoting, no byte-order mark), ready to import into a table. */
export const toCSV = (rows: Row[]) => table(rows, ',', (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)) + '\n';

export const toJSON = (rows: Row[]) => JSON.stringify(rows.map(toRecord), null, 2) + '\n';

/** Tab-separated with a header row, for pasting into Google Sheets or Excel. */
export const toTSV = (rows: Row[]) => table(rows, '\t', (v) => v.replace(/\t/g, ' '));

// ---------------------------------------------------------------- the question bank

export type Status = 'pending' | 'approved' | 'rejected';
export interface Batch { id: string; by: string; at: string }
export interface BankQuestion extends Row { id: string; batch: string; status: Status; note: string; reviewedAt: string | null }
export interface Bank { batches: Batch[]; questions: BankQuestion[] }

export const EMPTY_BANK: Bank = { batches: [], questions: [] };
const KEY = 'question-bank:v1';
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Adds a batch of questions. Questions with no chapter ID can't be linked to a chapter, so they aren't sent; a question
 * already waiting or approved for the same chapter isn't sent twice. One that was sent back can be sent again.
 */
export function addBatch(bank: Bank, rows: Row[], by: string, at: string, newId: () => string) {
  const ready = rows.filter((r) => r.chapter_id);
  const fresh = ready.filter((r) => !bank.questions.some((q) => q.status !== 'rejected' && q.chapter_id === r.chapter_id && norm(q.question) === norm(r.question)));
  const result = { noId: rows.length - ready.length, already: ready.length - fresh.length, sent: fresh.length };
  if (!fresh.length) return { bank, ...result };
  const batch: Batch = { id: newId(), by: by.trim(), at };
  const questions = fresh.map((r): BankQuestion => ({ ...r, id: newId(), batch: batch.id, status: 'pending', note: '', reviewedAt: null }));
  return { bank: { batches: [...bank.batches, batch], questions: [...bank.questions, ...questions] }, ...result };
}

/** Approve, send back (with the reason the teacher sees) or move back to waiting. */
export function setStatus(bank: Bank, ids: string[], status: Status, note: string, at: string): Bank {
  const pick = new Set(ids);
  return {
    ...bank,
    questions: bank.questions.map((q) => (pick.has(q.id) ? { ...q, status, note: status === 'rejected' ? note.trim() : '', reviewedAt: status === 'pending' ? null : at } : q)),
  };
}

export const counts = (bank: Bank): Record<Status, number> => ({
  pending: bank.questions.filter((q) => q.status === 'pending').length,
  approved: bank.questions.filter((q) => q.status === 'approved').length,
  rejected: bank.questions.filter((q) => q.status === 'rejected').length,
});

function loadBank(): Bank {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Array.isArray(v?.batches) && Array.isArray(v?.questions) ? v : EMPTY_BANK;
  } catch { return EMPTY_BANK; }
}

/** The bank, saved in this browser and kept in step across open tabs. */
export function useBank() {
  const [bank, setBank] = useState<Bank>(loadBank);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(bank)); } catch { /* storage full or blocked */ }
  }, [bank]);
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === KEY) setBank(loadBank()); };
    addEventListener('storage', on);
    return () => removeEventListener('storage', on);
  }, []);
  return [bank, setBank] as const;
}

export const newId = () => (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

// ---------------------------------------------------------------- sample questions (so each part can be tried on its own)

const SAMPLE_TOPICS: [string, [string, string, Difficulty][]][] = [
  ['Chemical Equations', [
    ['Equation with the same number of atoms of each element on both sides', 'Balanced equation', 'easy'],
    ['Law that requires a chemical equation to be balanced', 'Law of conservation of mass', 'medium'],
    ['Substances that take part in a chemical reaction', 'Reactants', 'easy'],
    ['Substances formed in a chemical reaction', 'Products', 'easy'],
    ['Symbol written after a formula to show that a substance is a gas', '(g)', 'medium'],
  ]],
  ['Types of Chemical Reactions', [
    ['Reaction in which two or more reactants form a single product', 'Combination', 'easy'],
    ['Reaction in which a single reactant breaks down into simpler products', 'Decomposition', 'easy'],
    ['Reaction in which a more reactive element takes the place of a less reactive one in its compound', 'Displacement', 'medium'],
    ['Gain of oxygen by a substance during a reaction', 'Oxidation', 'easy'],
    ['Loss of oxygen by a substance during a reaction', 'Reduction', 'easy'],
    ['Reaction in which heat is given out', 'Exothermic', 'easy'],
    ['Insoluble solid formed when two solutions react', 'Precipitate', 'medium'],
  ]],
  ['Effects of Oxidation in Everyday Life', [
    ['Process in which metals are slowly eaten away by air and moisture', 'Corrosion', 'easy'],
    ['Common name for the corrosion of iron', 'Rusting', 'easy'],
    ['Fats and oils go ___ when they are oxidised and their smell and taste change', 'Rancid', 'medium'],
    ['Gas filled in chip packets to keep the chips from going rancid', 'Nitrogen', 'easy'],
    ['Coating iron with zinc to stop it rusting', 'Galvanisation', 'medium'],
    ['Colour of the coating that forms on copper left in moist air', 'Green', 'easy'],
  ]],
];

/** CBSE Class 10 Science, Chapter 1: 18 questions in 3 topics. */
export const SAMPLE: Row[] = SAMPLE_TOPICS.flatMap(([topic, qs], t) => qs.map(([question, answer, difficulty], q) => ({
  chapter_id: 'CBSE10SCI01', topic_id: `CBSE10SCI01T0${t + 1}`, board: 'CBSE', class: 10, subject: 'Science',
  chapter_no: 1, chapter: 'Chemical Reactions and Equations', topic_no: t + 1, topic,
  question_no: q + 1, question, answer, difficulty, line: 0,
})));

/** The sample as a batch from "Sample teacher": waiting (for the HoD desk) or already approved (for the revision games). */
export function addSample(bank: Bank, status: Status): Bank {
  const r = addBatch(bank, SAMPLE, 'Sample teacher', new Date().toISOString(), newId);
  const added = r.bank.questions.slice(bank.questions.length).map((q) => q.id);
  return status === 'pending' ? r.bank : setStatus(r.bank, added, status, '', new Date().toISOString());
}
