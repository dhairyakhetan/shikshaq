/**
 * The four games, playable: matching (tap a question, then its answer), fill in the blank (type into the gap),
 * word search (drag across the letters, or tap the first and last letter) and crossword (tap a square and type).
 * Each takes a puzzle already made and checked by src/games, and calls `onDone` when it is solved.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Game } from './games';
import type { Crossword } from './games/crossword';
import type { FillIn } from './games/fill';
import type { Matching } from './games/matching';
import { sameAnswer } from './games/shared';
import type { WordSearch } from './games/wordsearch';
import { CheckIcon } from './ui';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function GameView({ game, onNext }: { game: Game; onNext: () => void }) {
  if (game.type === 'matching') return <MatchingGame g={game} onNext={onNext} />;
  if (game.type === 'fill') return <FillGame g={game} onNext={onNext} />;
  if (game.type === 'wordsearch') return <WordSearchGame g={game} onNext={onNext} />;
  return <CrosswordGame g={game} onNext={onNext} />;
}

function Progress({ done, total, children }: { done: number; total: number; children?: ReactNode }) {
  return (
    <div className="progress">
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><span style={{ width: `${(100 * done) / total}%` }} /></div>
      <span className="small muted">{done} of {total}</span>
      {children}
    </div>
  );
}

function Solved({ text, onNext }: { text: string; onNext: () => void }) {
  return (
    <div className="solved" role="status">
      <span className="solved-icon"><CheckIcon /></span>
      <b>{text}</b>
      <button type="button" className="btn primary small" onClick={onNext}>Next puzzle</button>
    </div>
  );
}

// ---------------------------------------------------------------- matching

function MatchingGame({ g, onNext }: { g: Matching; onNext: () => void }) {
  const [sel, setSel] = useState<{ side: 'left' | 'right'; id: string } | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);

  const pick = (side: 'left' | 'right', id: string) => {
    if (matched.includes(id) && side === 'left') return;
    if (!sel || sel.side === side) { setSel(sel?.side === side && sel.id === id ? null : { side, id }); return; }
    if (sel.id === id) setMatched([...matched, id]);
    else {
      setWrong([`${sel.side}:${sel.id}`, `${side}:${id}`]);
      setMistakes((m) => m + 1);
      setTimeout(() => setWrong([]), 450);
    }
    setSel(null);
  };
  const cls = (side: 'left' | 'right', id: string) => {
    const n = matched.indexOf(id);
    return `tile${n >= 0 ? ` matched c${n % 6}` : ''}${sel?.side === side && sel.id === id ? ' sel' : ''}${wrong.includes(`${side}:${id}`) ? ' shake' : ''}`;
  };
  const done = matched.length === g.left.length;

  return (
    <div className="game matching">
      <p className="how">Tap a question, then its answer.</p>
      <Progress done={matched.length} total={g.left.length} />
      <div className="match-cols">
        <ul aria-label="Questions">
          {g.left.map((x) => (
            <li key={x.id}><button type="button" data-id={x.id} className={cls('left', x.id)} disabled={matched.includes(x.id)} onClick={() => pick('left', x.id)}>{x.text}</button></li>
          ))}
        </ul>
        <ul aria-label="Answers">
          {g.right.map((x) => (
            <li key={x.id}><button type="button" data-id={x.id} className={cls('right', x.id)} disabled={matched.includes(x.id)} onClick={() => pick('right', x.id)}>{x.text}</button></li>
          ))}
        </ul>
      </div>
      {done && <Solved text={mistakes ? `All matched, with ${plural(mistakes, 'wrong try', 'wrong tries')}.` : 'All matched, first time!'} onNext={onNext} />}
    </div>
  );
}

// ---------------------------------------------------------------- fill in the blank

function FillGame({ g, onNext }: { g: FillIn; onNext: () => void }) {
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [state, setState] = useState<Record<string, 'right' | 'wrong' | 'shown'>>({});
  const [tries, setTries] = useState<Record<string, number>>({});
  const check = (id: string, answer: string) => {
    const v = typed[id] ?? '';
    if (!v.trim() || state[id] === 'right' || state[id] === 'shown') return;
    if (sameAnswer(v, answer)) setState((s) => ({ ...s, [id]: 'right' }));
    else {
      setState((s) => ({ ...s, [id]: 'wrong' }));
      setTries((t) => ({ ...t, [id]: (t[id] ?? 0) + 1 }));
    }
  };
  const solved = g.rows.filter((r) => state[r.id] === 'right' || state[r.id] === 'shown').length;
  const right = g.rows.filter((r) => state[r.id] === 'right').length;

  return (
    <div className="game fill">
      <p className="how">Type the missing word or words, then press Enter.</p>
      <Progress done={solved} total={g.rows.length}>
        <button type="button" className="btn small quiet" onClick={() => g.rows.forEach((r) => check(r.id, r.answer))}>Check all</button>
      </Progress>
      <ol className="fill-list">
        {g.rows.map((r) => {
          const st = state[r.id];
          const locked = st === 'right' || st === 'shown';
          return (
            <li key={r.id} className={st ?? ''}>
              <span>{r.before}</span>
              <input
                type="text" aria-label="Answer" autoComplete="off" autoCapitalize="off" spellCheck={false}
                className={`gap ${st ?? ''}${st === 'wrong' ? ' shake' : ''}`} key={`${st}${tries[r.id] ?? 0}`}
                style={{ width: `${Math.min(26, Math.max(7, r.answer.length + 2))}ch` }}
                value={st === 'shown' ? r.answer : typed[r.id] ?? ''} readOnly={locked}
                onChange={(e) => { setTyped((t) => ({ ...t, [r.id]: e.target.value })); if (st === 'wrong') setState((s) => { const n = { ...s }; delete n[r.id]; return n; }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') check(r.id, r.answer); }}
                onBlur={() => check(r.id, r.answer)}
              />
              <span>{r.after}</span>
              {st === 'right' && <span className="tick" aria-label="Right"><CheckIcon /></span>}
              {st === 'wrong' && (tries[r.id] ?? 0) >= 2 && (
                <button type="button" className="chip" onClick={() => setState((s) => ({ ...s, [r.id]: 'shown' }))}>Show answer</button>
              )}
            </li>
          );
        })}
      </ol>
      {solved === g.rows.length && <Solved text={`${right} of ${g.rows.length} right without help.`} onNext={onNext} />}
    </div>
  );
}

// ---------------------------------------------------------------- word search

type Cell = [number, number];
const cellsOf = (w: WordSearch['words'][number]): Cell[] => Array.from({ length: w.word.length }, (_, i) => [w.row + w.dr * i, w.col + w.dc * i]);
const sameCells = (a: Cell[], b: Cell[]) => a.length === b.length && (a.every((c, i) => c[0] === b[i][0] && c[1] === b[i][1]) || a.every((c, i) => c[0] === b[b.length - 1 - i][0] && c[1] === b[b.length - 1 - i][1]));

/** A straight line of cells from `a` towards `b`, snapped to the nearest of the eight directions. */
function line(a: Cell, b: Cell, n: number): Cell[] {
  const dr = b[0] - a[0];
  const dc = b[1] - a[1];
  if (!dr && !dc) return [a];
  const oct = Math.round(Math.atan2(dr, dc) / (Math.PI / 4));
  const sr = Math.round(Math.sin((oct * Math.PI) / 4));
  const sc = Math.round(Math.cos((oct * Math.PI) / 4));
  let len = Math.max(Math.abs(dr), Math.abs(dc));
  while (len > 0 && (a[0] + sr * len < 0 || a[0] + sr * len >= n || a[1] + sc * len < 0 || a[1] + sc * len >= n)) len--;
  return Array.from({ length: len + 1 }, (_, i) => [a[0] + sr * i, a[1] + sc * i]);
}

