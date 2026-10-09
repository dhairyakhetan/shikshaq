import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { RowsTable } from './components/RowsTable';
import { EXAMPLE } from './example';
import { COLUMNS, format, missing, type Details } from './lib/format';
import { baseName, copyText, download, toCSV, toJSON, toTSV } from './lib/rows';

const KEY = 'question-formatter:v1';
const EMPTY: Details = { board: '', class: '', subject: '', chapter: '' };
const FIELDS: { key: keyof Details; label: string; hint: string }[] = [
  { key: 'board', label: 'Board', hint: 'CBSE' },
  { key: 'class', label: 'Class', hint: '10' },
  { key: 'subject', label: 'Subject', hint: 'Science' },
  { key: 'chapter', label: 'Chapter', hint: '1: Chemical Reactions' },
];

/** The draft is kept in this browser so a refresh never loses it. */
function load(): { raw: string; details: Details } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v.raw === 'string' && v.details && typeof v.details === 'object') {
      const details = { ...EMPTY };
      for (const k of Object.keys(EMPTY) as (keyof Details)[]) if (typeof v.details[k] === 'string') details[k] = v.details[k];
      return { raw: v.raw, details };
    }
  } catch { /* private window or unreadable draft: start empty */ }
  return { raw: '', details: EMPTY };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function App() {
  const [saved] = useState(load);
  const [raw, setRaw] = useState(saved.raw);
  const [details, setDetails] = useState(saved.details);
  const [copied, setCopied] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ raw, details })); } catch { /* storage full or blocked */ }
  }, [raw, details]);

  const text = useDeferredValue(raw);
  const { rows, issues } = useMemo(() => format(text, details), [text, details]);
  const gaps = missing(rows);
  const chapters = new Set(rows.map((r) => [r.board, r.class, r.subject, r.chapter_no, r.chapter].join('|'))).size;
  const topics = new Set(rows.filter((r) => r.topic || r.topic_no !== null).map((r) => [r.board, r.class, r.subject, r.chapter_no, r.chapter, r.topic_no, r.topic].join('|'))).size;
  const name = baseName(rows);

  const notes = [
    gaps.class > 0 && `${plural(gaps.class, 'question has', 'questions have')} no class. Fill in Class above.`,
    gaps.subject > 0 && `${plural(gaps.subject, 'question has', 'questions have')} no subject. Fill in Subject above.`,
    gaps.chapter > 0 && `${plural(gaps.chapter, 'question has', 'questions have')} no chapter. Fill in Chapter above, or add a line such as "Chapter 1: Name".`,
    gaps.topic > 0 && `${plural(gaps.topic, 'question has', 'questions have')} no topic. Add a line such as "Topic 1: Name" above them.`,
  ].filter(Boolean) as string[];

  const copy = async (what: string, value: string) => {
    if (!(await copyText(value))) return;
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? '' : c)), 2000);
  };

  const prompt = `Open ${location.origin}${location.pathname} and follow the instructions on that page to turn the material below into questions and answers.\n\nMaterial (my notes, my questions, or just the board, class, subject and chapter):\n`;

  /** Selects a line of the Questions box, so a reported problem can be fixed in place. */
  const goTo = (line: number) => {
    const ta = box.current;
    if (!ta) return;
    const lines = ta.value.split('\n');
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    ta.focus();
    ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    ta.scrollTop = Math.max(0, (line - 3) * (parseFloat(getComputedStyle(ta).lineHeight) || 24));
  };

  return (
    <>
      <header className="top">
        <div className="top-in">
          <span className="brand"><Logo /> Question Formatter</span>
        </div>
      </header>
      <main className="page">
        <div className="intro">
          <h1>Question Formatter</h1>
          <p>Paste questions and answers in any format. They come out as clean rows for the question bank, ready to download.</p>
        </div>

        <div className="layout">
          <section className="card stack" aria-labelledby="in-h">
            <h2 id="in-h">1. Paste</h2>
            <div className="details">
              {FIELDS.map((f) => (
                <div className="field" key={f.key}>
                  <label htmlFor={`d-${f.key}`}>{f.label}</label>
                  <input id={`d-${f.key}`} type="text" value={details[f.key]} placeholder={`e.g. ${f.hint}`} autoComplete="off"
                    onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} />
                </div>
              ))}
            </div>
            <p className="small muted">Used for every question, unless a line in your text says otherwise, such as <code>Chapter 2: Acids</code> or <code>Topic 1: Indicators</code>.</p>

            <label htmlFor="q">Questions</label>
            <textarea id="q" ref={box} className="data" spellCheck={false} value={raw} onChange={(e) => setRaw(e.target.value)}
              placeholder={'Any format works, for example:\n\nTopic 1: Chemical equations\nWhat is ...? | Answer\n1. What is ...? Ans: Answer\nQ. What is ...?\nAns. Answer'} />
            <div className="row">
              <button type="button" className="btn quiet" onClick={() => setRaw(EXAMPLE)}>Try an example</button>
              <button type="button" className="btn quiet" onClick={() => setRaw('')} disabled={!raw}>Clear</button>
            </div>

            <div className="bot">
              <p><b>Starting from notes?</b> Copy this prompt into ChatGPT, Gemini or Claude, add your notes (or just the class, subject and chapter), then paste its reply into Questions.</p>
              <button type="button" className="btn small" onClick={() => copy('prompt', prompt)}>{copied === 'prompt' ? 'Copied' : 'Copy chatbot prompt'}</button>
            </div>
          </section>

          <section className="card stack" aria-labelledby="out-h">
            <h2 id="out-h">2. Check and download</h2>
            <p className="summary" role="status" aria-live="polite">
              {rows.length
                ? <><b>{plural(rows.length, 'question')}</b> in {plural(chapters, 'chapter')} and {plural(topics, 'topic')}</>
                : 'Nothing to download yet.'}
            </p>

            {issues.length > 0 && (
              <div className="warn">
                <b>{plural(issues.length, 'line needs', 'lines need')} attention</b>
                <ul>
                  {issues.slice(0, 50).map((x, i) => (
                    <li key={i}><button type="button" className="linkish" onClick={() => goTo(x.line)}>Line {x.line}</button>: {x.text}</li>
                  ))}
                  {issues.length > 50 && <li>and {issues.length - 50} more</li>}
                </ul>
              </div>
            )}
            {notes.length > 0 && <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}

            {rows.length ? <RowsTable rows={rows} /> : <p className="empty">Your questions will appear here, grouped by chapter and topic.</p>}

            <div className="row">
              <button type="button" className="btn primary" disabled={!rows.length} onClick={() => download(`${name}.csv`, toCSV(rows), 'text/csv')}>Download CSV</button>
              <button type="button" className="btn" disabled={!rows.length} onClick={() => download(`${name}.json`, toJSON(rows), 'application/json')}>Download JSON</button>
              <button type="button" className="btn quiet" disabled={!rows.length} onClick={() => copy('sheets', toTSV(rows))}>{copied === 'sheets' ? 'Copied' : 'Copy for Sheets'}</button>
            </div>
            <p className="small muted">One row per question, with the columns <code>{COLUMNS.join(', ')}</code>. The CSV imports straight into a database table.</p>
          </section>
        </div>
      </main>
    </>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F2A900" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 8h2M11 8h6M7 12h2M11 12h6M7 16h2M11 16h6" />
    </svg>
  );
}
