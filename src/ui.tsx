/** The parts of the page: the Questions box with its underlines, the grouped table of rows, and icons. */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { lineLevels, type Issue, type Row } from './format';

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const DownloadIcon = () => <svg {...base}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
export const CopyIcon = () => <svg {...base}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>;
export const CheckIcon = () => <svg {...base} strokeWidth={2.8}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const SendIcon = () => <svg {...base}><path d="M4 12h15M13 6l6 6-6 6" /></svg>;
export const ArrowDownIcon = () => <svg {...base}><path d="M12 5v14M6 13l6 6 6-6" /></svg>;

/** An icon that turns into a check mark for a moment after the action worked, without changing the button's size. */
export function ActionIcon({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <span className={`ico${done ? ' done' : ''}`}>
      <span className="ico-a">{children}</span>
      <span className="ico-b"><CheckIcon /></span>
    </span>
  );
}

/**
 * The Questions box. A textarea can't style parts of its text, so a copy of the text sits behind it with the same font,
 * padding and width: the copy is invisible except for the underlines on lines with a problem. The two scroll together.
 * Moving the cursor onto an underlined line shows why it is underlined.
 */
export function Editor({ value, onChange, onPaste, onTyping, issues, boxRef, caret, setCaret }: {
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

/** The rows as they will be stored, grouped under a heading for each chapter and topic. */
export function RowsTable<R extends Row>({ rows, keyOf = (_r, i) => i, extra, rowClass }: {
  rows: R[];
  /** A stable key per row, so rows that leave or arrive don't disturb the others. */
  keyOf?: (r: R, i: number) => string | number;
  /** Buttons or a note shown under a row (the Approve page). */
  extra?: (r: R) => ReactNode;
  rowClass?: (r: R) => string;
}) {
  // Rows slide in as they are added. On the first render (a paste, the example) they come in one after another,
  // briefly; later only a newly added row animates, and only once.
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  const delay = (n: number): CSSProperties | undefined => (first.current ? { animationDelay: `${Math.min(n, 16) * 22}ms` } : undefined);
  let shown = 0;
  const out: ReactNode[] = [];
  let chapter = '';
  let topic = '';
  rows.forEach((r, i) => {
    const ch = [r.chapter_id, r.board, r.class, r.subject, r.chapter_no, r.chapter].join('\u0000');
    if (ch !== chapter || i === 0) {
      chapter = ch;
      topic = '';
      const title = r.chapter || r.chapter_no !== null ? [r.chapter_no !== null && `Chapter ${r.chapter_no}`, r.chapter].filter(Boolean).join(': ') : 'No chapter';
      const meta = [r.board, r.class && `Class ${r.class}`, r.subject].filter(Boolean).join(' · ');
      out.push(
        <div className="grp ch enter" style={delay(shown++)} key={`c${i}`}>
          <span>{title}</span>
          <small>{meta}{meta && ' · '}{r.chapter_id ? <code className="rid">{r.chapter_id}</code> : 'no chapter ID yet'}</small>
        </div>,
      );
    }
    const tp = `${r.topic_no}\u0000${r.topic}`;
    if (tp !== topic) {
      topic = tp;
      const has = r.topic || r.topic_no !== null;
      out.push(
        <div className={`grp tp enter${has ? '' : ' none'}`} style={delay(shown++)} key={`t${i}`}>
          <span>{has ? [r.topic_no !== null && `Topic ${r.topic_no}`, r.topic].filter(Boolean).join(': ') : 'No topic'}</span>
          {r.topic_id && <code className="rid">{r.topic_id}</code>}
        </div>,
      );
    }
    out.push(
      <div className={`qrow enter ${rowClass?.(r) ?? ''}`} style={delay(shown++)} key={keyOf(r, i)}>
        <span className="n">{r.question_no}</span>
        <span className="q">{r.question}</span>
        <span className="a">{r.answer}</span>
        {r.difficulty && <span className={`d ${r.difficulty}`}>{r.difficulty}</span>}
        {extra && <div className="x">{extra(r)}</div>}
      </div>,
    );
  });
  return <div className="rows">{out}</div>;
}

/** "Undo" for a few seconds after an action, instead of asking "are you sure?". Render `toast` in a `.floating` box. */
export function useUndo() {
  const [undo, setUndo] = useState<{ what: string; restore: () => void } | null>(null);
  const timer = useRef(0);
  const offer = (what: string, restore: () => void) => {
    setUndo({ what, restore });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndo(null), 7000);
  };
  const toast = undo && (
    <div className="toast" key="undo">
      <span>{undo.what}.</span>
      <button type="button" className="toast-btn" onClick={() => { undo.restore(); setUndo(null); }}>Undo</button>
    </div>
  );
  return { offer, toast };
}

export function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F2A900" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 8h2M11 8h6M7 12h2M11 12h6M7 16h2M11 16h6" />
    </svg>
  );
}
