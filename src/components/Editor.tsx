import { Fragment, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { Level } from '../lib/details';
import type { Issue } from '../lib/format';

/**
 * The Questions box. A textarea can't style parts of its text, so a copy of the text sits behind it with the same font,
 * padding and width: the copy is invisible except for the underlines on lines with a problem. The two scroll together.
 * Moving the cursor onto an underlined line shows why it is underlined.
 */
export function Editor({ value, onChange, issues, levels, boxRef, caret, setCaret }: {
  value: string;
  onChange: (v: string) => void;
  issues: Issue[];
  levels: Map<number, Level>;
  boxRef: RefObject<HTMLTextAreaElement | null>;
  /** The line the cursor is on (set from outside too, when a listed problem is clicked). */
  caret: number;
  setCaret: (line: number) => void;
}) {
  const back = useRef<HTMLDivElement>(null);

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

  const onCaret = (ta: HTMLTextAreaElement) => setCaret(ta.value.slice(0, ta.selectionStart).split('\n').length);
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
            {'​'}
          </div>
        </div>
        <textarea id="q" ref={boxRef} spellCheck={false} value={value} aria-invalid={errors > 0} aria-describedby="caret-note"
          onChange={(e) => { onChange(e.target.value); onCaret(e.target); }}
          onScroll={sync} onSelect={(e) => onCaret(e.currentTarget)} onClick={(e) => onCaret(e.currentTarget)} onKeyUp={(e) => onCaret(e.currentTarget)}
          placeholder={'Any format works, for example:\n\nTopic 1: Chemical equations\nWhat is ...? | Answer\n1. What is ...? Ans: Answer\nQ. What is ...?\nAns. Answer'} />
      </div>
      <p id="caret-note" className={`caret-note${here.length ? ` ${here.some((x) => x.level === 'error') ? 'error' : 'warn'}` : ''}`} aria-live="polite">
        {here.length
          ? <><b>Line {caret}:</b> {here.map((x) => x.text).join(' ')}</>
          : issues.length
            ? <><span className="key error">Red</span> lines are left out. <span className="key warn">Amber</span> lines are kept, but check them. Put the cursor on one to see why.</>
            : ' '}
      </p>
    </>
  );
}
