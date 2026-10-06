import { useEffect, useState } from 'react';
import type { Built } from '../lib/build';
import { openFile, saveFile } from '../lib/files';
import { META } from '../lib/games';
import { FORMATS, fileName, makeOutput } from '../lib/output';
import type { FormatId, Pair } from '../types';
import { DownloadIcon } from './icons';
import { Preview } from './Preview';

interface Props {
  built: Built;
  pairs: Pair[];
  title: string;
  fmt: FormatId;
  showKey: boolean;
  out: string;
  /** The layout being shown (1-based), how many there are, and how many questions each holds. */
  layout: { n: number; of: number; sizes: number[] };
  onPickLayout: (k: number) => void;
  onFmt: (f: FormatId) => void;
  onToggleKey: () => void;
  onRearrange: () => void;
  onDownloadAll: () => void;
}

function Tabs({ built, layout, onPick }: { built: Built; layout: Props['layout']; onPick: (k: number) => void }) {
  if (layout.of < 2) return null;
  return (
    <nav aria-label="Layouts" className="tabs" style={{ ['--c' as string]: META[built.game].color }}>
      {layout.sizes.map((size, k) => (
        <button key={k} type="button" aria-pressed={k + 1 === layout.n} className={`tab${k + 1 === layout.n ? ' on' : ''}`} onClick={() => onPick(k)}>
          Layout {k + 1} <small>{size}</small>
        </button>
      ))}
    </nav>
  );
}

export function DownloadStep({ built, pairs, title, fmt, showKey, out, layout, onPickLayout, onFmt, onToggleKey, onRearrange, onDownloadAll }: Props) {
  const [copied, setCopied] = useState('');
  useEffect(() => setCopied(''), [out]);

  const head = (
    <div className="step-head">
      <h2 id="h-dl">3. Check it, then download</h2>
      <p>The preview is exactly what goes in the file.</p>
    </div>
  );

  if (!built.ok) {
    const empty = pairs.length === 0;
    return (
      <section id="download" aria-labelledby="h-dl" className="step plain">
        {head}
        <Tabs built={built} layout={layout} onPick={onPickLayout} />
        <div className="wait">
          <span className="wait-t">{empty ? 'Add questions first' : 'Can’t build this one yet'}</span>
          <span>{empty ? 'Step 1 is empty.' : built.msg}</span>
        </div>
      </section>
    );
  }

  const meta = META[built.game];
  const format = FORMATS.find((f) => f.id === fmt)!;
  const info = { n: layout.n, of: layout.of };
  const name = fileName(title, meta.anchor, format.ext, info);

  const copy = () => {
    const done = () => setCopied('Copied ✓');
    const fail = () => setCopied('Copy blocked: select the box below');
    try { navigator.clipboard.writeText(out).then(done, fail); } catch { fail(); }
  };

  return (
    <section id="download" aria-labelledby="h-dl" className="step plain">
      {head}
      <Tabs built={built} layout={layout} onPick={onPickLayout} />
      <div className="dl-layout">
        <div className="card preview">
          <div className="between wrap">
            <h3>Preview: {meta.name}{layout.of > 1 && <span className="muted"> · Layout {layout.n} of {layout.of}</span>}</h3>
            <div className="row tight">
              <button type="button" className={`btn small${showKey ? ' dark' : ''}`} aria-pressed={showKey} onClick={onToggleKey}>
                {showKey ? 'Hide answers' : 'Show answers'}
              </button>
              <button type="button" className="btn small quiet" onClick={onRearrange} title="Same questions, a new arrangement">Rearrange</button>
            </div>
          </div>
          {built.note && <p className="note">{built.note}</p>}
          <Preview b={built} showKey={showKey} />
        </div>

        <aside aria-label="Download" className="card side">
          <h3>Pick a file type</h3>
          <div className="formats">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" aria-pressed={fmt === f.id} onClick={() => onFmt(f.id)} className={`fmt${fmt === f.id ? ' on' : ''}`}>
                <b>{f.label}</b><span>{f.sub}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn primary big" onClick={() => saveFile(name, out, format.mime)}>
            <DownloadIcon /><span className="dl"><b>Download{layout.of > 1 ? ` layout ${layout.n}` : ''}</b><small>{name}</small></span>
          </button>
          {layout.of > 1 && (
            <button type="button" className="btn" onClick={onDownloadAll}>Download all {layout.of} layouts (.zip)</button>
          )}
          <div className="row tight">
            <button type="button" className="btn grow" onClick={copy}>{copied || 'Copy'}</button>
            <button type="button" className="btn grow" onClick={() => openFile(makeOutput(built, 'html', title, info), 'text/html')}>Print worksheet</button>
          </div>
          <label htmlFor="gm-out">File contents</label>
          <textarea id="gm-out" className="out" readOnly value={out} />
          <p className="small-print">Download blocked? Press <b>Copy</b> and paste into any file.</p>
        </aside>
      </div>
    </section>
  );
}
