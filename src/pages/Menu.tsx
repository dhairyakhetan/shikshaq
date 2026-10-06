import { Link } from 'react-router-dom';
import { useDataset } from '../App';
import { eligible, GAME_LIST } from '../games';
import { loadScores } from '../lib/scores';
import { useFilters } from './filters';

const SOURCE = { pasted: 'the questions you pasted', sheet: 'your Google Sheet', sample: 'the built-in sample' } as const;

export function Menu() {
  const data = useDataset();
  const f = useFilters();
  const scores = loadScores();
  const pool = data.items.filter(f.apply);

  return (
    <>
      <h2>Step 2 · Pick a game</h2>
      <p className="hint">
        {data.items.length} questions from {SOURCE[data.source]}.
      </p>
      {data.warning && <p className="notice">{data.warning}</p>}

      <div className="filters">
        {[
          { name: 'subject' as const, label: 'Subject', value: f.subject, options: f.subjects },
          { name: 'difficulty' as const, label: 'Difficulty', value: f.difficulty, options: f.difficulties },
        ].filter((x) => x.options.length > 0).map((x) => (
          <label key={x.name}>
            {x.label}
            <select value={x.value} onChange={(e) => f.set(x.name, e.target.value)}>
              <option value="">All</option>
              {x.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div className="cards">
        {GAME_LIST.map((g) => {
          const n = eligible(g, pool).length;
          const ready = n >= g.min;
          const best = scores[g.id]?.best;
          const body = (
            <>
              <span className="emoji">{g.emoji}</span>
              <h2>{g.title}</h2>
              <p>{g.blurb}</p>
              <p className="meta">
                {ready ? `${n} question${n === 1 ? '' : 's'}` : `Needs ${g.min}+ questions (has ${n})`}
                {best !== undefined && ` · best ${best}%`}
              </p>
            </>
          );
          return ready ? (
            <Link key={g.id} to={`/play/${g.id}${f.search}`} className="card">{body}</Link>
          ) : (
            <div key={g.id} className="card off" aria-disabled="true">{body}</div>
          );
        })}
      </div>

      {data.skipped.length > 0 && (
        <details className="skipped">
          <summary>{data.skipped.length} sheet row{data.skipped.length === 1 ? '' : 's'} need attention</summary>
          <ul>
            {data.skipped.map((s, i) => <li key={i}>Row {s.row}: {s.reason}</li>)}
          </ul>
        </details>
      )}
    </>
  );
}
