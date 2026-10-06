import { useMemo, useRef, useState } from 'react';
import { buildWordSearch, wordCells } from '../lib/wordsearch';
import { gridWord } from '../lib/text';
import type { GameProps } from '../types';

type Pt = [number, number];
const COLORS = 6;

/** Cells on the straight line from `a` towards `b`, snapped to the nearest of the 8 directions. */
function line(a: Pt, b: Pt, size: number): Pt[] {
  const dr = b[0] - a[0];
  const dc = b[1] - a[1];
  const octant = Math.round(Math.atan2(dr, dc) / (Math.PI / 4));
  const sr = Math.round(Math.sin((octant * Math.PI) / 4));
  const sc = Math.round(Math.cos((octant * Math.PI) / 4));
  const len = Math.max(Math.abs(dr), Math.abs(dc));
  const out: Pt[] = [];
  for (let i = 0; i <= len; i++) {
    const r = a[0] + sr * i;
    const c = a[1] + sc * i;
    if (r < 0 || r >= size || c < 0 || c >= size) break;
    out.push([r, c]);
  }
  return out;
}

export function WordSearch({ items, onFinish }: GameProps) {
  const ws = useMemo(() => buildWordSearch(items.map((i) => ({ id: i.id, word: gridWord(i.answer), clue: i.question }))), [items]);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ from: Pt; cells: Pt[] } | null>(null);
  const [showWords, setShowWords] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const finished = useRef(false);

  const foundCells = useMemo(() => {
    const m = new Map<string, number>();
    ws.words.forEach((w, idx) => {
      if (found.has(w.id)) wordCells(w).forEach(([r, c]) => m.set(`${r},${c}`, idx % COLORS));
    });
    return m;
  }, [ws, found]);

  function finish(done: Set<string>) {
    if (finished.current) return;
    finished.current = true;
    onFinish({ correct: done.size, total: ws.words.length });
  }

  function cellAt(e: React.PointerEvent): Pt {
    const box = board.current!.getBoundingClientRect();
    const clamp = (n: number) => Math.min(ws.size - 1, Math.max(0, n));
    return [clamp(Math.floor(((e.clientY - box.top) / box.height) * ws.size)), clamp(Math.floor(((e.clientX - box.left) / box.width) * ws.size))];
  }

  function down(e: React.PointerEvent) {
    if (gaveUp || found.size === ws.words.length) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const from = cellAt(e);
    setDrag({ from, cells: [from] });
  }

  function move(e: React.PointerEvent) {
    if (drag) setDrag({ from: drag.from, cells: line(drag.from, cellAt(e), ws.size) });
  }

  function up() {
    if (!drag) return;
    const text = drag.cells.map(([r, c]) => ws.grid[r][c]).join('');
    const hit = ws.words.find((w) => !found.has(w.id) && (w.word === text || w.word === [...text].reverse().join('')));
    setDrag(null);
    if (hit && drag.cells.length > 1) {
      const next = new Set(found).add(hit.id);
      setFound(next);
      if (next.size === ws.words.length) finish(next);
    }
  }

  function giveUp() {
    setGaveUp(true);
    setFound(new Set(ws.words.map((w) => w.id)));
    finish(found);
  }

  if (ws.words.length < 2) return <p className="hint">Not enough short words for a word search – try “New round”.</p>;

  const selected = new Set(drag?.cells.map(([r, c]) => `${r},${c}`));

  return (
    <div className="ws">
      <div
        ref={board}
        className="ws-grid"
        style={{ ['--cols' as string]: ws.size, gridTemplateColumns: `repeat(${ws.size}, 1fr)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
      >
        {ws.grid.flatMap((row, r) =>
          row.map((ch, c) => {
            const k = `${r},${c}`;
            const color = foundCells.get(k);
            const cls = ['wcell', selected.has(k) && 'pick', color !== undefined && `f${color}`].filter(Boolean).join(' ');
            return <div key={k} className={cls}>{ch}</div>;
          }),
        )}
      </div>

      <div className="cw-side">
        <p className="hint">Drag across the letters to answer each clue. {found.size}/{ws.words.length} found.</p>
        <ul className="words">
          {ws.words.map((w) => (
            <li key={w.id} className={found.has(w.id) ? 'found' : ''}>
              {w.clue} <span className="len">({w.word.length})</span>
              {(found.has(w.id) || showWords) && <strong> → {w.word}</strong>}
            </li>
          ))}
        </ul>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={showWords} onChange={(e) => setShowWords(e.target.checked)} /> Show words
          </label>
          <button className="btn" onClick={giveUp} disabled={gaveUp || found.size === ws.words.length}>Give up</button>
        </div>
        {ws.skipped.length > 0 && <p className="hint">{ws.skipped.length} word(s) didn't fit – “New round” mixes them in again.</p>}
      </div>
    </div>
  );
}
