/**
 * The HoD desk: teachers' batches wait here until the HoD approves each question or sends it back with a reason the
 * teacher sees in their notifications. Approved questions go into the question bank the revision games use. Works on
 * its own: it only reads and writes the database (src/db.ts). Only HoDs and the admin get it, and the database checks
 * that too. Waiting and sent-back questions load at once; approved ones a page at a time, newest first, as they're needed.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  APPROVED_PAGE, approvedCount, counts, loadApproved, loadForHod, loadQuestionBank, saveStatus, setStatus, toCSV, toJSON,
  type Bank, type BankQuestion, type Status,
} from './db';
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

/** Adds questions (and their batches) the page doesn't have yet. */
const merge = (b: Bank, more: Bank): Bank => {
  const have = new Set(b.questions.map((q) => q.id));
  const batches = new Set(b.batches.map((x) => x.id));
  return { batches: [...b.batches, ...more.batches.filter((x) => !batches.has(x.id))], questions: [...b.questions, ...more.questions.filter((q) => !have.has(q.id))] };
};
/** Puts these questions back as they were. */
const restore = (b: Bank, qs: BankQuestion[]): Bank => ({ ...b, questions: b.questions.map((q) => qs.find((o) => o.id === q.id) ?? q) });

/** `onWaiting` puts the number waiting in the header. */
export function HodDesk({ onWaiting }: { onWaiting: (n: number) => void }) {
  const [bank, setBank] = useState<Bank | null>(null); // the page's copy: waiting, sent back, and the approved pages loaded
  const [error, setError] = useState('');
  const [approvedTotal, setApprovedTotal] = useState<number | null>(null);
  // approved questions, a page at a time: `last` is the oldest one loaded, `done` when there are no older ones
  const [older, setOlder] = useState<{ started: boolean; loading: boolean; done: boolean; last?: BankQuestion }>({ started: false, loading: false, done: false });
  const [saveError, setSaveError] = useState('');
  const [tab, setTab] = useState<Status>('pending');
  const [back, setBack] = useState<{ where: string; ids: string[] } | null>(null); // the "why?" box that is open
  const [reason, setReason] = useState('');
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const { offer, toast } = useUndo();

  const recountApproved = useCallback(() => { approvedCount().then(setApprovedTotal, () => {}); }, []);
  /** Loads the waiting and sent-back questions afresh (keeping the old ones on screen until they arrive). */
  const load = useCallback(() => {
    setError('');
    // the approved pages start again once the new list is in
    loadForHod().then((b) => { setBank(b); setOlder({ started: false, loading: false, done: false }); onWaiting(counts(b).pending); }, (e: Error) => setError(e.message));
    recountApproved();
  }, [recountApproved, onWaiting]);
  useEffect(load, [load]);

  /** The next page of approved questions (the first when the Approved tab opens). */
  const loadOlder = () => {
    setOlder((o) => ({ ...o, started: true, loading: true }));
    loadApproved(older.last).then((page) => {
      setBank((b) => b && merge(b, page));
      setOlder({ started: true, loading: false, done: page.questions.length < APPROVED_PAGE, last: page.questions.at(-1) ?? older.last });
    }, (e: Error) => {
      setOlder((o) => ({ ...o, loading: false }));
      setSaveError(`Couldn't load the approved questions: ${e.message}`);
    });
  };
  useEffect(() => { if (tab === 'approved' && bank && !older.started) loadOlder(); });

  /** When a save fails, say so and show what the database really holds. */
  const failed = (e: unknown) => {
    setSaveError(`That change wasn't saved: ${(e as Error).message}`);
    load();
  };
  const refresh = () => { setBank(null); load(); };
  /** The whole question bank as a file, straight from the database. */
  const downloadBank = (csv: boolean) => {
    setDownloading(true);
    loadQuestionBank()
      .then((rows) => (csv ? download('approved-questions.csv', toCSV(rows), 'text/csv') : download('approved-questions.json', toJSON(rows), 'application/json')),
        (e: Error) => setSaveError(`Couldn't download the question bank: ${e.message}`))
      .finally(() => setDownloading(false));
  };

  if (!bank) {
    return (
      <Gate>
        {error ? (
          <>
            <p><b>Couldn't load the questions.</b> {error}</p>
            <button type="button" className="btn primary" onClick={refresh}>Try again</button>
          </>
        ) : <p>Loading the questions…</p>}
      </Gate>
    );
  }

  const c = { ...counts(bank), approved: approvedTotal ?? counts(bank).approved };

  /** The counts that come back with every saved change. */
  const recounted = (r: { waiting: number; approved: number }) => { onWaiting(r.waiting); setApprovedTotal(r.approved); };

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
    // after the row has left: questions that stayed sent back (the same question was sent again) come back
    const left = new Promise((done) => setTimeout(done, 240));
    Promise.all([saveStatus(ids, status, note), left]).then(([r]) => {
      recounted(r);
      const kept = old.filter((q) => r.skipped.includes(q.id));
      if (!kept.length) return;
      setBank((b) => b && restore(b, kept));
      setSaveError(`${plural(kept.length, 'question')} stayed sent back: the same question was sent again and is already waiting or approved.`);
    }, failed);
    const did = status === 'approved' ? 'approved' : status === 'rejected' ? 'sent back' : 'moved to waiting';
    offer(`${plural(ids.length, 'question')} ${did}`, () => {
      setBank(before);
      // put each question back as it was (questions sent back keep their own reason), one group after another, so
      // the counts from the last one are the final counts
      const groups = new Map<string, BankQuestion[]>();
      for (const q of old) groups.set(`${q.status}\u0000${q.note}`, [...(groups.get(`${q.status}\u0000${q.note}`) ?? []), q]);
      [...groups.values()].reduce<Promise<{ waiting: number; approved: number } | null>>((done, qs) => done.then(() => saveStatus(qs.map((q) => q.id), qs[0].status, qs[0].note)), Promise.resolve(null))
        .then((r) => r && recounted(r), failed);
    });
  };

  const shown = bank.questions.filter((q) => q.status === tab);
  const rowClass = (q: BankQuestion) => (leaving.has(q.id) ? 'leaving' : '');

  /** The "why are these going back?" box, under a row or a batch. */
  const whyBox = (where: string, ids: string[]) => (back?.where === where ? (
    <form className="why" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) act(ids, 'rejected', reason); }}>
      <label htmlFor={`why-${where}`}>Why {ids.length > 1 ? 'are these' : 'is this'} going back? The teacher will see this.</label>
      <textarea id={`why-${where}`} rows={2} maxLength={500} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} placeholder="e.g. The answer should be Rusting, not Rust." />
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
    .sort((x, y) => y.b.at.localeCompare(x.b.at)); // newest first

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
              <p className="small muted">Sent {when(b.at)}{b.email && ` · ${b.email}`}</p>
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
              <p className="small muted">This is the question bank: what the games use. Newest first.</p>
              <div className="row">
                <button type="button" className="btn small primary" disabled={downloading} onClick={() => downloadBank(true)}><DownloadIcon /> Download CSV</button>
                <button type="button" className="btn small" disabled={downloading} onClick={() => downloadBank(false)}><DownloadIcon /> Download JSON</button>
              </div>
            </div>
          )}
          <RowsTable rows={[...shown].sort((x, y) => (x.chapter_id ?? '').localeCompare(y.chapter_id ?? '') || (x.topic_no ?? 0) - (y.topic_no ?? 0) || x.question_no - y.question_no)} keyOf={(q) => q.id} extra={rowActions} rowClass={rowClass} />
          {tab === 'approved' && !older.done && (
            <button type="button" className="btn quiet" disabled={older.loading} onClick={loadOlder}>{older.loading ? 'Loading…' : 'Show older approved questions'}</button>
          )}
        </section>
      ) : (
        <div className="empty-state enter">
          {tab === 'rejected' || older.done ? <p>{tab === 'approved' ? 'No approved questions yet.' : 'Nothing has been sent back.'}</p>
            : older.loading || !older.started ? <p>Loading the approved questions…</p>
            : <button type="button" className="btn primary" onClick={loadOlder}>Try again</button>}
        </div>
      ))}

      <div className="floating" aria-live="polite">{toast}</div>
    </main>
  );
}