function WordSearchGame({ g, onNext }: { g: WordSearch; onNext: () => void }) {
  const [found, setFound] = useState<string[]>([]);
  const [path, setPath] = useState<Cell[]>([]);
  const [anchor, setAnchor] = useState<Cell | null>(null); // first tap of tap-tap selection
  const [miss, setMiss] = useState(false);
  const [showWords, setShowWords] = useState(false);
  const drag = useRef<Cell | null>(null);
  const moved = useRef(false);

  const color = useMemo(() => {
    const m = new Map<string, number>();
    found.forEach((id, i) => { for (const c of cellsOf(g.words.find((w) => w.id === id)!)) m.set(`${c[0]},${c[1]}`, i % 6); });
    return m;
  }, [found, g.words]);
  const onPath = new Set(path.map((c) => `${c[0]},${c[1]}`));

  const cellAt = (x: number, y: number): Cell | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-r]');
    return el ? [Number(el.dataset.r), Number(el.dataset.c)] : null;
  };
  const finish = (cells: Cell[]) => {
    const hit = g.words.find((w) => !found.includes(w.id) && sameCells(cellsOf(w), cells));
    if (hit) setFound((f) => [...f, hit.id]);
    else if (cells.length > 1) { setMiss(true); setTimeout(() => setMiss(false), 400); }
    setPath([]);
  };

  return (
    <div className="game wordsearch">
      <p className="how">Drag across a word, or tap its first and last letter. Words read forwards: across, down or diagonally.</p>
      <Progress done={found.length} total={g.words.length}>
        <label className="small toggle"><input type="checkbox" checked={showWords} onChange={(e) => setShowWords(e.target.checked)} /> Show the words</label>
      </Progress>
      <div className="ws-layout">
        <div
          className={`ws-grid${miss ? ' shake' : ''}`} style={{ ['--n' as string]: g.size }} role="grid" aria-label="Word search"
          onPointerDown={(e) => {
            const c = cellAt(e.clientX, e.clientY);
            if (!c) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            moved.current = false;
            if (anchor) { drag.current = anchor; setPath(line(anchor, c, g.size)); setAnchor(null); moved.current = true; return; }
            drag.current = c;
            setPath([c]);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const c = cellAt(e.clientX, e.clientY);
            if (!c) return;
            const p = line(drag.current, c, g.size);
            if (p.length > 1) moved.current = true;
            setPath(p);
          }}
          onPointerUp={() => {
            if (!drag.current) return;
            const start = drag.current;
            drag.current = null;
            if (!moved.current) { setAnchor(start); return; } // a tap: wait for the last letter
            finish(path);
          }}
        >
          {g.grid.map((row, r) => [...row].map((ch, c) => {
            const k = `${r},${c}`;
            const col = color.get(k);
            return (
              <span key={k} data-r={r} data-c={c} role="gridcell"
                className={`ws-cell${col !== undefined ? ` found c${col}` : ''}${onPath.has(k) ? ' on' : ''}${anchor && anchor[0] === r && anchor[1] === c ? ' anchor' : ''}`}>{ch}</span>
            );
          }))}
        </div>
        <ol className="ws-clues">
          {g.words.map((w) => {
            const got = found.includes(w.id);
            return (
              <li key={w.id} className={got ? 'got' : ''}>
                {showWords || got ? <b>{w.word}</b> : <span>{w.clue} <span className="muted">({w.word.length})</span></span>}
                {got && !showWords && <span className="muted"> · {w.clue}</span>}
              </li>
            );
          })}
        </ol>
      </div>
      {found.length === g.words.length && <Solved text="All words found!" onNext={onNext} />}
    </div>
  );
}

