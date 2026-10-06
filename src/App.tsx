import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { DataStep } from './components/DataStep';
import { DownloadStep } from './components/DownloadStep';
import { GameStep } from './components/GameStep';
import { Header, type Step } from './components/Header';
import { Instructions } from './components/Instructions';
import { LayoutOptions } from './components/LayoutOptions';
import { Tips } from './components/Tips';
import { build } from './lib/build';
import { layoutFiles } from './lib/bundle';
import { saveFile } from './lib/files';
import { GAMES, META, usable } from './lib/games';
import { DEFAULT_PER_LAYOUT, LAYOUT_COUNT_CHOICES, MAX_LAYOUTS, PER_LAYOUT_CHOICES, firstLayouts, layoutSeed, planLayouts, type Order } from './lib/layouts';
import { FORMATS, makeOutput, zipName } from './lib/output';
import { parsePairs } from './lib/parse';
import { makeZip } from './lib/zip';
import { SAMPLE, SAMPLE_TITLE } from './sample';
import type { FormatId, GameId } from './types';

interface State {
  title: string; raw: string; game: GameId; fmt: FormatId; showKey: boolean;
  /** Questions per layout; number of layouts (0 = as many as it takes); order of the questions and its shuffle. */
  perLayout: number; layouts: number; order: Order; deal: number;
  /** The layout on show (0-based) and, per layout, how often "Rearrange" was pressed. */
  current: number; rolls: number[];
}

const KEY = 'game-maker:v1';
const DEFAULTS: State = { title: SAMPLE_TITLE, raw: SAMPLE, game: 'crossword', fmt: 'json', showKey: false, perLayout: DEFAULT_PER_LAYOUT, layouts: 0, order: 'written', deal: 1, current: 0, rolls: [] };

const whole = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

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
      showKey: o.showKey === true,
      perLayout: (PER_LAYOUT_CHOICES as readonly number[]).includes(o.perLayout as number) ? (o.perLayout as number) : DEFAULTS.perLayout,
      layouts: o.layouts === 0 || (LAYOUT_COUNT_CHOICES as readonly number[]).includes(o.layouts as number) ? (o.layouts as number) : 0,
      order: o.order === 'shuffled' ? 'shuffled' : 'written',
      deal: whole(o.deal, 1, 1e9) ? o.deal : 1,
      current: whole(o.current, 0, MAX_LAYOUTS - 1) ? o.current : 0,
      rolls: Array.isArray(o.rolls) && o.rolls.length <= MAX_LAYOUTS && o.rolls.every((r) => whole(r, 0, 1e9)) ? o.rolls : [],
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
  const meta = META[s.game];

  // The questions this game can use, split into layouts of at most `perLayout`.
  const pool = useMemo(() => usable(s.game, parsed.pairs), [s.game, parsed.pairs]);
  const plan = useMemo(() => planLayouts(pool, s.perLayout, s.layouts, s.order, s.deal), [pool, s.perLayout, s.layouts, s.order, s.deal]);
  const count = plan.groups.length;
  const cur = Math.min(s.current, count - 1);
  const sizes = useMemo(() => plan.groups.map((g) => g.length), [plan]);
  const layoutOf = useMemo(() => firstLayouts(plan), [plan]);

  const built = useMemo(() => build(s.game, plan.groups[cur], layoutSeed(cur, s.rolls[cur] ?? 0)), [s.game, plan, cur, s.rolls]);
  const layout = useMemo(() => ({ n: cur + 1, of: count, sizes }), [cur, count, sizes]);
  const out = useMemo(() => (built.ok ? makeOutput(built, s.fmt, s.title, { n: cur + 1, of: count }) : ''), [built, s.fmt, s.title, cur, count]);

  const n = parsed.pairs.length;
  let msg: string;
  let tone: 'wait' | 'bad' | 'ok';
  if (!n) { msg = 'Waiting for data. Paste your questions in Step 1.'; tone = 'wait'; }
  else if (!built.ok) { msg = built.msg; tone = 'bad'; }
  else {
    const where = count > 1 ? `, layout ${cur + 1} of ${count}` : '';
    const what = built.game === 'crossword' ? `${built.placedCount} of ${built.total} words in a ${built.cols}×${built.rows} grid`
      : built.game === 'wordSearch' ? `${built.words.length} of ${built.total} words hidden in a ${built.size}×${built.size} grid`
      : `${built.rows.length} questions`;
    msg = `${meta.name} ready${where}: ${what}. Download it in Step 3.`;
    tone = 'ok';
  }

  const done = [n > 0, true, built.ok];
  const now = done.indexOf(false);
  const steps: Step[] = [
    { label: 'Data', value: n ? `${n} pairs` : 'waiting', href: '#data' },
    { label: 'Game', value: meta.name, href: '#game' },
    { label: 'Download', value: built.ok ? 'ready' : '—', href: '#download' },
  ].map((x, i) => ({ ...x, done: done[i], now: i === now }));

  const rearrange = () => {
    const rolls = Array.from({ length: Math.max(s.rolls.length, cur + 1) }, (_, i) => s.rolls[i] ?? 0);
    rolls[cur] += 1;
    set({ rolls });
  };
  const downloadAll = () => {
    const { files } = layoutFiles(s.game, meta.anchor, plan.groups, s.rolls, s.fmt, s.title);
    saveFile(zipName(s.title, meta.anchor), makeZip(files) as Uint8Array<ArrayBuffer>, 'application/zip');
  };

  return (
    <div className="shell">
      <Header steps={steps} msg={msg} tone={tone} />
      <main id="top">
        <div className="intro">
          <h1>Turn your questions into games.</h1>
          <p>Three steps: <b>Paste</b> → <b>Pick</b> → <b>Download</b>. Nothing to install. Your data never leaves this page.</p>
        </div>
        <DataStep
          title={s.title} raw={s.raw} parsed={parsed} layoutOf={layoutOf} layoutCount={count}
          onTitle={(title) => set({ title })} onRaw={(r) => set({ raw: r })}
          onSample={() => set({ raw: SAMPLE, title: SAMPLE_TITLE })} onClear={() => set({ raw: '' })}
        />
        <GameStep game={s.game} pairs={parsed.pairs} onPick={(game) => set({ game, current: 0 })}>
          <LayoutOptions
            perLayout={s.perLayout} layouts={s.layouts} order={s.order} auto={plan.auto} sizes={sizes} poolSize={pool.length}
            onPer={(perLayout) => set({ perLayout, current: 0 })} onLayouts={(layouts) => set({ layouts, current: 0 })}
            onOrder={(order) => set({ order, current: 0 })} onReshuffle={() => set({ deal: s.deal + 1, current: 0 })}
          />
        </GameStep>
        <DownloadStep
          built={built} pairs={parsed.pairs} title={s.title} fmt={s.fmt} showKey={s.showKey} out={out} layout={layout}
          onPickLayout={(current) => set({ current })} onFmt={(fmt) => set({ fmt })} onToggleKey={() => set({ showKey: !s.showKey })}
          onRearrange={rearrange} onDownloadAll={downloadAll}
        />
        <Tips />
        <Instructions />
      </main>
    </div>
  );
}
