/**
 * The HoD desk: teachers' batches wait here until the HoD approves each question or sends it back with a reason the
 * teacher sees. Approved questions are the question bank the revision games use. Works on its own: it only reads and
 * writes the database (src/db.ts).
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-400.css';
import '@fontsource-variable/bricolage-grotesque/index.css';
import './styles.css';
import { addSample, counts, EMPTY_BANK, setStatus, toCSV, toJSON, useBank, type BankQuestion, type Status } from './db';
import { CheckIcon, DownloadIcon, RowsTable, SectionHeader, useUndo } from './ui';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const TABS: { key: Status; label: string }[] = [{ key: 'pending', label: 'Waiting' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Sent back' }];

function HodDesk() {
  const [bank, setBank] = useBank();
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
    <>
    <SectionHeader here="hod" waiting={c.pending} />
    <main className="page review">
      <div className="intro enter">
        <h1>Approve questions</h1>
        <p>Questions teachers send from the formatter wait here. Only approved questions go into the question bank and the games.</p>
      </div>
      <p className="demo enter">
        <b>Demo:</b> everything here is saved in this browser only. In Shikshaq, only HoDs will open the HoD desk, and approvals will be saved in the database.
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
            <button type="button" className="btn primary" onClick={() => setBank((b) => addSample(b, 'pending'))}>Add a sample batch</button>
            <a className="btn quiet" href="/">Go to the formatter</a>
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
    </>
  );
}

function save(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <HodDesk />
  </StrictMode>,
);
