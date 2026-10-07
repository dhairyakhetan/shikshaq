import { useState, type ReactNode } from 'react';
import { GAMES } from '../lib/games';
import type { Parsed } from '../types';

interface Props {
  title: string;
  raw: string;
  parsed: Parsed;
  /** Which layout each question first lands in (0-based), and how many layouts there are. */
  layoutOf: Map<number, number>;
  layoutCount: number;
  onTitle: (v: string) => void;
  onRaw: (v: string) => void;
  onSample: () => void;
  onClear: () => void;
  /** Optional extra controls under the buttons (the online-saving panel). */
  extra?: ReactNode;
}

const PREVIEW_ROWS = 8;

export function DataStep({ title, raw, parsed, layoutOf, layoutCount, onTitle, onRaw, onSample, onClear, extra }: Props) {
  const [all, setAll] = useState(false);
  const n = parsed.pairs.length;
  const long = n > PREVIEW_ROWS;
  const rows = long && !all ? parsed.pairs.slice(0, PREVIEW_ROWS) : parsed.pairs;

  return (
    <section id="data" aria-labelledby="h-data" className="card step">
      <div className="step-head">
        <h2 id="h-data">1. Add your questions</h2>
        <p>One per line: <code>Question | Answer</code>, or paste 2 columns from Google Sheets.</p>
      </div>
      <p className="hint-bots">Starting from notes? A chatbot can prepare the lines for you: see the <a href="#chatbots">instructions for chatbots</a>.</p>

      <div className="cols">
        <div className="col">
          <label htmlFor="gm-title">Game title</label>
          <input id="gm-title" type="text" value={title} onChange={(e) => onTitle(e.target.value)} autoComplete="off" />
          <label htmlFor="gm-data">Questions and answers</label>
          <textarea
            id="gm-data" className="data" value={raw} onChange={(e) => onRaw(e.target.value)}
            spellCheck={false} placeholder="Capital of France | Paris"
          />
          <div className="row">
            <button type="button" className="btn" onClick={onSample}>Load sample</button>
            <button type="button" className="btn quiet" onClick={onClear}>Clear</button>
          </div>
          {extra}
        </div>

        <div className="col">
          <div className="between">
            <h3>Your data</h3>
            <span className={`count ${n ? 'ok' : 'wait'}`}>{n ? `${n} ${n === 1 ? 'pair' : 'pairs'} found` : '0 pairs'}</span>
          </div>
          <div className={`table-wrap${long && all ? ' open' : ''}`}>
            <div role="table" aria-label="Your questions and answers" className="pairs">
              <div role="row" className="prow head">
                <span role="columnheader" className="n">#</span><span role="columnheader" className="q">Question</span>
                <span role="columnheader" className="a">Answer</span><span role="columnheader" className="fits">Fits</span>
              </div>
              {rows.map((p) => {
                const fits = GAMES.filter((g) => g.fits(p));
                const layout = layoutOf.get(p.n);
                return (
                  <div role="row" className="prow" key={p.n}>
                    <span role="cell" className="n">{p.n}</span>
                    <span role="cell" className="q">{p.q}</span>
                    <span role="cell" className="a">{p.a}</span>
                    <span role="cell" className="fits"
                      aria-label={`Fits ${fits.map((g) => g.name).join(', ')}${layout !== undefined && layoutCount > 1 ? `; in layout ${layout + 1}` : ''}`}>
                      {layout !== undefined && layoutCount > 1 && <b className="lp" aria-hidden="true">L{layout + 1}</b>}
                      {GAMES.map((g) => (
                        <abbr key={g.id} title={fits.includes(g) ? g.name : `${g.name}: answer does not fit`} aria-hidden="true"
                          style={fits.includes(g) ? { background: g.tint, color: g.color } : undefined} className={fits.includes(g) ? 'on' : 'off'}>
                          {g.name[0]}
                        </abbr>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
            {!n && <p className="empty">Nothing yet. Type on the left, or press <b>Load sample</b>.</p>}
          </div>
          {long && (
            <button type="button" className="btn small quiet more" aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? `Show the first ${PREVIEW_ROWS}` : `Show all ${n} pairs`}
            </button>
          )}
          {parsed.warns.length > 0 && (
            <div role="alert" className="warn">
              <b>Check these lines:</b>
              <ul>{parsed.warns.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
