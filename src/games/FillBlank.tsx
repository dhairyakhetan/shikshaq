import { useEffect, useRef, useState } from 'react';
import { judge } from '../lib/text';
import type { GameProps, QA } from '../types';

type Status = 'idle' | 'wrong' | 'right' | 'close' | 'revealed';

export function FillBlank({ items, onFinish }: GameProps) {
  const [i, setI] = useState(0);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [tried, setTried] = useState(false); // had a wrong attempt on this question
  const [correct, setCorrect] = useState(0);
  const [missed, setMissed] = useState<QA[]>([]);
  const [finished, setFinished] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const go = useRef<HTMLButtonElement>(null);
  const settled = status === 'right' || status === 'close' || status === 'revealed';

  useEffect(() => box.current?.focus(), [i]);
  // The field is disabled once answered, so hand focus to the button to keep Enter working.
  useEffect(() => { if (settled) go.current?.focus(); }, [settled]);

  if (finished) {
    return (
      <div className="review">
        <h3>{missed.length ? 'Worth another look' : 'No misses – nice!'}</h3>
        {missed.map((m) => (
          <p key={m.id}>
            {m.question} → <strong>{m.answer}</strong>
          </p>
        ))}
      </div>
    );
  }

  const q = items[i];

  function next(gotIt: number, miss: QA | null) {
    const c = correct + gotIt;
    const m = miss ? [...missed, miss] : missed;
    setCorrect(c);
    setMissed(m);
    if (i + 1 < items.length) {
      setI(i + 1);
      setInput('');
      setStatus('idle');
      setTried(false);
    } else {
      setFinished(true);
      onFinish({ correct: c, total: items.length });
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (settled) return next(status === 'revealed' || tried ? 0 : 1, status === 'revealed' || tried ? q : null);
    const verdict = judge(input, [q.answer, ...q.alts]);
    if (verdict === 'wrong') { setTried(true); setStatus('wrong'); } else setStatus(verdict === 'exact' ? 'right' : 'close');
  }

  const [before, ...rest] = q.question.split(/_{2,}/);
  const hasBlank = rest.length > 0;
  const field = (
    <input
      ref={box}
      className={`blank ${status}`}
      value={input}
      disabled={settled}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      aria-label="Your answer"
      onChange={(e) => { setInput(e.target.value); if (status === 'wrong') setStatus('idle'); }}
    />
  );

  return (
    <form onSubmit={submit} className="fill">
      <progress value={i} max={items.length} />
      <p className="hint">Question {i + 1} of {items.length}</p>
      <p className="prompt">
        {hasBlank ? (<>{before}{field}{rest.join('___')}</>) : (<>{q.question}<br />{field}</>)}
      </p>

      <div className={`feedback ${status}`} role="status">
        {status === 'wrong' && 'Not quite – try again.'}
        {status === 'right' && '✓ Correct!'}
        {status === 'close' && `✓ Close enough – spelled “${q.answer}”.`}
        {status === 'revealed' && <>Answer: <strong>{q.answer}</strong></>}
      </div>

      <div className="row">
        <button ref={go} type="submit" className="btn primary" disabled={!settled && !input.trim()}>
          {settled ? (i + 1 < items.length ? 'Next' : 'Finish') : 'Check'}
        </button>
        {!settled && (
          <button type="button" className="btn" onClick={() => setStatus('revealed')}>
            Show answer
          </button>
        )}
      </div>
    </form>
  );
}
