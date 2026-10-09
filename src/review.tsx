/**
 * The HoD's Approve page, and the question bank behind it.
 *
 * Teachers send questions from the formatter as a batch; they wait here until the HoD approves them or sends them back
 * with a reason. Only approved questions are the question bank the games use.
 *
 * Demo: the bank is kept in this browser (localStorage). Its shape matches the tables planned for Shikshaq's database
 * (a batch, and questions with a status, a note and a review time), so swapping the storage for the database is the only change.
 */
import { useEffect, useState } from 'react';
import { toCSV, toJSON, type Row } from './format';
import { CheckIcon, DownloadIcon, RowsTable, useUndo } from './ui';

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
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const TABS: { key: Status; label: string }[] = [{ key: 'pending', label: 'Waiting' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Sent back' }];

export function ReviewPage({ bank, setBank, sample, toFormatter, save }: {
  bank: Bank;
  setBank: (f: Bank | ((b: Bank) => Bank)) => void;
  /** Adds a sample batch, so the page can be tried without the formatter. */
  sample: () => void;
  toFormatter: () => void;
  save: (name: string, text: string, mime: string) => void;
}) {
  const [tab, setTab] = useState<Status>('pending');
  const [back, setBack] = useState<{ where: string; ids: string[] } | null>(null); // the "why?" box that is open
  const [reason, setReason] = useState('');
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const { offer, toast } = useUndo();
  const c = counts(bank);

  /** Rows fade out, then move; every action can be undone for a few seconds. */
  const act = (ids: string[], status: Status, note = '') => {
    const before = bank;
    setBack(null);
    setReason('');
    setLeaving(new Set(ids));
    setTimeout(() => {
      setBank((b) => setStatus(b, ids, status, note, new Date().toISOString()));
      setLeaving(new Set());
    }, 220);
    const did = status === 'approved' ? 'approved' : status === 'rejected' ? 'sent back' : 'moved to waiting';
    offer(`${plural(ids.length, 'question')} ${did}`, () => setBank(before));
  };
  const clearAll = () => {
    const before = bank;
    setBank(EMPTY_BANK);
    offer('Demo cleared', () => setBank(before));
  };

  const shown = bank.questions.filter((q) => q.status === tab);
  const rowClass = (q: BankQuestion) => (leaving.has(q.id) ? 'leaving' : '');

  /** The "why are these going back?" box, under a row or a batch. */
  const whyBox = (where: string, ids: string[]) => (back?.where === where ? (
    <form className="why" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) act(ids, 'rejected', reason); }}>
      <label htmlFor={`why-${where}`}>Why {ids.length > 1 ? 'are these' : 'is this'} going back? The teacher will see this.</label>
      <textarea id={`why-${where}`} rows={2} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} placeholder="e.g. The answer should be Rusting, not Rust." />
      <div className="row">
        <button type="submit" className="btn small danger" disabled={!reason.trim()}>Send back</button>
        <button type="button" className="btn small quiet" onClick={() => setBack(null)}>Cancel</button>
      </div>
    </form>
  ) : null);

  const rowActions = (q: BankQuestion) => {
    if (q.status === 'pending') {
      return back?.where === q.id ? whyBox(q.id, [q.id]) : (
        <div className="acts">
          <button type="button" className="chip ok" onClick={() => act([q.id], 'approved')}><CheckIcon /> Approve</button>
          <button type="button" className="chip" onClick={() => { setBack({ where: q.id, ids: [q.id] }); setReason(''); }}>Send back</button>
        </div>
      );
    }
    return (
      <div className="acts">
        {q.status === 'rejected' && <p className="reason"><b>Sent back:</b> {q.note}</p>}
        <button type="button" className="chip" onClick={() => act([q.id], 'pending')}>Move to waiting</button>
      </div>
    );
  };

  const byBatch = bank.batches
    .map((b) => ({ b, qs: shown.filter((q) => q.batch === b.id) }))
    .filter((x) => x.qs.length)
    .reverse(); // newest first

  return (
    <main className="page review">
      <div className="intro enter">
        <h1>Approve questions</h1>
        <p>Questions teachers send from the formatter wait here. Only approved questions go into the question bank and the games.</p>
      </div>
      <p className="demo enter">
        <b>Demo:</b> everything here is saved in this browser only. In Shikshaq, only HoDs will open this page, and approvals will be saved in the database.
        {bank.questions.length > 0 && <> <button type="button" className="linkish" onClick={clearAll}>Clear the demo</button></>}
      </p>

      <div className="tabs enter" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => { setTab(t.key); setBack(null); }}>
            {t.label} <span className="count pop" key={c[t.key]}>{c[t.key]}</span>
          </button>
        ))}
      </div>

      {tab === 'pending' && (byBatch.length ? byBatch.map(({ b, qs }) => (
        <section className="card stack batch enter" key={b.id} aria-label={`Batch from ${b.by}`}>
          <div className="batch-head">
            <div>
              <h2>{plural(qs.length, 'question')} from {b.by}</h2>
              <p className="small muted">Sent {when(b.at)}</p>
            </div>
            {back?.where !== `batch:${b.id}` && (
              <div className="row">
                <button type="button" className="btn small ok" onClick={() => act(qs.map((q) => q.id), 'approved')}><CheckIcon /> Approve all {qs.length}</button>
                <button type="button" className="btn small quiet" onClick={() => { setBack({ where: `batch:${b.id}`, ids: qs.map((q) => q.id) }); setReason(''); }}>Send all back</button>
              </div>
            )}
          </div>
          {whyBox(`batch:${b.id}`, qs.map((q) => q.id))}
          <RowsTable rows={qs} keyOf={(q) => q.id} extra={rowActions} rowClass={rowClass} />
        </section>
      )) : (
        <div className="empty-state enter">
          <p><b>Nothing is waiting.</b> Questions sent from the formatter appear here.</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={sample}>Add a sample batch</button>
            <button type="button" className="btn quiet" onClick={toFormatter}>Go to the formatter</button>
          </div>
        </div>
      ))}

      {tab !== 'pending' && (shown.length ? (
        <section className="card stack enter">
          {tab === 'approved' && (
            <div className="batch-head">
              <p className="small muted">This is the question bank: what the games will use.</p>
              <div className="row">
                <button type="button" className="btn small primary" onClick={() => save('approved-questions.csv', toCSV(shown), 'text/csv')}><DownloadIcon /> Download CSV</button>
                <button type="button" className="btn small" onClick={() => save('approved-questions.json', toJSON(shown), 'application/json')}><DownloadIcon /> Download JSON</button>
              </div>
            </div>
          )}
          <RowsTable rows={[...shown].sort((x, y) => (x.chapter_id ?? '').localeCompare(y.chapter_id ?? '') || (x.topic_no ?? 0) - (y.topic_no ?? 0))} keyOf={(q) => q.id} extra={rowActions} rowClass={rowClass} />
        </section>
      ) : (
        <div className="empty-state enter"><p>{tab === 'approved' ? 'No approved questions yet.' : 'Nothing has been sent back.'}</p></div>
      ))}

      <div className="floating" aria-live="polite">{toast}</div>
    </main>
  );
}
