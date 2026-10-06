import { useEffect, useMemo, useRef, useState } from 'react';
import { shuffle } from '../lib/shuffle';
import { norm } from '../lib/text';
import type { GameProps } from '../types';

type Pick = { side: 'q' | 'a'; id: string };

export function Matching({ items, onFinish }: GameProps) {
  // Answers are shuffled once per round, and never left in question order.
  const tiles = useMemo(() => {
    const base = items.map((i) => ({ id: i.id, text: i.answer }));
    let mixed = shuffle(base);
    for (let n = 0; n < 10 && items.length > 1 && mixed.every((t, i) => t.id === items[i].id); n++) mixed = shuffle(base);
    return mixed;
  }, [items]);

  const [picked, setPicked] = useState<Pick | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set()); // keys like "q:row-2" / "a:row-5"
  const [mistakes, setMistakes] = useState(0);
  const [wrong, setWrong] = useState<{ q: string; a: string } | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function choose(side: Pick['side'], id: string) {
    if (wrong) return;
    if (!picked || picked.side === side) return setPicked(picked?.id === id && picked.side === side ? null : { side, id });

    const qId = side === 'q' ? id : picked.id;
    const aId = side === 'a' ? id : picked.id;
    const question = items.find((i) => i.id === qId)!;
    const tile = tiles.find((t) => t.id === aId)!;
    setPicked(null);

    if (norm(question.answer) === norm(tile.text)) {
      // qId and aId differ when two questions share an answer, so lock exactly the two picked.
      const next = new Set(done).add(`q:${qId}`).add(`a:${aId}`);
      setDone(next);
      if (items.every((i) => next.has(`q:${i.id}`))) onFinish({ correct: items.length, total: items.length + mistakes });
    } else {
      setMistakes((m) => m + 1);
      setWrong({ q: qId, a: aId });
      timer.current = window.setTimeout(() => setWrong(null), 700);
    }
  }

  const cls = (side: Pick['side'], id: string) =>
    ['tile', done.has(`${side}:${id}`) && 'ok', picked?.side === side && picked.id === id && 'sel', wrong?.[side] === id && 'bad']
      .filter(Boolean)
      .join(' ');

  return (
    <div>
      <p className="hint">Tap a question, then its answer. Mistakes: {mistakes}</p>
      <div className="match">
        <div className="col">
          {items.map((i) => (
            <button key={i.id} className={cls('q', i.id)} disabled={done.has(`q:${i.id}`)} onClick={() => choose('q', i.id)}>
              {i.question}
            </button>
          ))}
        </div>
        <div className="col">
          {tiles.map((t) => (
            <button key={t.id} className={cls('a', t.id)} disabled={done.has(`a:${t.id}`)} onClick={() => choose('a', t.id)}>
              {t.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
