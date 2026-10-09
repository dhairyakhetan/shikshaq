/**
 * The whole site, as one page. Nothing shows until the person signs in with Google. Then the database says their role:
 * everyone signed in gets the formatter and the HoD desk (only HoDs and the admin can approve there); only the admin gets
 * Revise. Moving between the parts doesn't reload the page: the header stays and the parts crossfade.
 * A part stays open once visited, so its text, puzzle or list is still there on the way back.
 */
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { myRole, nameOf, signIn, signOut, useLoad, useSession, waitingCount, type Role } from './db';
import { Formatter } from './formatter';
import { HodDesk } from './hod';
import { Revise } from './play';
import { GoogleIcon, Logo, SectionHeader, useRoute, type Section } from './ui';

const partOf = (path: string): Section => (path.startsWith('/hod') ? 'hod' : path.startsWith('/play') ? 'play' : 'formatter');

function App() {
  const session = useSession();
  const who = session === undefined ? undefined : session?.user.id ?? null;
  const [role, setRole] = useState<{ role?: Role | null; error?: string }>({});
  useEffect(() => {
    setRole({});
    if (who) myRole().then((r) => setRole({ role: r }), (e: Error) => setRole({ error: e.message }));
  }, [who]);
  const waiting = useLoad(waitingCount);
  useEffect(() => { if (who) waiting.reload(); }, [who, waiting.reload]);
  const path = useRoute();
  const [opened, setOpened] = useState<Set<Section>>(new Set());

  const pages: Section[] = role.role === 'admin' ? ['formatter', 'hod', 'play'] : ['formatter', 'hod'];
  const wanted = partOf(path);
  const here = pages.includes(wanted) ? wanted : 'formatter';
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
    formatter: () => <Formatter teacher={nameOf(session)} onSent={waiting.reload} />,
    hod: () => <HodDesk canApprove={role.role !== 'teacher'} onChange={waiting.reload} />,
    play: () => <Revise />,
  };
  return (
    <>
      <SectionHeader here={here} pages={pages} waiting={waiting.data ?? 0} name={nameOf(session)} onSignOut={() => signOut()} />
      {pages.filter((p) => opened.has(p) || p === here).map((p) => (
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
