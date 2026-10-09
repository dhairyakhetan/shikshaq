/** What the three parts share on screen: the header, the grouped table of rows, the undo bar and icons. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Row } from './db';

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

const SECTIONS = [
  { key: 'formatter', name: 'Question formatter', link: 'Formatter', href: '/' },
  { key: 'hod', name: 'HoD desk', link: 'HoD desk', href: '/hod/' },
  { key: 'play', name: 'Revise', link: 'Revise', href: '/play/' },
] as const;
export type Section = (typeof SECTIONS)[number]['key'];

/**
 * The header. The three parts are separate pages that work without each other; in Shikshaq they will sit in different
 * places (teachers, HoDs, students). For the demo, the header links them, and shows how many questions are waiting.
 */
export function SectionHeader({ here, waiting = 0, children }: { here: Section; waiting?: number; children?: ReactNode }) {
  return (
    <header className="top">
      <div className="top-in">
        <span className="brand"><Logo /><span className="brand-text">{SECTIONS.find((s) => s.key === here)!.name}</span></span>
        <nav className="nav" aria-label="The three parts">
          {SECTIONS.map((s) => (
            <a key={s.key} href={s.href} className={`nav-link${s.key === here ? ' on' : ''}`} aria-current={s.key === here ? 'page' : undefined}>
              {s.link}{s.key === 'hod' && waiting > 0 && <span className="badge pop" key={waiting}>{waiting}</span>}
            </a>
          ))}
          {children}
        </nav>
      </div>
    </header>
  );
}

export function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F2A900" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 8h2M11 8h6M7 12h2M11 12h6M7 16h2M11 16h6" />
    </svg>
  );
}
