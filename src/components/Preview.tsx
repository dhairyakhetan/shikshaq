import type { BuiltOk } from '../lib/build';

type Of<G extends BuiltOk['game']> = Extract<BuiltOk, { game: G }>;

function Crossword({ b, showKey }: { b: Of<'crossword'>; showKey: boolean }) {
  const cell = (ch: string, r: number, c: number) => {
    const blocked = ch === '#';
    const num = blocked ? undefined : b.numAt[`${r},${c}`];
    return (
      <div key={`${r},${c}`} className={`xc${blocked ? ' blocked' : ''}`}>
        {num !== undefined && <span className="xn">{num}</span>}
        {!blocked && showKey ? ch : ''}
      </div>
    );
  };
  const list = (xs: typeof b.across) => (
    <ol className="clues">
      {xs.map((e) => (
        <li key={`${e.direction}${e.number}`}>
          <b>{e.number}.</b> {e.clue} <span className="muted">({e.length})</span> {showKey && <b className="key">{e.answer}</b>}
        </li>
      ))}
    </ol>
  );
  return (
    <div className="cols">
      <div className="grid-scroll">
        <div className="xgrid" role="img" aria-label={`Crossword grid, ${b.cols} columns by ${b.rows} rows`} style={{ gridTemplateColumns: `repeat(${b.cols}, 30px)` }}>
          {b.grid.flatMap((row, r) => row.split('').map((ch, c) => cell(ch, r, c)))}
        </div>
      </div>
      <div className="col clue-cols">
        <div><h4 style={{ color: '#3A3FB5' }}>Across</h4>{list(b.across)}</div>
        <div><h4 style={{ color: '#3A3FB5' }}>Down</h4>{list(b.down)}</div>
      </div>
    </div>
  );
}

function Matching({ b, showKey }: { b: Of<'matching'>; showKey: boolean }) {
  return (
    <div className="cols">
      <ol className="mlist">
        {b.rows.map((r) => (
          <li key={r.n} className="mq">
            <b className="mn">{r.n}</b><span>{r.q}</span>
            <span className="slot">{showKey ? r.correct : ''}</span>
          </li>
        ))}
      </ol>
      <ol className="mlist narrow">
        {b.options.map((o) => (
          <li key={o.letter} className="mo"><b className="mn">{o.letter}</b><span>{o.answer}</span></li>
        ))}
      </ol>
    </div>
  );
}

function Fill({ b, showKey }: { b: Of<'fillBlank'>; showKey: boolean }) {
  return (
    <ol className="flist">
      {b.rows.map((r) => (
        <li key={r.n}>
          <b className="fn">{r.n}</b>
          <span className="ftext">{r.before}<span className="gap">{showKey ? r.answer : ''}</span>{r.after}</span>
          {r.auto && <span className="tag">auto blank</span>}
        </li>
      ))}
    </ol>
  );
}

function Search({ b, showKey }: { b: Of<'wordSearch'>; showKey: boolean }) {
  return (
    <div className="cols">
      <div className="grid-scroll">
        <div className="sgrid" role="img" aria-label={`Word search grid, ${b.size} by ${b.size}`} style={{ gridTemplateColumns: `repeat(${b.size}, 32px)` }}>
          {b.grid.flatMap((row, r) => row.split('').map((ch, c) => {
            const hit = showKey && b.mark[r * b.size + c];
            return <div key={`${r},${c}`} className={`sc${hit ? ' hit' : (r + c) % 2 ? '' : ' alt'}`}>{ch}</div>;
          }))}
        </div>
      </div>
      <div className="col">
        <h4 style={{ color: '#B0306B' }}>Find these words</h4>
        <ul className="words">
          {b.words.map((w) => <li key={w.word}><b className="mono">{w.word}</b><span className="muted">{w.clue}</span></li>)}
        </ul>
      </div>
    </div>
  );
}

export function Preview({ b, showKey }: { b: BuiltOk; showKey: boolean }) {
  switch (b.game) {
    case 'crossword': return <Crossword b={b} showKey={showKey} />;
    case 'matching': return <Matching b={b} showKey={showKey} />;
    case 'fillBlank': return <Fill b={b} showKey={showKey} />;
    case 'wordSearch': return <Search b={b} showKey={showKey} />;
  }
}
