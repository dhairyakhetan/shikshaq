import { LAYOUT_COUNT_CHOICES, PER_LAYOUT_CHOICES, type Order } from '../lib/layouts';

interface Props {
  perLayout: number;
  layouts: number;
  order: Order;
  /** Layouts it takes to use every question once, how many there are, the size of each, and how many questions the game can use. */
  auto: number;
  sizes: number[];
  poolSize: number;
  onPer: (n: number) => void;
  onLayouts: (n: number) => void;
  onOrder: (o: Order) => void;
  onReshuffle: () => void;
}

function summary({ auto, sizes, poolSize, perLayout }: Pick<Props, 'auto' | 'sizes' | 'poolSize' | 'perLayout'>): string {
  const count = sizes.length;
  if (!poolSize) return '';
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  const each = min === max ? `${max}` : `${min}–${max}`;
  if (count === auto) {
    return `${poolSize} usable question${poolSize === 1 ? '' : 's'} make${poolSize === 1 ? 's' : ''} ${count} layout${count === 1 ? '' : 's'}${count > 1 ? ` of ${each} questions` : ''}.`;
  }
  if (count < auto) return `${count} layout${count === 1 ? '' : 's'} of ${perLayout} use the first ${count * perLayout} of ${poolSize} questions. Raise the number of layouts to use them all.`;
  return `Layouts 1–${auto} use every question once. Layouts ${auto + 1}–${count} are new mixes of the same questions.`;
}

export function LayoutOptions(p: Props) {
  const count = p.sizes.length;
  const reshuffle = p.order === 'shuffled' || count > p.auto;
  return (
    <div className="card opts">
      <div className="opts-row">
        <div className="opt">
          <label htmlFor="gm-per">Questions per layout</label>
          <select id="gm-per" value={p.perLayout} onChange={(e) => p.onPer(Number(e.target.value))}>
            {PER_LAYOUT_CHOICES.map((n) => <option key={n} value={n}>{n} questions</option>)}
          </select>
        </div>
        <div className="opt">
          <label htmlFor="gm-count">Number of layouts</label>
          <select id="gm-count" value={p.layouts} onChange={(e) => p.onLayouts(Number(e.target.value))}>
            <option value={0}>Auto ({p.auto})</option>
            {LAYOUT_COUNT_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="opt">
          <label htmlFor="gm-order">Question order</label>
          <select id="gm-order" value={p.order} onChange={(e) => p.onOrder(e.target.value as Order)}>
            <option value="written">As written</option>
            <option value="shuffled">Shuffled</option>
          </select>
        </div>
        {reshuffle && <button type="button" className="btn small quiet" onClick={p.onReshuffle}>Reshuffle questions</button>}
      </div>
      <p className="opts-note">
        Long lists are split so every puzzle stays a printable size. {summary(p)}
      </p>
    </div>
  );
}
