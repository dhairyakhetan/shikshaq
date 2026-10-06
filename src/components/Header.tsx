import { Logo } from './icons';

export interface Step { label: string; value: string; href: string; done: boolean; now: boolean }

export function Header({ steps, msg, tone }: { steps: Step[]; msg: string; tone: 'wait' | 'bad' | 'ok' }) {
  return (
    <header className="top">
      <a className="skip" href="#data">Skip to your questions</a>
      <div className="top-in">
        <div className="top-row">
          <a href="#top" className="brand"><Logo /><span>Game Maker</span></a>
          <nav aria-label="Progress" className="steps">
            {steps.map((s, i) => (
              <a key={s.label} href={s.href} className={`pill${s.now ? ' now' : ''}${s.done ? ' done' : ''}`} aria-current={s.now ? 'step' : undefined}>
                <span className="dot">{s.done ? '✓' : i + 1}</span>
                <span><b>{s.label}</b> <span className="val">{s.value}</span></span>
              </a>
            ))}
          </nav>
          <a className="bots" href="#chatbots">For chatbots</a>
        </div>
        <p role="status" aria-live="polite" className="status">
          <span className={`led ${tone}`} aria-hidden="true" />
          <span>{msg}</span>
        </p>
      </div>
    </header>
  );
}
