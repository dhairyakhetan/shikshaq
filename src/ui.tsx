/** What the three parts share on screen: moving between them, the header, the grouped table of rows, the undo bar and icons. */
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Row } from './db';

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const DownloadIcon = () => <svg {...base}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
export const CopyIcon = () => <svg {...base}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>;
export const CheckIcon = () => <svg {...base} strokeWidth={2.8}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const SendIcon = () => <svg {...base}><path d="M4 12h15M13 6l6 6-6 6" /></svg>;
export const SignOutIcon = () => <svg {...base}><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" /></svg>;
export const ArrowDownIcon = () => <svg {...base}><path d="M12 5v14M6 13l6 6 6-6" /></svg>;

/** Saves text as a file on the person's device. */
export function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** An icon that turns into a check mark for a moment after the action worked, without changing the button's size. */
export function ActionIcon({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <span className={`ico${done ? ' done' : ''}`}>
      <span className="ico-a">{children}</span>
      <span className="ico-b"><CheckIcon /></span>
    </span>
  );
}

/** The rows as they will be stored, grouped under a heading for each chapter and topic. */
export function RowsTable<R extends Row>({ rows, keyOf = (_r, i) => i, extra, rowClass }: {
  rows: R[];
  /** A stable key per row, so rows that leave or arrive don't disturb the others. */
  keyOf?: (r: R, i: number) => string | number;
  /** Buttons or a note shown under a row (the Approve page). */
  extra?: (r: R) => ReactNode;
  rowClass?: (r: R) => string;
}) {
  // Rows slide in as they are added. On the first render (a paste, the example) they come in one after another,
  // briefly; later only a newly added row animates, and only once.
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  const delay = (n: number): CSSProperties | undefined => (first.current ? { animationDelay: `${Math.min(n, 16) * 22}ms` } : undefined);
  let shown = 0;
  const out: ReactNode[] = [];
  let chapter = '';
  let topic = '';
  rows.forEach((r, i) => {
    const ch = [r.chapter_id, r.board, r.class, r.subject, r.chapter_no, r.chapter].join('\u0000');
    if (ch !== chapter || i === 0) {
      chapter = ch;
      topic = '';
      const title = r.chapter || r.chapter_no !== null ? [r.chapter_no !== null && `Chapter ${r.chapter_no}`, r.chapter].filter(Boolean).join(': ') : 'No chapter';
      const meta = [r.board, r.class && `Class ${r.class}`, r.subject].filter(Boolean).join(' · ');
      out.push(
        <div className="grp ch enter" style={delay(shown++)} key={`c${i}`}>
          <span>{title}</span>
          <small>{meta}{meta && ' · '}{r.chapter_id ? <code className="rid">{r.chapter_id}</code> : 'no chapter ID yet'}</small>
        </div>,
      );
    }
    const tp = `${r.topic_no}\u0000${r.topic}`;
    if (tp !== topic) {
      topic = tp;
      const has = r.topic || r.topic_no !== null;
      out.push(
        <div className={`grp tp enter${has ? '' : ' none'}`} style={delay(shown++)} key={`t${i}`}>
          <span>{has ? [r.topic_no !== null && `Topic ${r.topic_no}`, r.topic].filter(Boolean).join(': ') : 'No topic'}</span>
          {r.topic_id && <code className="rid">{r.topic_id}</code>}
        </div>,
      );
    }
    out.push(
      <div className={`qrow enter ${rowClass?.(r) ?? ''}`} style={delay(shown++)} key={keyOf(r, i)}>
        <span className="n">{r.question_no}</span>
        <span className="q">{r.question}</span>
        <span className="a">{r.answer}</span>
        {r.difficulty && <span className={`d ${r.difficulty}`}>{r.difficulty}</span>}
        {extra && <div className="x">{extra(r)}</div>}
      </div>,
    );
  });
  return <div className="rows">{out}</div>;
}

/** "Undo" for a few seconds after an action, instead of asking "are you sure?". Render `toast` in a `.floating` box. */
export function useUndo() {
  const [undo, setUndo] = useState<{ what: string; restore: () => void } | null>(null);
  const timer = useRef(0);
  const offer = (what: string, restore: () => void) => {
    setUndo({ what, restore });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndo(null), 7000);
  };
  const toast = undo && (
    <div className="toast" key="undo">
      <span>{undo.what}.</span>
      <button type="button" className="toast-btn" onClick={() => { undo.restore(); setUndo(null); }}>Undo</button>
    </div>
  );
  return { offer, toast };
}

export const SECTIONS = [
  { key: 'formatter', name: 'Question formatter', link: 'Formatter', href: '/' },
  { key: 'hod', name: 'HoD desk', link: 'HoD desk', href: '/hod/' },
  { key: 'play', name: 'Revise', link: 'Revise', href: '/play/' },
  { key: 'profile', name: 'Your profile', link: 'Profile', href: '/profile/' },
] as const;
export type Section = (typeof SECTIONS)[number]['key'];

// ---------------------------------------------------------------- moving between the parts (one page, no reloads)

let onGo: ((path: string) => void) | null = null;

