/**
 * The HoD desk: teachers' batches wait here until the HoD approves each question or sends it back with a reason the
 * teacher sees. Approved questions go into the question bank the revision games use. Works on its own: it only reads and
 * writes the database (src/db.ts). Only HoDs and the admin get it, and the database checks that too.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { counts, loadForHod, saveStatus, setStatus, toCSV, toJSON, type Bank, type BankQuestion, type Status } from './db';
import { CheckIcon, download, DownloadIcon, Link, RowsTable, useUndo } from './ui';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const TABS: { key: Status; label: string }[] = [{ key: 'pending', label: 'Waiting' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Sent back' }];

/** The page while the questions load, or when they can't. */
function Gate({ children }: { children: ReactNode }) {
  return (
    <main className="page review">
      <div className="intro enter">
        <h1>Approve questions</h1>
        <p>Questions teachers send from the formatter wait here. Only approved questions go into the question bank and the games.</p>
      </div>
      <div className="empty-state enter" aria-live="polite">{children}</div>
    </main>
  );
}

/** `onChange` recounts the header's number. */
export function HodDesk({ onChange }: { onChange: () => void }) {
  const [loaded, setLoaded] = useState<{ data?: Bank; error?: string }>({});
  const load = useCallback(() => {
    setLoaded((l) => ({ data: l.data }));
    loadForHod().then((data) => setLoaded({ data }), (e: Error) => setLoaded((l) => ({ data: l.data, error: e.message })));
  }, []);
  useEffect(load, [load]);
  const [edited, setBank] = useState<Bank | null>(null); // the page's copy once the HoD changes something
  const bank = edited ?? loaded.data;
  const [saveError, setSaveError] = useState('');
  const [tab, setTab] = useState<Status>('pending');
  const [back, setBack] = useState<{ where: string; ids: string[] } | null>(null); // the "why?" box that is open
  const [reason, setReason] = useState('');
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const { offer, toast } = useUndo();

  /** When a save fails, say so and show what the database really holds. */
  const failed = (e: unknown) => {
    setSaveError(`That change wasn't saved: ${(e as Error).message}`);
    loadForHod().then(setBank, () => {});
  };
  const refresh = () => { setBank(null); load(); };

  if (!bank) {
    return (
      <Gate>
        {loaded.error ? (
          <>
            <p><b>Couldn't load the questions.</b> {loaded.error}</p>
            <button type="button" className="btn primary" onClick={refresh}>Try again</button>
          </>
        ) : <p>Loading the questions…</p>}
      </Gate>
    );
  }

  const c = counts(bank);

  /** Rows fade out, then move, and the change is saved; every action can be undone for a few seconds. */
  const act = (ids: string[], status: Status, note = '') => {
    const before = bank;
    const old = before.questions.filter((q) => ids.includes(q.id));
    setBack(null);
    setReason('');
    setSaveError('');
    setLeaving(new Set(ids));
    setTimeout(() => {
      setBank((b) => setStatus(b ?? before, ids, status, note, new Date().toISOString()));
      setLeaving(new Set());
    }, 220);
    saveStatus(ids, status, note).then(onChange, failed);
    const did = status === 'approved' ? 'approved' : status === 'rejected' ? 'sent back' : 'moved to waiting';
    offer(`${plural(ids.length, 'question')} ${did}`, () => {
      setBank(before);
      // put each question back as it was (questions sent back keep their own reason)
      const groups = new Map<string, BankQuestion[]>();
      for (const q of old) groups.set(`${q.status}\u0000${q.note}`, [...(groups.get(`${q.status}\u0000${q.note}`) ?? []), q]);
      Promise.all([...groups.values()].map((qs) => saveStatus(qs.map((q) => q.id), qs[0].status, qs[0].note))).then(onChange, failed);
    });
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
      {saveError && <p className="sent-note warn" role="alert">{saveError}</p>}

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
          <p><b>Nothing is waiting.</b> Questions teachers send from the formatter appear here.</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={refresh}>Check for new questions</button>
            <Link className="btn quiet" href="/">Go to the formatter</Link>
          </div>
        </div>
      ))}

      {tab !== 'pending' && (shown.length ? (
        <section className="card stack enter">
          {tab === 'approved' && (
            <div className="batch-head">
              <p className="small muted">This is the question bank: what the games use.</p>
              <div className="row">
                <button type="button" className="btn small primary" onClick={() => download('approved-questions.csv', toCSV(shown), 'text/csv')}><DownloadIcon /> Download CSV</button>
                <button type="button" className="btn small" onClick={() => download('approved-questions.json', toJSON(shown), 'application/json')}><DownloadIcon /> Download JSON</button>
              </div>
            </div>
          )}
          <RowsTable rows={[...shown].sort((x, y) => (x.chapter_id ?? '').localeCompare(y.chapter_id ?? '') || (x.topic_no ?? 0) - (y.topic_no ?? 0) || x.question_no - y.question_no)} keyOf={(q) => q.id} extra={rowActions} rowClass={rowClass} />
        </section>
      ) : (
        <div className="empty-state enter"><p>{tab === 'approved' ? 'No approved questions yet.' : 'Nothing has been sent back.'}</p></div>
      ))}

      <div className="floating" aria-live="polite">{toast}</div>
    </main>
  );
}
