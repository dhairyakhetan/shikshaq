/**
 * The whole site, as one page. Nothing shows until the person signs in with Google. Then the database says their role
 * (and saves a new person as a member): everyone signed in gets the formatter, the HoD desk (only HoDs and admins can
 * approve there) and their profile; only admins get Revise, whose games are downloaded only when it is opened.
 * Moving between the parts doesn't reload the page: the header stays and the parts crossfade. A part stays open once
 * visited, so its text, puzzle or list is still there on the way back.
 */
import { lazy, StrictMode, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { myRole, nameOf, signIn, signOut, useSession, waitingCount, type Role } from './db';
import { Formatter } from './formatter';
import { HodDesk } from './hod';
import { ProfilePage, useProfile } from './profile';
import { GoogleIcon, Logo, SectionHeader, useRoute, type Section } from './ui';

/** Scrolls down to the guide at the bottom of the formatter, without adding "#..." to the address. */
function toGuide() {
  const el = document.getElementById('guide');
  el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  el?.focus({ preventScroll: true });
}

const Revise = lazy(() => import('./play').then((m) => ({ default: m.Revise })));

const partOf = (path: string): Section => (path.startsWith('/hod') ? 'hod' : path.startsWith('/play') ? 'play' : path.startsWith('/profile') ? 'profile' : 'formatter');

function App() {
  const session = useSession();
  const who = session === undefined ? undefined : session?.user.id ?? null;
  const [role, setRole] = useState<{ role?: Role | null; error?: string }>({});
  useEffect(() => {
    setRole({});
    if (who) myRole().then((r) => setRole({ role: r }), (e: Error) => setRole({ error: e.message }));
  }, [who]);
  // the number of questions waiting, in the header: asked once signed in, and again after a send or an approval
  const [waiting, setWaiting] = useState(0);
  const recount = useCallback(() => { waitingCount().then(setWaiting, () => {}); }, []);
  useEffect(() => { if (who) recount(); }, [who, recount]);
  const path = useRoute();
  const [profile, setProfile] = useProfile(session?.user.email ?? '');
  const [opened, setOpened] = useState<Set<Section>>(new Set());

  const pages: Section[] = role.role === 'admin' ? ['formatter', 'hod', 'play'] : ['formatter', 'hod'];
  const wanted = partOf(path);
  const here = pages.includes(wanted) || wanted === 'profile' ? wanted : 'formatter';
  useEffect(() => {
    if (!role.role) return;
    if (here !== wanted) history.replaceState(null, '', '/'); // Revise is only for the admin
    setOpened((o) => (o.has(here) ? o : new Set(o).add(here)));
  }, [here, wanted, role.role]);

  if (session === undefined || (session && !role.role && !role.error)) return <div className="splash" aria-busy="true"><Logo /></div>;
  if (!session || role.error) {
    return (
      <main className="signin">
        <div className="signin-card enter">
          <Logo />
          <h1>Shikshaq question bank</h1>
          <p>Sign in to send questions for approval and to see the HoD desk.</p>
          {role.error && <p className="sent-note warn" role="alert">Couldn't check your sign-in: {role.error}</p>}
          {role.error
            ? <button type="button" className="btn quiet" onClick={() => signOut()}>Sign out and try again</button>
            : <button type="button" className="btn primary" onClick={() => signIn()}><GoogleIcon /> Sign in with Google</button>}
        </div>
      </main>
    );
  }

  const parts: Record<Section, () => ReactNode> = {
    formatter: () => <Formatter teacher={nameOf(session)} onSent={recount} />,
    hod: () => <HodDesk canApprove={role.role === 'hod' || role.role === 'admin'} onChange={recount} />,
    play: () => <Suspense fallback={<main className="page"><p className="empty">Loading the games…</p></main>}><Revise /></Suspense>,
    profile: () => <ProfilePage name={nameOf(session)} email={session.user.email ?? ''} role={role.role ?? 'member'} profile={profile} onChange={setProfile} onSignOut={() => signOut()} />,
  };
  return (
    <>
      <SectionHeader here={here} pages={pages} waiting={waiting} name={nameOf(session)} avatar={profile.avatar}
        left={here === 'formatter' && <button type="button" className="top-link" onClick={toGuide}><span className="wide-only">How to write questions</span><span className="narrow-only">Guide</span></button>} />
      {[...pages, 'profile' as const].filter((p) => opened.has(p) || p === here).map((p) => (
        <div key={p} className="part" hidden={p !== here}>{parts[p]()}</div>
      ))}
    </>
  );
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