/** Changes the address without loading a new page, and shows the new part with a smooth transition. */
export function go(path: string) {
  if (path === location.pathname) return;
  history.pushState(null, '', path);
  onGo?.(path);
}

/** The part to show, from the address; follows `go` and the browser's back and forward buttons. */
export function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    // the header stays, the dark pill slides to the new link and the page crossfades (where the browser can)
    const show = (p: string) => {
      const update = () => { setPath(p); scrollTo(0, 0); };
      if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) update();
      else document.startViewTransition(() => flushSync(update));
    };
    onGo = show;
    const back = () => show(location.pathname);
    addEventListener('popstate', back);
    return () => { onGo = null; removeEventListener('popstate', back); };
  }, []);
  return path;
}

/** A link to another part of the site that doesn't reload the page. */
export function Link({ href, className, children, ...rest }: { href: string; className?: string; children: ReactNode; 'aria-current'?: 'page'; 'aria-label'?: string }) {
  const click = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // a new tab still works
    e.preventDefault();
    go(href);
  };
  return <a href={href} className={className} onClick={click} {...rest}>{children}</a>;
}

/**
 * The header: on the left the part's name and anything that belongs to that part only (`left`), so the links on the
 * right never move when the part changes; on the right the parts this person may open, the number waiting, and their
 * avatar, which opens their profile.
 */
export function SectionHeader({ here, pages, waiting = 0, name, avatar, left }: { here: Section; pages: Section[]; waiting?: number; name: string; avatar: number; left?: ReactNode }) {
  return (
    <header className="top">
      <div className="top-in">
        <div className="top-left">
          <span className="brand"><Logo /><span className="brand-text">{SECTIONS.find((s) => s.key === here)!.name}</span></span>
          {left}
        </div>
        <nav className="nav" aria-label="Parts of the site">
          {SECTIONS.filter((s) => pages.includes(s.key)).map((s) => (
            <Link key={s.key} href={s.href} className={`nav-link${s.key === here ? ' on' : ''}`} aria-current={s.key === here ? 'page' : undefined}>
              {s.link}{s.key === 'hod' && waiting > 0 && <span className="badge pop" key={waiting}>{waiting}</span>}
            </Link>
          ))}
          <Link href="/profile/" className={`me${here === 'profile' ? ' on' : ''}`} aria-current={here === 'profile' ? 'page' : undefined} aria-label={`Your profile (${name})`}>
            <Avatar n={avatar} />
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- avatars

/** Eight faces on bold colours, to pick from on the profile page. */
const AVATARS: { bg: string; fg: string; eyes: 'dots' | 'happy' | 'calm' | 'wink'; mouth: 'smile' | 'small' | 'o' | 'flat' | 'grin' }[] = [
  { bg: '#FF8000', fg: '#1F1F1F', eyes: 'dots', mouth: 'smile' },
  { bg: '#4351FF', fg: '#FFFFFF', eyes: 'dots', mouth: 'small' },
  { bg: '#34B268', fg: '#1F1F1F', eyes: 'happy', mouth: 'small' },
  { bg: '#E5484D', fg: '#FFFFFF', eyes: 'wink', mouth: 'smile' },
  { bg: '#7C3AED', fg: '#FFFFFF', eyes: 'dots', mouth: 'o' },
  { bg: '#0E7490', fg: '#FFFFFF', eyes: 'calm', mouth: 'flat' },
  { bg: '#F2A900', fg: '#1F1F1F', eyes: 'dots', mouth: 'grin' },
  { bg: '#1F1F1F', fg: '#FF8000', eyes: 'happy', mouth: 'smile' },
];
export const AVATAR_COUNT = AVATARS.length;
/** A starting avatar for each person, from their email, so two people rarely start with the same one. */
export const avatarFor = (email: string) => [...email].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_COUNT;

export function Avatar({ n, size = 32 }: { n: number; size?: number }) {
  const a = AVATARS[((n % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT];
  const line = { stroke: a.fg, strokeWidth: 4.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  const eye = (x: number, kind: typeof a.eyes) =>
    kind === 'happy' ? <path d={`M${x - 6} 29l6-6 6 6`} {...line} />
      : kind === 'calm' ? <path d={`M${x - 5} 27h10`} {...line} />
      : <circle cx={x} cy={26} r={4.2} fill={a.fg} />;
  const mouth = {
    smile: <path d="M19 39q13 13 26 0" {...line} />,
    small: <path d="M25 41q7 6 14 0" {...line} />,
    o: <circle cx={32} cy={44} r={5} {...line} />,
    flat: <path d="M24 43h16" {...line} />,
    grin: <path d="M18 38h28q-2 15-14 15t-14-15z" fill={a.fg} />,
  }[a.mouth];
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill={a.bg} />
      {eye(21, a.eyes === 'wink' ? 'dots' : a.eyes)}
      {eye(43, a.eyes === 'wink' ? 'calm' : a.eyes)}
      {mouth}
    </svg>
  );
}

/** Google's "G", for the sign-in buttons. */
export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF8000" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 8h2M11 8h6M7 12h2M11 12h6M7 16h2M11 16h6" />
    </svg>
  );
}