// ---------------------------------------------------------------- crossword

function CrosswordGame({ g, onNext }: { g: Crossword; onNext: () => void }) {
  const blank = () => g.grid.map((row) => [...row].map((ch) => (ch === '#' ? '#' : '')));
  const [letters, setLetters] = useState<string[][]>(blank);
  const [cur, setCur] = useState<{ r: number; c: number; dir: 'across' | 'down' }>(() => ({ r: g.clues[0].row, c: g.clues[0].col, dir: g.clues[0].dir }));
  const [checked, setChecked] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const numberAt = useMemo(() => new Map(g.clues.map((cl) => [`${cl.row},${cl.col}`, cl.n])), [g.clues]);
  const cellsOfClue = (cl: Crossword['clues'][number]): Cell[] => Array.from({ length: cl.answer.length }, (_, i) => (cl.dir === 'across' ? [cl.row, cl.col + i] : [cl.row + i, cl.col]));
  const clueAt = (r: number, c: number, dir: 'across' | 'down') => g.clues.find((cl) => cl.dir === dir && cellsOfClue(cl).some(([y, x]) => y === r && x === c));
  const clue = clueAt(cur.r, cur.c, cur.dir) ?? clueAt(cur.r, cur.c, cur.dir === 'across' ? 'down' : 'across')!;
  const inWord = new Set(cellsOfClue(clue).map(([y, x]) => `${y},${x}`));
  const done = g.grid.every((row, r) => [...row].every((ch, c) => ch === '#' || letters[r][c] === ch));

  useEffect(() => { input.current?.focus({ preventScroll: true }); }, [cur]);

  const select = (r: number, c: number) => {
    if (g.grid[r][c] === '#') return;
    const both = clueAt(r, c, 'across') && clueAt(r, c, 'down');
    const dir = r === cur.r && c === cur.c && both ? (cur.dir === 'across' ? 'down' : 'across') : clueAt(r, c, cur.dir) ? cur.dir : clueAt(r, c, 'across') ? 'across' : 'down';
    setCur({ r, c, dir });
  };
  const step = (by: 1 | -1) => {
    const cells = cellsOfClue(clue);
    const i = cells.findIndex(([y, x]) => y === cur.r && x === cur.c);
    const next = cells[i + by];
    if (next) setCur({ r: next[0], c: next[1], dir: clue.dir });
  };
  const type = (ch: string) => {
    if (done) return;
    setLetters((L) => L.map((row, r) => row.map((v, c) => (r === cur.r && c === cur.c ? ch : v))));
    setChecked(false);
    if (ch) step(1);
  };
  const jump = (cl: Crossword['clues'][number]) => setCur({ r: cl.row, c: cl.col, dir: cl.dir });
  const reveal = (cells: Cell[]) => setLetters((L) => L.map((row, r) => row.map((v, c) => (cells.some(([y, x]) => y === r && x === c) ? g.grid[r][c] : v))));

  const keys = (e: KeyboardEvent) => {
    if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); type(e.key.toUpperCase()); }
    else if (e.key === 'Backspace') {
      e.preventDefault();
      if (letters[cur.r][cur.c]) { type(''); return; }
      // on an empty square, go back one and clear that one
      const cells = cellsOfClue(clue);
      const prev = cells[cells.findIndex(([y, x]) => y === cur.r && x === cur.c) - 1];
      if (!prev) return;
      setCur({ r: prev[0], c: prev[1], dir: clue.dir });
      setLetters((L) => L.map((row, r) => row.map((v, c) => (r === prev[0] && c === prev[1] ? '' : v))));
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key as 'ArrowUp']!;
      const r = cur.r + dr, c = cur.c + dc;
      if (g.grid[r]?.[c] && g.grid[r][c] !== '#') setCur({ r, c, dir: dr ? 'down' : 'across' });
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const i = g.clues.indexOf(clue);
      jump(g.clues[(i + (e.shiftKey ? g.clues.length - 1 : 1)) % g.clues.length]);
    }
  };

  const filled = g.clues.filter((cl) => cellsOfClue(cl).every(([y, x]) => letters[y][x] === g.grid[y][x])).length;

  return (
    <div className="game crossword">
      <p className="how">Tap a square and type. Tap it again to switch between across and down.</p>
      <Progress done={filled} total={g.clues.length}>
        <button type="button" className="btn small quiet" onClick={() => setChecked(true)}>Check</button>
        <button type="button" className="btn small quiet" onClick={() => reveal(cellsOfClue(clue))}>Reveal word</button>
      </Progress>
      <p className="cw-clue" aria-live="polite"><b>{clue.n} {clue.dir}</b> {clue.clue} <span className="muted">{clue.enumeration}</span></p>
      <div className="cw-layout">
        <div className="cw-wrap">
          <div className="cw-grid" style={{ ['--cols' as string]: g.cols }} onClick={() => input.current?.focus({ preventScroll: true })}>
            {g.grid.map((row, r) => [...row].map((ch, c) => {
              const k = `${r},${c}`;
              if (ch === '#') return <span key={k} className="cw-cell block" />;
              const v = letters[r][c];
              const bad = checked && v && v !== ch;
              return (
                <button key={k} type="button" data-r={r} data-c={c} aria-label={`Row ${r + 1}, column ${c + 1}${v ? `, ${v}` : ''}`}
                  className={`cw-cell${inWord.has(k) ? ' word' : ''}${r === cur.r && c === cur.c ? ' cur' : ''}${bad ? ' bad' : ''}${done ? ' done' : ''}`}
                  onClick={(e) => { e.stopPropagation(); select(r, c); }}>
                  {numberAt.has(k) && <span className="cw-n">{numberAt.get(k)}</span>}
                  <span className="cw-l">{v}</span>
                </button>
              );
            }))}
          </div>
          <input ref={input} className="cw-input" aria-label="Type a letter" autoCapitalize="characters" autoComplete="off" spellCheck={false} value=""
            onKeyDown={keys}
            onChange={(e) => { const ch = e.target.value.slice(-1); if (/^[a-z]$/i.test(ch)) type(ch.toUpperCase()); }} />
        </div>
        <div className="cw-clues">
          {(['across', 'down'] as const).map((dir) => (
            <div key={dir}>
              <h4>{dir === 'across' ? 'Across' : 'Down'}</h4>
              <ol>
                {g.clues.filter((cl) => cl.dir === dir).map((cl) => {
                  const ok = cellsOfClue(cl).every(([y, x]) => letters[y][x] === g.grid[y][x]);
                  return (
                    <li key={`${cl.n}${dir}`}>
                      <button type="button" data-n={cl.n} data-dir={dir} className={`cw-cl${cl === clue ? ' on' : ''}${ok ? ' ok' : ''}`} onClick={() => jump(cl)}>
                        <b>{cl.n}</b> {cl.clue} <span className="muted">{cl.enumeration}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </div>
      {done && <Solved text="Crossword complete!" onNext={onNext} />}
    </div>
  );
}
