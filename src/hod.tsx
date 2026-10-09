/**
 * The HoD desk: teachers' batches wait here until the HoD approves each question or sends it back with a reason the
 * teacher sees. Approved questions go into the question bank the revision games use. Works on its own: it only reads and
 * writes the database (src/db.ts), and only with the HoD passcode, which is kept in memory and never saved.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { counts, loadForHod, saveStatus, setStatus, toCSV, toJSON, useLoad, waitingCount, type Bank, type BankQuestion, type Status } from './db';
import { CheckIcon, DownloadIcon, RowsTable, SectionHeader, useUndo } from './ui';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const TABS: { key: Status; label: string }[] = [{ key: 'pending', label: 'Waiting' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Sent back' }];

function HodDesk() {
  const waiting = useLoad(waitingCount);
  const [pass, setPass] = useState('');
  const [key, setKey] = useState(''); // the passcode that opened the desk
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const [bank, setBank] = useState<Bank | null>(null);
  const [saveError, setSaveError] = useState('');
  const [tab, setTab] = useState<Status>('pending');
  const [back, setBack] = useState<{ where: string; ids: string[] } | null>(null); // the "why?" box that is open
  const [reason, setReason] = useState('');
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const { offer, toast } = useUndo();

  const open = async (passcode: string) => {
    setOpening(true);
    setOpenError('');
    try {
      setBank(await loadForHod(passcode));
      setKey(passcode);
    } catch (e) {
      setOpenError((e as Error).message === 'Wrong passcode.' ? 'That passcode is not right.' : (e as Error).message);
    } finally {
      setOpening(false);
    }
  };
  /** When a save fails, say so and show what the database really holds. */
  const failed = (e: unknown) => {
    setSaveError(`That change wasn't saved: ${(e as Error).message}`);
    loadForHod(key).then(setBank, () => {});
  };

  if (!bank) {
    return (
      <>
        <SectionHeader here="hod" waiting={waiting.data ?? 0} />
        <main className="page review">
          <div className="intro enter">
            <h1>Approve questions</h1>
            <p>Questions teachers send from the formatter wait here. Only approved questions go into the question bank and the games.</p>
          </div>
          <form className="card stack unlock enter" onSubmit={(e) => { e.preventDefault(); if (pass) open(pass); }}>
            <h2>Enter the HoD passcode</h2>
            <p className="small muted">Only HoDs can approve questions. The passcode isn't saved, so it is needed each time this page is opened.</p>
            <div className="row">
              <input type="password" aria-label="HoD passcode" placeholder="Passcode" autoComplete="current-password" value={pass} autoFocus onChange={(e) => { setPass(e.target.value); setOpenError(''); }} />
              <button type="submit" className="btn primary" disabled={!pass || opening}>{opening ? 'Opening…' : 'Open the HoD desk'}</button>
            </div>
            {openError && <p className="sent-note warn" role="alert">{openError}</p>}
          </form>
        </main>
      </>
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
      setBank((b) => b && setStatus(b, ids, status, note, new Date().toISOString()));
      setLeaving(new Set());
    }, 220);
    saveStatus(key, ids, status, note).catch(failed);
    const did = status === 'approved' ? 'approved' : status === 'rejected' ? 'sent back' : 'moved to waiting';
    offer(`${plural(ids.length, 'question')} ${did}`, () => {
      setBank(before);
      // put each question back as it was (questions sent back keep their own reason)
      const groups = new Map<string, BankQuestion[]>();
      for (const q of old) groups.set(`${q.status}\u0000${q.note}`, [...(groups.get(`${q.status}\u0000${q.note}`) ?? []), q]);
      Promise.all([...groups.values()].map((qs) => saveStatus(key, qs.map((q) => q.id), qs[0].status, qs[0].note))).catch(failed);
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
    <>
    <SectionHeader here="hod" waiting={c.pending} />
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
            <button type="button" className="btn primary" onClick={() => open(key)}>Check for new questions</button>
            <a className="btn quiet" href="/">Go to the formatter</a>
          </div>
        </div>
      ))}

      {tab !== 'pending' && (shown.length ? (
        <section className="card stack enter">
          {tab === 'approved' && (
            <div className="batch-head">
              <p className="small muted">This is the question bank: what the games use.</p>
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
