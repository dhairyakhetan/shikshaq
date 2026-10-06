import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { DataStep } from './components/DataStep';
import { DownloadStep } from './components/DownloadStep';
import { GameStep } from './components/GameStep';
import { Header, type Step } from './components/Header';
import { Instructions } from './components/Instructions';
import { Tips } from './components/Tips';
import { build } from './lib/build';
import { GAMES, META } from './lib/games';
import { FORMATS, makeOutput } from './lib/output';
import { parsePairs } from './lib/parse';
import { SAMPLE, SAMPLE_TITLE } from './sample';
import type { FormatId, GameId } from './types';

interface State { title: string; raw: string; game: GameId; fmt: FormatId; seed: number; showKey: boolean }

const KEY = 'game-maker:v1';
const DEFAULTS: State = { title: SAMPLE_TITLE, raw: SAMPLE, game: 'crossword', fmt: 'json', seed: 1, showKey: false };

/** Last session's work, so a refresh never loses the user's questions. Anything unexpected falls back to the defaults. */
function load(): State {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<State> | null;
    if (!o || typeof o !== 'object') return DEFAULTS;
    return {
      title: typeof o.title === 'string' ? o.title : DEFAULTS.title,
      raw: typeof o.raw === 'string' ? o.raw : DEFAULTS.raw,
      game: GAMES.some((g) => g.id === o.game) ? (o.game as GameId) : DEFAULTS.game,
      fmt: FORMATS.some((f) => f.id === o.fmt) ? (o.fmt as FormatId) : DEFAULTS.fmt,
      seed: Number.isInteger(o.seed) && (o.seed as number) > 0 ? (o.seed as number) : 1,
      showKey: o.showKey === true,
    };
  } catch {
    return DEFAULTS;
  }
}

export function App() {
  const [s, setS] = useState<State>(load);
  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode or full storage: just don't persist */ }
  }, [s]);

  // Typing stays instant; the (heavier) parse and layout follow a beat behind on big pastes.
  const raw = useDeferredValue(s.raw);
  const parsed = useMemo(() => parsePairs(raw), [raw]);
  const built = useMemo(() => build(s.game, parsed.pairs, s.seed), [s.game, parsed.pairs, s.seed]);
  const out = useMemo(() => (built.ok ? makeOutput(built, s.fmt, s.title) : ''), [built, s.fmt, s.title]);

  const n = parsed.pairs.length;
  const meta = META[s.game];

  let msg: string;
  let tone: 'wait' | 'bad' | 'ok';
  if (!n) { msg = 'Waiting for data. Paste your questions in Step 1.'; tone = 'wait'; }
  else if (!built.ok) { msg = built.msg; tone = 'bad'; }
  else {
    const what = built.game === 'crossword' ? `: ${built.placedCount} of ${n} words in a ${built.cols}×${built.rows} grid`
      : built.game === 'wordSearch' ? `: ${built.words.length} of ${n} words hidden in a ${built.size}×${built.size} grid`
      : `: ${n} questions`;
    msg = `${meta.name} ready${what}. Download it in Step 3.`;
    tone = 'ok';
  }

  const done = [n > 0, true, built.ok];
  const now = done.indexOf(false);
  const steps: Step[] = [
    { label: 'Data', value: n ? `${n} pairs` : 'waiting', href: '#data' },
    { label: 'Game', value: meta.name, href: '#game' },
    { label: 'Download', value: built.ok ? 'ready' : '—', href: '#download' },
  ].map((x, i) => ({ ...x, done: done[i], now: i === now }));

  return (
    <div className="shell">
      <Header steps={steps} msg={msg} tone={tone} />
      <main id="top">
        <div className="intro">
          <h1>Turn your questions into games.</h1>
          <p>Three steps: <b>Paste</b> → <b>Pick</b> → <b>Download</b>. Nothing to install. Your data never leaves this page.</p>
        </div>
        <DataStep
          title={s.title} raw={s.raw} parsed={parsed}
          onTitle={(title) => set({ title })} onRaw={(r) => set({ raw: r })}
          onSample={() => set({ raw: SAMPLE, title: SAMPLE_TITLE })} onClear={() => set({ raw: '' })}
        />
        <GameStep game={s.game} pairs={parsed.pairs} onPick={(game) => set({ game })} />
        <DownloadStep
          built={built} pairs={parsed.pairs} title={s.title} fmt={s.fmt} showKey={s.showKey} seed={s.seed} out={out}
          onFmt={(fmt) => set({ fmt })} onToggleKey={() => set({ showKey: !s.showKey })} onReshuffle={() => set({ seed: s.seed + 1 })}
        />
        <Tips />
        <Instructions />
      </main>
    </div>
  );
}
