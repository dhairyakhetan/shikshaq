/**
 * The whole site, as one page. Nothing shows until the person signs in with Google. Then the database says their role
 * (and saves a new person as a member): everyone signed in gets the formatter and their profile; HoDs and admins also get
 * the HoD desk; only admins get Revise, whose games are downloaded only when it is opened.
 * Moving between the parts doesn't reload the page: the header stays and the parts crossfade. A part stays open once
 * visited, so its text, puzzle or list is still there on the way back. The person's notifications (their questions
 * that were sent back) are loaded here too: the number of new ones shows on their avatar and on the bell on their
 * profile, which lists them; opening it marks them seen.
 */
import { lazy, StrictMode, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { markSentBackSeen, myRole, mySentBack, nameOf, signIn, signOut, useSession, waitingCount, type Role, type SentBack } from './db';
import { Formatter } from './formatter';
import { HodDesk } from './hod';
import { ProfilePage, useProfile } from './profile';
import { go, GoogleIcon, Logo, SectionHeader, useRoute, type Section } from './ui';

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
    // no role means the account didn't sign in with Google, which is the only way in
    if (who) myRole().then((r) => setRole(r ? { role: r } : { error: 'Please sign in with a Google account.' }), (e: Error) => setRole({ error: e.message }));
  }, [who]);
  const reviewer = role.role === 'hod' || role.role === 'admin';
  // the number of questions waiting, next to the HoD desk link: asked once the role is known, and after a send or an approval
  const [waiting, setWaiting] = useState(0);
  const recount = useCallback(() => { if (reviewer) waitingCount().then(setWaiting, () => {}); }, [reviewer]);
  useEffect(recount, [recount]);
  const path = useRoute();
  const [profile, setProfile] = useProfile(session?.user.email ?? '');
  const [opened, setOpened] = useState<Set<Section>>(new Set());
  // notifications: loaded once signed in, and again whenever the profile opens
  const [alerts, setAlerts] = useState<{ list?: SentBack[]; error?: string }>({});
  const [alertsTry, setAlertsTry] = useState(0); // "Try again"
  const [fresh, setFresh] = useState<Set<string>>(new Set()); // the ones that were new when the bell was opened
  const [focus, setFocus] = useState<{ ids: string[]; n: number } | null>(null); // opens the bell, at these questions
  /** Opens the notifications, at these questions (the formatter's "See why"). */
  const showSentBack = useCallback((ids: string[]) => { setFocus({ ids, n: Date.now() }); go('/profile/'); }, []);

  const pages: Section[] = role.role === 'admin' ? ['formatter', 'hod', 'play'] : reviewer ? ['formatter', 'hod'] : ['formatter'];
  const wanted = partOf(path);
  const here = pages.includes(wanted) || wanted === 'profile' ? wanted : 'formatter';
  useEffect(() => {
    if (!role.role) return;
    if (here !== wanted) history.replaceState(null, '', '/'); // a part this person can't open
    setOpened((o) => (o.has(here) ? o : new Set(o).add(here)));
  }, [here, wanted, role.role]);
  const onProfile = here === 'profile';
  useEffect(() => {
    if (!onProfile) { setFresh((f) => (f.size ? new Set() : f)); setFocus(null); }
    if (!role.role) { setAlerts({}); return; }
    let current = true; // a later load wins
    setAlerts((a) => ({ list: a.list }));
    mySentBack().then((list) => {
      if (!current) return;
      setAlerts({ list });
      // arriving at the profile with new ones opens the bell
      if (onProfile && list.some((a) => !a.seen)) setFocus((f) => f ?? { ids: [], n: Date.now() });
    }, (e: Error) => { if (current) setAlerts((a) => ({ list: a.list, error: e.message })); });
    return () => { current = false; };
  }, [role.role, onProfile, alertsTry]);
  /** The bell was opened: what was new is now seen (and keeps its "New" label while the profile is open). */
  const seeAlerts = () => {
    const unseen = alerts.list?.filter((a) => !a.seen).map((a) => a.id) ?? [];
    if (!unseen.length) return;
    setFresh((f) => new Set([...f, ...unseen]));
    setAlerts((a) => ({ ...a, list: a.list?.map((x) => ({ ...x, seen: true })) }));
    markSentBackSeen().catch(() => {});
  };

  if (session === undefined || (session && !role.role && !role.error)) return <div className="splash" aria-busy="true"><Logo /></div>;
  if (!session || role.error) {
    return (
      <main className="signin">
        <div className="signin-card enter">
          <Logo />
          <h1>Shikshaq question bank</h1>
          <p>Sign in to format your questions and send them for approval.</p>
          {role.error && <p className="sent-note warn" role="alert">Couldn't check your sign-in: {role.error}</p>}
          {role.error
            ? <button type="button" className="btn quiet" onClick={() => signOut()}>Sign out and try again</button>
            : <button type="button" className="btn primary" onClick={() => signIn()}><GoogleIcon /> Sign in with Google</button>}
        </div>
      </main>
    );
  }

  const parts: Record<Section, () => ReactNode> = {
    formatter: () => <Formatter teacher={nameOf(session)} reviewer={reviewer} onSent={recount} onSentBack={showSentBack} />,
    hod: () => <HodDesk onChange={recount} />,
    play: () => <Suspense fallback={<main className="page"><p className="empty">Loading the games…</p></main>}><Revise /></Suspense>,
    profile: () => <ProfilePage name={nameOf(session)} email={session.user.email ?? ''} role={role.role ?? 'member'} profile={profile} onChange={setProfile} onSignOut={() => signOut()}
      alerts={alerts} fresh={fresh} focus={focus} active={onProfile} onSeen={seeAlerts} onRetry={() => setAlertsTry((n) => n + 1)} />,
  };
  return (
    <>
      <SectionHeader here={here} pages={pages} waiting={waiting} alerts={alerts.list?.filter((a) => !a.seen).length ?? 0} name={nameOf(session)} avatar={profile.avatar}
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
