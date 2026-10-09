/**
 * The database, shared by the three parts and by nothing else:
 *   the question formatter sends questions into it, to wait for approval;
 *   the HoD desk approves them or sends them back;
 *   the revision games read only the approved ones (the question_bank table).
 * None of the three uses another's code; they only agree on the shapes below and talk to the same database.
 *
 * The database is Supabase; its tables, rules and functions are in supabase/schema.sql. Nothing is kept in the browser.
 */
import { useCallback, useEffect, useState } from 'react';

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
/** A teacher's batch. `id` is its batch ID, such as B20261009-03 (the 3rd batch sent that day). */
export interface Batch { id: string; by: string; at: string }
/** A question in the bank. `id` is its question ID, such as CBSE10SCI01T02Q003 (chapter, topic 02, question 003). */
export interface BankQuestion extends Row { id: string; batch: string; status: Status; note: string; reviewedAt: string | null }
export interface Bank { batches: Batch[]; questions: BankQuestion[] }

/** Approve, send back (with the reason the teacher sees) or move back to waiting, on the page's copy of the bank. */
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

// ---------------------------------------------------------------- talking to the database

/**
 * Reading goes straight to Supabase with the project's publishable key, which is made to be public: it can read the
 * question bank, count what is waiting and load the HoD desk, and nothing else. Writing (sending questions, approving,
 * sending back) goes through the site's own server, api/write.ts, which holds the secret key. The public key can't write.
 */
const API = 'https://dfytzracuyiitlqeqszm.supabase.co/rest/v1';
const KEY = 'sb_publishable__njgrg5F1tWacX_O6uSJNA_jSE1ucYg';

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
  } catch {
    throw new Error("Couldn't reach the question bank. Check the internet connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof body?.message === 'string' ? body.message : `The question bank didn't answer (${res.status}). Try again.`);
  return body as T;
}
const rpc = <T>(fn: string, args: object = {}) => request<T>(`${API}/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args), headers: { apikey: KEY } });
const write = <T>(fn: 'submit_batch' | 'hod_set_status', args: object) => request<T>('/api/write', { method: 'POST', body: JSON.stringify({ fn, args }) });

/** A row from the questions or question_bank table, with the batch's teacher and date where there is one. */
interface DbQuestion extends Omit<Row, 'line'> {
  question_id: string; batch_id?: string; status?: Status; note?: string; reviewed_at?: string | null;
  approved_at?: string; teacher?: string; sent_at?: string;
}
const fromDb = (r: DbQuestion): BankQuestion => ({
  ...r, line: 0, id: r.question_id, batch: r.batch_id ?? '', status: r.status ?? 'approved', note: r.note ?? '', reviewedAt: r.reviewed_at ?? r.approved_at ?? null,
});

/** Revise: every approved question, from the question_bank table, in order. */
export async function loadQuestionBank(): Promise<BankQuestion[]> {
  const rows: DbQuestion[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await request<DbQuestion[]>(`${API}/question_bank?select=*&order=class,subject,chapter_no,topic_no,question_no&limit=1000&offset=${from}`, { headers: { apikey: KEY } });
    rows.push(...page);
    if (page.length < 1000) return rows.map(fromDb);
  }
}

/** The number in the header: questions waiting for the HoD. */
export const waitingCount = () => rpc<number>('waiting_count');

/**
 * The formatter sends a teacher's questions to wait for the HoD, as one batch. Questions with no chapter ID can't be
 * linked to a chapter, so they aren't sent; the database skips any already waiting or approved in the same chapter, and
 * gives each new question its ID.
 */
export async function sendBatch(teacher: string, rows: Row[]) {
  const ready = rows.filter((r) => r.chapter_id);
  const r = await write<{ batch_id: string | null; sent: number; already: number }>('submit_batch', { teacher, questions: ready.map(toRecord) });
  return { batchId: r.batch_id, sent: r.sent, already: r.already, noId: rows.length - ready.length };
}

/** The HoD desk: every question, with its batch. */
export async function loadForHod(): Promise<Bank> {
  const rows = await rpc<DbQuestion[]>('hod_questions');
  const batches = new Map<string, Batch>();
  for (const r of rows) if (r.batch_id && !batches.has(r.batch_id)) batches.set(r.batch_id, { id: r.batch_id, by: r.teacher ?? '', at: r.sent_at ?? '' });
  return { batches: [...batches.values()], questions: rows.map(fromDb) };
}

/** The HoD approves, sends back (with a reason) or moves back to waiting. */
export const saveStatus = (ids: string[], status: Status, reason = '') =>
  write<{ question_id: string }[]>('hod_set_status', { ids, new_status: status, reason });

/** Loads something when the page opens. `reload` fetches again and keeps showing the old data until the new arrives. */
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  const reload = useCallback(() => {
    setState((s) => ({ data: s.data }));
    load().then((data) => setState({ data }), (e: Error) => setState((s) => ({ data: s.data, error: e.message })));
  }, [load]);
  useEffect(reload, [reload]);
  return { ...state, reload };
}
