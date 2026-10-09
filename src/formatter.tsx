/** The question formatter: teachers paste questions in any format, check them, and send them for approval or download them. */
import { Fragment, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { checkDetail, DETAIL_KEYS, detailLine, detailsId, LABEL, readDetails, standardDetail, writeDetail, type DetailKey } from './details';
import { COLUMNS, sendBatch, toCSV, toJSON, toTSV } from './db';
import { baseName, EXAMPLE, format, lineLevels, missing, visibleIssues, type Issue } from './format';
import { Guide } from './Guide';
import { ActionIcon, ArrowDownIcon, CopyIcon, download, DownloadIcon, Link, RowsTable, SendIcon, useUndo } from './ui';

const HINT: Record<DetailKey, string> = { board: 'CBSE', class: '10', subject: 'Science', chapter: '1: Chemical Reactions' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const motion = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** Scrolls smoothly to a part of the page and moves keyboard focus there, without adding "#..." to the address. */
function scrollToEl(el: HTMLElement | null) {
  if (!el) return;
  el.scrollIntoView({ behavior: motion(), block: 'start' });
  el.focus({ preventScroll: true });
}

/** `teacher` is the signed-in person's name; `onSent` tells the header to count the waiting questions again. */
export function Formatter({ teacher, onSent }: { teacher: string; onSent: () => void }) {
  const [raw, setRaw] = useState('');
  const [done, setDone] = useState('');
  const [caret, setCaret] = useState(0);
  /** Bumped when the whole text is replaced (paste, example, clear), so the table plays its entrance again. */
  const [batch, setBatch] = useState(0);
  const { offer, toast } = useUndo();
  const [sent, setSent] = useState<{ batchId: string | null; sent: number; noId: number; already: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [resultsInView, setResultsInView] = useState(true);
  /** The line being typed on in the Questions box, and the detail box being typed in: problems there wait until they move on. */
  const [typingLine, setTypingLine] = useState<number | null>(null);
  const [typingBox, setTypingBox] = useState<DetailKey | null>(null);
  const boxTimer = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const results = useRef<HTMLElement>(null);

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
    const before = raw;
    if (before.trim() && before !== next) {
      offer(what, () => {
        setRaw(before);
        setBatch((b) => b + 1);
        box.current?.focus({ preventScroll: true });
      });
    }
    setRaw(next);
    setBatch((b) => b + 1);
  };

  /** Sends the questions to the HoD as one batch. */
  const ready = rows.filter((r) => r.chapter_id).length;
  const send = async () => {
    setSending(true);
    setSent(null);
    setSendError('');
    try {
      const result = await sendBatch(rows);
      setSent(result);
      if (result.sent) { flash('send'); onSent(); }
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const prompt = `Open ${location.origin}/ and follow the instructions on that page to turn the material below into questions and answers.\n\nMaterial (my notes, my questions, or just the board, class, subject and chapter):\n`;

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
                    <label htmlFor={`d-${k}`}>{LABEL[k]}</label>
                    <input id={`d-${k}`} type="text" value={details[k]} placeholder={`e.g. ${HINT[k]}`} autoComplete="off"
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
            <Editor value={raw} onChange={setRaw} onPaste={() => setBatch((b) => b + 1)} onTyping={typedOn} issues={issues} boxRef={box} caret={caret} setCaret={moveCaret} />
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

            <form className="send" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <h3>3. Send for approval</h3>
              <p className="small muted">Your HoD checks the questions on the HoD desk. Only approved ones go into the question bank and the games.</p>
              <div className="row signed-in">
                <button type="submit" className={`btn dark${done === 'send' ? ' is-done' : ''}`} disabled={!ready || sending}>
                  <ActionIcon done={done === 'send'}><SendIcon /></ActionIcon>{sending ? 'Sending…' : ready ? `Send ${plural(ready, 'question')}` : 'Send'}
                </button>
                <p className="small muted">Sending as <b>{teacher}</b>.</p>
              </div>
              {rows.length > ready && <p className="small muted">{plural(rows.length - ready, 'question has', 'questions have')} no chapter ID and can't be sent yet. Fill in the boxes above.</p>}
              {sent && (
                <p className={`sent-note ${sent.sent ? 'ok' : 'warn'}`} key={JSON.stringify(sent)}>
                  {sent.sent ? <>Sent {plural(sent.sent, 'question')} to the HoD as batch <b>{sent.batchId}</b>. </> : 'Nothing new to send. '}
                  {sent.already > 0 && <>{plural(sent.already, 'question was', 'questions were')} already sent, so {sent.already === 1 ? 'it was' : 'they were'} skipped. </>}
                  {sent.sent > 0 && <Link className="linkish" href="/hod/">Open the HoD desk</Link>}
                </p>
              )}
              {sendError && <p className="sent-note warn" role="alert">Couldn't send: {sendError}</p>}
            </form>
          </section>
        </div>

        <Guide />
      </main>

      <div className="floating" aria-live="polite">
        {toast || (rows.length > 0 && !resultsInView ? (
          <button type="button" className={`jump${errors ? ' has-error' : ''}`} key="jump" onClick={() => scrollToEl(results.current)}>
            {errors ? `${plural(errors, 'line')} left out · ` : ''}{plural(rows.length, 'question')} <ArrowDownIcon />
          </button>
        ) : null)}
      </div>
    </>
  );
}

/**
 * The Questions box. A textarea can't style parts of its text, so a copy of the text sits behind it with the same font,
 * padding and width: the copy is invisible except for the underlines on lines with a problem. The two scroll together.
 * Moving the cursor onto an underlined line shows why it is underlined.
 */
function Editor({ value, onChange, onPaste, onTyping, issues, boxRef, caret, setCaret }: {
  value: string;
  onChange: (v: string) => void;
  onPaste: () => void;
  /** The line just typed on (null when the box is left): problems there wait until the cursor moves on. */
  onTyping: (line: number | null) => void;
  issues: Issue[];
  boxRef: RefObject<HTMLTextAreaElement | null>;
  /** The line the cursor is on (set from outside too, when a listed problem is clicked). */
  caret: number;
  setCaret: (line: number) => void;
}) {
  const back = useRef<HTMLDivElement>(null);
  const pasted = useRef(false); // a paste is finished text: check all of it at once

  const sync = () => {
    const ta = boxRef.current;
    const b = back.current;
    if (!ta || !b) return;
    (b.firstElementChild as HTMLElement).style.width = `${ta.clientWidth}px`; // excludes the textarea's scrollbar
    b.scrollTop = ta.scrollTop;
    b.scrollLeft = ta.scrollLeft;
  };
  useLayoutEffect(sync);
  useEffect(() => {
    const ta = boxRef.current;
    if (!ta || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(ta);
    return () => ro.disconnect();
  }, []);

  const lineOf = (ta: HTMLTextAreaElement) => ta.value.slice(0, ta.selectionStart).split('\n').length;
  const onCaret = (ta: HTMLTextAreaElement) => setCaret(lineOf(ta));
  const levels = lineLevels(issues);
  const here = issues.filter((x) => x.line === caret);
  const errors = issues.filter((x) => x.level === 'error').length;

  return (
    <>
      <div className="editor">
        <div className="backdrop" ref={back} aria-hidden="true">
          <div className="backdrop-in">
            {value.split('\n').map((l, i) => {
              const level = levels.get(i + 1);
              const body = l.trim();
              const nl = i > 0 ? '\n' : '';
              if (!level || !body) return <Fragment key={i}>{nl}{l}</Fragment>;
              const lead = l.slice(0, l.indexOf(body[0]));
              return <Fragment key={i}>{nl}{lead}<span className={`mark ${level}`}>{body}</span>{l.slice(lead.length + body.length)}</Fragment>;
            })}
            {/* keeps an empty last line as tall as the textarea draws it */}
            {'\u200b'}
          </div>
        </div>
        <textarea id="q" ref={boxRef} spellCheck={false} value={value} aria-invalid={errors > 0} aria-describedby="caret-note"
          onChange={(e) => {
            onChange(e.target.value);
            if (pasted.current) { pasted.current = false; onCaret(e.target); onTyping(null); } else onTyping(lineOf(e.target));
          }}
          onPaste={() => { pasted.current = true; onPaste(); }}
          onFocus={(e) => onCaret(e.currentTarget)} onBlur={() => onTyping(null)}
          onScroll={sync} onSelect={(e) => onCaret(e.currentTarget)} onClick={(e) => onCaret(e.currentTarget)} onKeyUp={(e) => onCaret(e.currentTarget)}
          placeholder={'Any format works, for example:\n\nTopic 1: Chemical equations\nWhat is ...? | Answer\n1. What is ...? Ans: Answer\nQ. What is ...?\nAns. Answer'} />
      </div>
      <p id="caret-note" className={`caret-note${here.length ? ` ${here.some((x) => x.level === 'error') ? 'error' : 'warn'}` : ''}`} aria-live="polite">
        {here.length
          ? <span className="swap" key={`l${caret}`}><b>Line {caret}:</b> {here.map((x) => x.text).join(' ')}</span>
          : issues.length
            ? <span className="swap" key="hint"><span className="key error">Red</span> lines are left out. <span className="key warn">Amber</span> lines are kept, but check them. Put the cursor on one to see why.</span>
            : '\u00a0'}
      </p>
    </>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
