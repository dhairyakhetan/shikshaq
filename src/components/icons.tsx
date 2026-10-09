import type { ReactNode } from 'react';

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const DownloadIcon = () => <svg {...base}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
export const CopyIcon = () => <svg {...base}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>;
export const CheckIcon = () => <svg {...base} strokeWidth={2.8}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const ArrowDownIcon = () => <svg {...base}><path d="M12 5v14M6 13l6 6 6-6" /></svg>;

/** An icon that turns into a check mark for a moment after the action worked, without changing the button's size. */
export function ActionIcon({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <span className={`ico${done ? ' done' : ''}`}>
      <span className="ico-a">{children}</span>
      <span className="ico-b"><CheckIcon /></span>
    </span>
  );
}
