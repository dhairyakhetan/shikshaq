import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from './components/Editor';
import { Guide } from './components/Guide';
import { ActionIcon, ArrowDownIcon, CopyIcon, DownloadIcon } from './components/icons';
import { RowsTable } from './components/RowsTable';
import { EXAMPLE } from './example';
import { checkDetail, DETAIL_KEYS, detailLine, detailsId, readDetails, standardDetail, writeDetail, type DetailKey } from './lib/details';
import { COLUMNS, format, lineLevels, missing, visibleIssues } from './lib/format';
import { baseName, copyText, download, toCSV, toJSON, toTSV } from './lib/rows';

const KEY = 'question-formatter:v1';
const FIELDS: Record<DetailKey, { label: string; hint: string }> = {
  board: { label: 'Board', hint: 'CBSE' },
  class: { label: 'Class', hint: '10' },
  subject: { label: 'Subject', hint: 'Science' },
  chapter: { label: 'Chapter', hint: '1: Chemical Reactions' },
};

/** The draft is kept in this browser so a refresh never loses it. Drafts from before the boxes lived in the text are moved into it. */
function load(): string {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v.raw === 'string') {
      let raw: string = v.raw;
      for (const k of [...DETAIL_KEYS].reverse()) {
        const old = v.details?.[k];
        if (typeof old === 'string' && old.trim() && !readDetails(raw)[k]) raw = writeDetail(raw, k, old);
      }
      return raw;
    }
  } catch { /* private window or unreadable draft: start empty */ }
  return '';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const motion = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

