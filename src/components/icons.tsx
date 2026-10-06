import type { GameId } from '../types';

const base = { fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="#F2A900" {...base} strokeLinecap={undefined}>
      <path d="M3 3h6v6H3zM9 9h6v6H9zM15 9h6v6h-6zM9 15h6v6H9z" />
    </svg>
  );
}

export function GameIcon({ game, color }: { game: GameId; color: string }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" stroke={color} {...base}>
      {game === 'crossword' && <path d="M3 3h6v6H3zM9 9h6v6H9zM15 9h6v6h-6zM9 15h6v6H9z" />}
      {game === 'matching' && (<><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 6l10 12M7 18L17 6" /></>)}
      {game === 'fillBlank' && (<><path d="M3 6h18M3 12h4M17 12h4M3 18h11" /><rect x="8.5" y="9.5" width="7" height="5" rx="1" /></>)}
      {game === 'wordSearch' && (<><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5L20 20M7.5 10h5" /></>)}
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" stroke="#FFFFFF" {...base} strokeWidth={2.4}>
      <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
    </svg>
  );
}

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="#FFFFFF" {...base} strokeWidth={3}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}
