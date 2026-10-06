import { GAMES, usable } from '../lib/games';
import type { GameId, Pair } from '../types';
import { CheckIcon, GameIcon } from './icons';

export function GameStep({ game, pairs, onPick }: { game: GameId; pairs: Pair[]; onPick: (g: GameId) => void }) {
  return (
    <section id="game" aria-labelledby="h-game" className="step plain">
      <div className="step-head">
        <h2 id="h-game">2. Pick a game</h2>
        <p>Tap one. You can switch any time.</p>
      </div>
      <div className="games">
        {GAMES.map((g) => {
          const on = game === g.id;
          const count = usable(g.id, pairs).length;
          const ready = count >= g.need;
          return (
            <button
              key={g.id} type="button" id={g.anchor} aria-pressed={on} onClick={() => onPick(g.id)}
              className={`gcard${on ? ' on' : ''}`} style={{ ['--c' as string]: g.color, ['--t' as string]: g.tint }}
            >
              <div className="between">
                <span className="gicon"><GameIcon game={g.id} color={g.color} /></span>
                {on && <span className="sel"><CheckIcon />Selected</span>}
              </div>
              <span className="gname">{g.name}</span>
              <span className="gdesc">{g.desc}</span>
              <span className={`gfit${ready || !pairs.length ? '' : ' short'}`}>
                {!pairs.length
                  ? `Uses ${g.needs}`
                  : ready
                    ? `${count} of ${pairs.length} pairs fit`
                    : `Needs ${g.need}+ ${g.needs} (has ${count})`}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