export function App() {
  const [raw, setRaw] = useState(load);
  const [done, setDone] = useState('');
  const [caret, setCaret] = useState(0);
  /** Bumped when the whole text is replaced (paste, example, clear), so the table plays its entrance again. */
  const [batch, setBatch] = useState(0);
  const [undo, setUndo] = useState<{ text: string; what: string } | null>(null);
  const [resultsInView, setResultsInView] = useState(true);
  /** The line being typed on in the Questions box, and the detail box being typed in: problems there wait until they move on. */
  const [typingLine, setTypingLine] = useState<number | null>(null);
  const [typingBox, setTypingBox] = useState<DetailKey | null>(null);
  const boxTimer = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const results = useRef<HTMLElement>(null);
  const undoTimer = useRef(0);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ raw })); } catch { /* storage full or blocked */ }
  }, [raw]);

  // on a phone the results are below the box: a small pill points to them while they are out of sight
  useEffect(() => {
    const el = results.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setResultsInView(e.isIntersecting), { rootMargin: '0px 0px -30% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const text = useDeferredValue(raw);
  const { rows, issues: all } = useMemo(() => format(text), [text]);
  const issues = visibleIssues(all, { caret: typingLine, line: typingBox && detailLine(raw, typingBox) });
  /** Moving the cursor to another line ends "still typing" there; arriving on a line shows its problems. */
  const moveCaret = (line: number) => {
    setCaret(line);
    setTypingLine((t) => (t === line ? t : null));
  };
  const typedOn = (line: number | null) => {
    if (line !== null) setCaret(line);
    setTypingLine(line);
  };
  const levels = lineLevels(issues);
  const details = readDetails(raw);
  const id = detailsId(details);
  const gaps = missing(rows);
  const chapters = new Set(rows.map((r) => r.chapter_id ?? [r.board, r.class, r.subject, r.chapter_no, r.chapter].join('|'))).size;
  const topics = new Set(rows.filter((r) => r.topic || r.topic_no !== null).map((r) => [r.chapter_id, r.board, r.class, r.subject, r.chapter_no, r.chapter, r.topic_no, r.topic].join('|'))).size;
  const errors = issues.filter((x) => x.level === 'error').length;
  const name = baseName(rows);

  // one note per count, so "no board, class or subject" is one line rather than three
  const have = (n: number) => plural(n, 'question has', 'questions have');
  const byCount = new Map<number, string[]>();
  for (const [k, what] of [['board', 'board'], ['class', 'class'], ['subject', 'subject'], ['chapter', 'chapter number']] as const) {
    if (gaps[k]) byCount.set(gaps[k], [...(byCount.get(gaps[k]) ?? []), what]);
  }
  const notes = [
    ...[...byCount].map(([n, what]) => `${have(n)} no ${what.length > 1 ? `${what.slice(0, -1).join(', ')} or ${what[what.length - 1]}` : what[0]}, so no chapter ID. Fill in the boxes above.`),
    gaps.topic > 0 && `${have(gaps.topic)} no topic. Add a line such as "Topic 1: Name" above them.`,
  ].filter(Boolean) as string[];

  /** Shows a check mark on a button for a moment after its action worked. */
  const flash = (what: string) => {
    setDone(what);
    setTimeout(() => setDone((c) => (c === what ? '' : c)), 1800);
  };
  const copy = async (what: string, value: string) => { if (await copyText(value)) flash(what); };
  const save = (what: 'csv' | 'json') => {
    if (what === 'csv') download(`${name}.csv`, toCSV(rows), 'text/csv');
    else download(`${name}.json`, toJSON(rows), 'application/json');
    flash(what);
  };

  /** Replacing all the text can always be undone for a few seconds, so there is no "are you sure?". */
  const replaceAll = (next: string, what: string) => {
    if (raw.trim() && raw !== next) {
      setUndo({ text: raw, what });
      clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndo(null), 7000);
    }
    setRaw(next);
    setBatch((b) => b + 1);
  };
  const restore = () => {
    if (!undo) return;
    setRaw(undo.text);
    setBatch((b) => b + 1);
    setUndo(null);
    box.current?.focus({ preventScroll: true });
  };

  const prompt = `Open ${location.origin}${location.pathname} and follow the instructions on that page to turn the material below into questions and answers.\n\nMaterial (my notes, my questions, or just the board, class, subject and chapter):\n`;

  /** Scrolls smoothly to a part of the page and moves keyboard focus there, without adding "#..." to the address. */
  const scrollTo = (el: HTMLElement | null) => {
    if (!el) return;
    el.scrollIntoView({ behavior: motion(), block: 'start' });
    el.focus({ preventScroll: true });
  };

  /** Selects a line of the Questions box, so a reported problem can be fixed in place. */
  const goTo = (line: number) => {
    const ta = box.current;
    if (!ta) return;
    const lines = ta.value.split('\n');
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    ta.scrollIntoView({ behavior: motion(), block: 'center' });
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    ta.scrollTop = Math.max(0, (line - 3) * (parseFloat(getComputedStyle(ta).lineHeight) || 24));
    moveCaret(line);
  };

  return (
    <>
      <header className="top">
        <div className="top-in">
          <span className="brand"><Logo /> Question Formatter</span>
          <button type="button" className="top-link" onClick={() => scrollTo(document.getElementById('guide'))}>How to write<span className="wide-only"> questions</span></button>
        </div>
      </header>
      <main className="page">
        <div className="intro enter">
          <h1>Question Formatter</h1>
          <p>Paste questions and answers in any format. They come out as clean rows for the question bank, each linked to its chapter by an ID.</p>
        </div>

        <div className="layout">
          <section className="card stack enter" style={{ animationDelay: '60ms' }} aria-labelledby="in-h">
            <h2 id="in-h">1. Paste</h2>
            <div className="details">
              {DETAIL_KEYS.map((k) => {
                const problem = typingBox === k ? undefined : checkDetail(k, details[k]);
                return (
                  <div className="field" key={k}>
                    <label htmlFor={`d-${k}`}>{FIELDS[k].label}</label>
                    <input id={`d-${k}`} type="text" value={details[k]} placeholder={`e.g. ${FIELDS[k].hint}`} autoComplete="off"
                      className={problem ? problem.level : undefined} aria-invalid={problem?.level === 'error'} aria-describedby={problem ? `d-${k}-msg` : undefined}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRaw((r) => writeDetail(r, k, v));
                        // a box's warning waits until it is left, or until typing pauses
                        setTypingBox(k);
                        clearTimeout(boxTimer.current);
                        boxTimer.current = window.setTimeout(() => setTypingBox(null), 1500);
                      }}
                      onBlur={(e) => {
                        clearTimeout(boxTimer.current);
                        setTypingBox(null);
                        const std = standardDetail(k, e.target.value);
                        if (std !== e.target.value) setRaw((r) => writeDetail(r, k, std));
                      }} />
                    {problem && <span id={`d-${k}-msg`} key={problem.text} className={`field-msg ${problem.level}`}>{problem.text}</span>}
                  </div>
                );
              })}
            </div>
            <p className="small muted">
              {id ? <>Chapter ID <code className="id pop" key={id}>{id}</code>. </> : 'Board, class, subject and chapter number make the chapter ID. '}
              These boxes are the lines at the top of the Questions box; editing either changes both.
            </p>

            <label htmlFor="q">Questions</label>
            <Editor value={raw} onChange={setRaw} onPaste={() => setBatch((b) => b + 1)} onTyping={typedOn} issues={issues} levels={levels} boxRef={box} caret={caret} setCaret={moveCaret} />
            <div className="row">
              <button type="button" className="btn quiet" onClick={() => replaceAll(EXAMPLE, 'Example loaded')}>Try an example</button>
              <button type="button" className="btn quiet" onClick={() => replaceAll('', 'Cleared')} disabled={!raw}>Clear</button>
            </div>

            <div className="bot">
              <p><b>Starting from notes?</b> Copy this prompt into ChatGPT, Gemini or Claude, add your notes (or just the class, subject and chapter), then paste its reply into Questions.</p>
              <button type="button" className={`btn small${done === 'prompt' ? ' is-done' : ''}`} onClick={() => copy('prompt', prompt)}>
                <ActionIcon done={done === 'prompt'}><CopyIcon /></ActionIcon>Copy chatbot prompt
              </button>
            </div>
          </section>

          <section className="card stack enter" style={{ animationDelay: '120ms' }} aria-labelledby="out-h" ref={results} tabIndex={-1}>
            <h2 id="out-h">2. Check and download</h2>
            <p className="summary" role="status" aria-live="polite">
              {rows.length
                ? <><b className="pop" key={rows.length}>{plural(rows.length, 'question')}</b> in {plural(chapters, 'chapter')} and {plural(topics, 'topic')}</>
                : 'Nothing to download yet.'}
            </p>

            {issues.length > 0 && (
              <div className={`issues${errors ? ' has-error' : ''}`}>
                <b>{errors ? `${plural(errors, 'line')} left out` : ''}{errors && issues.length > errors ? ', ' : ''}{issues.length > errors ? `${plural(issues.length - errors, 'warning')}` : ''}</b>
                <ul>
                  {issues.slice(0, 50).map((x) => (
                    <li key={`${x.line}\u0000${x.text}`} className={x.level}><button type="button" className="linkish" onClick={() => goTo(x.line)}>Line {x.line}</button>: {x.text}</li>
                  ))}
                  {issues.length > 50 && <li>and {issues.length - 50} more</li>}
                </ul>
              </div>
            )}
            {notes.length > 0 && <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}

            {rows.length ? <RowsTable key={batch} rows={rows} /> : <p className="empty">Your questions will appear here, grouped by chapter and topic.</p>}

            <div className="row">
              <button type="button" className={`btn primary${done === 'csv' ? ' is-done' : ''}`} disabled={!rows.length} onClick={() => save('csv')}>
                <ActionIcon done={done === 'csv'}><DownloadIcon /></ActionIcon>Download CSV
              </button>
              <button type="button" className={`btn${done === 'json' ? ' is-done' : ''}`} disabled={!rows.length} onClick={() => save('json')}>
                <ActionIcon done={done === 'json'}><DownloadIcon /></ActionIcon>Download JSON
              </button>
              <button type="button" className={`btn quiet${done === 'sheets' ? ' is-done' : ''}`} disabled={!rows.length} onClick={() => copy('sheets', toTSV(rows))}>
                <ActionIcon done={done === 'sheets'}><CopyIcon /></ActionIcon>Copy for Sheets
              </button>
            </div>
            <p className="sr-only" aria-live="polite">{done === 'csv' || done === 'json' ? 'Downloaded.' : done ? 'Copied.' : ''}</p>
            <p className="small muted">One row per question, with the columns <code>{COLUMNS.join(', ')}</code>. The CSV imports straight into a database table.</p>
          </section>
        </div>

        <Guide />
      </main>

      <div className="floating" aria-live="polite">
        {undo ? (
          <div className="toast" key="undo">
            <span>{undo.what}.</span>
            <button type="button" className="toast-btn" onClick={restore}>Undo</button>
          </div>
        ) : rows.length > 0 && !resultsInView ? (
          <button type="button" className={`jump${errors ? ' has-error' : ''}`} key="jump" onClick={() => scrollTo(results.current)}>
            {errors ? `${plural(errors, 'line')} left out · ` : ''}{plural(rows.length, 'question')} <ArrowDownIcon />
          </button>
        ) : null}
      </div>
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
