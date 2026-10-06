import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useDataset } from '../App';
import { eligible, GAMES } from '../games';
import { recordScore } from '../lib/scores';
import { shuffle } from '../lib/shuffle';
import type { GameId, Outcome } from '../types';
import { useFilters } from './filters';

export function Play() {
  const { game: id } = useParams();
  const def = GAMES[id as GameId];
  const { items } = useDataset();
  const f = useFilters();
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<{ pct: number; best: number; outcome: Outcome } | null>(null);
  const recorded = useRef(false);

  const pool = useMemo(() => (def ? eligible(def, items.filter(f.apply)) : []), [def, items, f.subject, f.difficulty]);
  const roundItems = useMemo(() => (def ? shuffle(pool).slice(0, def.roundSize) : []), [def, pool, round]);

  if (!def) return <Navigate to="/" replace />;

  function finish(outcome: Outcome) {
    if (recorded.current) return;
    recorded.current = true;
    const pct = outcome.total ? Math.round((outcome.correct / outcome.total) * 100) : 0;
    const best = recordScore(def.id, pct)[def.id]!.best;
    setResult({ pct, best, outcome });
  }

  function again() {
    recorded.current = false;
    setResult(null);
    setRound((r) => r + 1);
  }

  const { Component } = def;
  const scope = [f.subject, f.difficulty].filter(Boolean).join(' · ');

  return (
    <>
      <div className="bar">
        <Link to={`/${f.search}`} className="back">← All games</Link>
        <button className="btn" onClick={again}>New round</button>
      </div>
      <h1>{def.emoji} {def.title}</h1>
      {scope && <p className="hint">{scope}</p>}

      {pool.length < def.min ? (
        <p className="notice">
          This game needs at least {def.min} suitable question{def.min === 1 ? '' : 's'}; there {pool.length === 1 ? 'is' : 'are'} {pool.length}
          {scope ? ' for this filter' : ''}. Add rows to the sheet{scope ? ' or clear the filters' : ''}.
        </p>
      ) : (
        <>
          {result && (
            <div className="result" role="status">
              <strong>{result.pct === 100 ? '🎉 Perfect!' : result.pct >= 60 ? '👍 Nice work' : '💪 Keep going'}</strong>
              <span>{result.outcome.correct}/{result.outcome.total} · {result.pct}% · best {result.best}%</span>
              <button className="btn primary" onClick={again}>Play again</button>
            </div>
          )}
          <Component key={round} items={roundItems} onFinish={finish} />
        </>
      )}
    </>
  );
}
