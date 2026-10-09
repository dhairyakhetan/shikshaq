import type { ReactNode } from 'react';
import type { Row } from '../lib/format';

/** The rows as they will be stored, grouped under a heading for each chapter and topic. */
export function RowsTable({ rows }: { rows: Row[] }) {
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
        <div className="grp ch" key={`c${i}`}>
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
        <div className={`grp tp${has ? '' : ' none'}`} key={`t${i}`}>
          <span>{has ? [r.topic_no !== null && `Topic ${r.topic_no}`, r.topic].filter(Boolean).join(': ') : 'No topic'}</span>
          {r.topic_id && <code className="rid">{r.topic_id}</code>}
        </div>,
      );
    }
    out.push(
      <div className="qrow" key={i}>
        <span className="n">{r.question_no}</span>
        <span className="q">{r.question}</span>
        <span className="a">{r.answer}</span>
        {r.difficulty && <span className={`d ${r.difficulty}`}>{r.difficulty}</span>}
      </div>,
    );
  });
  return <div className="rows">{out}</div>;
}
