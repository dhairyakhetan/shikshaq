import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCrossword, type CwWord } from '../lib/crossword';
import { gridWord } from '../lib/text';
import type { GameProps } from '../types';

type Dir = 'across' | 'down';
type Cell = { r: number; c: number; ch: string; n?: number; across?: number; down?: number };

const key = (r: number, c: number) => `${r},${c}`;
const other = (d: Dir): Dir => (d === 'across' ? 'down' : 'across');
const wordKeys = (w: CwWord) =>
  Array.from({ length: w.word.length }, (_, i) => key(w.row + (w.dir === 'down' ? i : 0), w.col + (w.dir === 'across' ? i : 0)));

export function Crossword({ items, onFinish }: GameProps) {
  const cw = useMemo(() => buildCrossword(items.map((i) => ({ id: i.id, word: gridWord(i.answer), clue: i.question }))), [items]);

  const cells = useMemo(() => {
    const map = new Map<string, Cell>();
    cw.words.forEach((w, idx) => {
      wordKeys(w).forEach((k, i) => {
        const [r, c] = k.split(',').map(Number);
        const cell = map.get(k) ?? { r, c, ch: w.word[i] };
        cell[w.dir] = idx;
        if (i === 0) cell.n = w.n;
        map.set(k, cell);
      });
    });
    return map;
  }, [cw]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [active, setActive] = useState<{ key: string; dir: Dir } | null>(() =>
    cw.words[0] ? { key: wordKeys(cw.words[0])[0], dir: cw.words[0].dir } : null,
  );
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const refs = useRef(new Map<string, HTMLInputElement>());
  const wasActive = useRef(false);
  const finished = useRef(false);

  // The direction to use at a cell: the wanted one if a word runs that way, else the other.
  const pickDir = (k: string, want: Dir): Dir => (cells.get(k)?.[want] !== undefined ? want : other(want));
  const activeIdx = active ? cells.get(active.key)?.[pickDir(active.key, active.dir)] : undefined;
  const activeWord = activeIdx !== undefined ? cw.words[activeIdx] : undefined;
  const activeKeys = useMemo(() => new Set(activeWord ? wordKeys(activeWord) : []), [activeWord]);

  const isRight = (k: string) => values[k] === cells.get(k)?.ch;
  const allRight = cells.size > 0 && [...cells.keys()].every(isRight);

  useEffect(() => {
    if (allRight && !finished.current) {
      finished.current = true;
      onFinish({ correct: cells.size - revealed.size, total: cells.size });
    }
  }, [allRight]);

  function go(k: string, dir: Dir) {
    setActive({ key: k, dir: pickDir(k, dir) });
    refs.current.get(k)?.focus();
  }

  /** Neighbouring cell along the word running through `k`, or null at its ends. */
  function step(k: string, dir: Dir, delta: 1 | -1): string | null {
    const [r, c] = k.split(',').map(Number);
    const nk = key(r + (dir === 'down' ? delta : 0), c + (dir === 'across' ? delta : 0));
    const here = cells.get(k)?.[dir];
    return here !== undefined && cells.get(nk)?.[dir] === here ? nk : null;
  }

  function enter(k: string, ch: string) {
    setValues((v) => ({ ...v, [k]: ch }));
    setChecked(false);
    if (ch && active) {
      const next = step(k, pickDir(k, active.dir), 1);
      if (next) go(next, active.dir);
    }
  }

  // Fallback for input that keydown can't see (mobile keyboards report key "Unidentified").
  // Emptying the field clears the cell; characters that aren't A–Z/0–9 are ignored.
  function onChange(k: string, raw: string) {
    if (raw === '') return enter(k, '');
    const ch = gridWord(raw.slice(-1));
    if (ch) enter(k, ch);
  }

  function onKeyDown(e: React.KeyboardEvent, k: string) {
    const [r, c] = k.split(',').map(Number);
    const arrows: Record<string, [number, number, Dir]> = {
      ArrowRight: [0, 1, 'across'], ArrowLeft: [0, -1, 'across'], ArrowDown: [1, 0, 'down'], ArrowUp: [-1, 0, 'down'],
    };
    const arrow = arrows[e.key];
    if (/^[a-z0-9]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Handled here, not in onChange: retyping the letter already in a cell fires no change
      // event, which would leave the cursor stuck on every crossing that is already filled.
      e.preventDefault();
      enter(k, e.key.toUpperCase());
    } else if (arrow) {
      e.preventDefault();
      const nk = key(r + arrow[0], c + arrow[1]);
      if (cells.has(nk)) go(nk, arrow[2]);
    } else if (e.key === ' ') {
      e.preventDefault();
      go(k, other(pickDir(k, active?.dir ?? 'across')));
    } else if (e.key === 'Backspace' && !values[k] && active) {
      e.preventDefault();
      const prev = step(k, pickDir(k, active.dir), -1);
      if (prev) {
        setValues((v) => ({ ...v, [prev]: '' }));
        go(prev, active.dir);
      }
    }
  }

  function reveal() {
    if (!activeWord) return;
    const ks = wordKeys(activeWord);
    setValues((v) => ({ ...v, ...Object.fromEntries(ks.map((k) => [k, cells.get(k)!.ch])) }));
    setRevealed((s) => new Set([...s, ...ks.filter((k) => !isRight(k))]));
    setChecked(false);
  }

  if (cw.words.length < 2) {
    return <p className="hint">These answers can't be interlocked into a crossword – try “New round”.</p>;
  }

  const clues = (dir: Dir) =>
    cw.words.map((w, idx) => ({ w, idx })).filter(({ w }) => w.dir === dir);

  return (
    <div className="cw">
      <div className="cw-grid" style={{ ['--cols' as string]: cw.cols, gridTemplateColumns: 'repeat(var(--cols), var(--cell))' }}>
        {Array.from({ length: cw.rows * cw.cols }, (_, i) => {
          const r = Math.floor(i / cw.cols);
          const c = i % cw.cols;
          const k = key(r, c);
          const cell = cells.get(k);
          if (!cell) return <div key={k} className="void" />;
          const cls = [
            'cell',
            activeKeys.has(k) && 'hl',
            active?.key === k && 'cur',
            checked && values[k] && !isRight(k) && 'bad',
            revealed.has(k) && 'rev',
          ].filter(Boolean).join(' ');
          return (
            <div key={k} className={cls}>
              {cell.n && <span className="num">{cell.n}</span>}
              <input
                ref={(el) => { if (el) refs.current.set(k, el); else refs.current.delete(k); }}
                value={values[k] ?? ''}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-label={`Row ${r + 1}, column ${c + 1}`}
                onPointerDown={() => { wasActive.current = active?.key === k; }}
                onClick={() => { if (wasActive.current) go(k, other(pickDir(k, active?.dir ?? 'across'))); }}
                onFocus={(e) => {
                  e.currentTarget.select();
                  setActive((a) => (a?.key === k ? a : { key: k, dir: pickDir(k, a?.dir ?? 'across') }));
                }}
                onChange={(e) => onChange(k, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, k)}
              />
            </div>
          );
        })}
      </div>

      <div className="cw-side">
        <div className="row">
          <button className="btn primary" onClick={() => setChecked(true)}>Check</button>
          <button className="btn" onClick={reveal} disabled={!activeWord}>Reveal word</button>
        </div>
        {(['across', 'down'] as Dir[]).map((dir) => (
          <div key={dir}>
            <h3>{dir === 'across' ? 'Across' : 'Down'}</h3>
            <ol className="clues">
              {clues(dir).map(({ w, idx }) => (
                <li key={`${dir}-${w.id}`}>
                  <button
                    className={['clue', idx === activeIdx && 'on', wordKeys(w).every(isRight) && 'done'].filter(Boolean).join(' ')}
                    onClick={() => go(wordKeys(w)[0], w.dir)}
                  >
                    <b>{w.n}.</b> {w.clue} <span className="len">({w.word.length})</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
        {cw.skipped.length > 0 && (
          <p className="hint">{cw.skipped.length} word(s) didn't fit this layout – “New round” mixes them in again.</p>
        )}
      </div>
    </div>
  );
}
