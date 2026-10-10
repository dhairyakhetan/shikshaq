/**
 * The profile page: the person's avatar (pick one), name, email and role, a bio, and signing out. The avatar and bio are
 * kept on this device only (localStorage). The bell on the right of the card holds their notifications: every question
 * of theirs the HoD sent back, with the reason. For the admin, a list of people underneath: add someone by email with a
 * role, change anyone's role, or take them off the list. Roles live in the database, and each person's device asks for
 * theirs every time the site opens, so a change shows on their next refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPeople, removePerson, ROLE_NAMES, setPersonRole, type Person, type Role, type SentBack } from './db';
import { Avatar, AVATAR_COUNT, avatarFor, BellIcon, SignOutIcon, useUndo } from './ui';

// ---------------------------------------------------------------- avatar and bio, on this device

export interface Profile { avatar: number; bio: string }
const keyOf = (email: string) => `profile:${email}`;

function readProfile(email: string): Profile {
  try {
    const v = JSON.parse(localStorage.getItem(keyOf(email)) ?? 'null');
    if (typeof v?.avatar === 'number' && typeof v?.bio === 'string') return v;
  } catch { /* nothing saved, or storage blocked */ }
  return { avatar: avatarFor(email), bio: '' };
}

/** The person's avatar and bio, kept in this browser. */
export function useProfile(email: string) {
  const [profile, setProfile] = useState<Profile>(() => readProfile(email));
  useEffect(() => setProfile(readProfile(email)), [email]);
  const update = (change: Partial<Profile>) => setProfile((p) => {
    const next = { ...p, ...change };
    try { localStorage.setItem(keyOf(email), JSON.stringify(next)); } catch { /* not saved: fine */ }
    return next;
  });
  return [profile, update] as const;
}

// ---------------------------------------------------------------- the page

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

type Alerts = { list?: SentBack[]; error?: string };
type Focus = { ids: string[]; n: number } | null;

/**
 * `alerts`: the notifications (no list while loading); `fresh`: the ones that were new; `focus`: opens the bell at these
 * questions; `active`: the profile is on screen; `onSeen`: the bell was opened; `onRetry`: load them again; `onFix`:
 * put a question back in the formatter.
 */
export function ProfilePage({ name, email, role, profile, onChange, onSignOut, alerts, fresh, focus, active, onSeen, onRetry, onFix }: {
  name: string; email: string; role: Role; profile: Profile; onChange: (p: Partial<Profile>) => void; onSignOut: () => void;
  alerts: Alerts; fresh: Set<string>; focus: Focus; active: boolean; onSeen: () => void; onRetry: () => void; onFix: (a: SentBack) => void;
}) {
  return (
    <main className="page profile">
      <section className="card stack enter me-card" aria-labelledby="me-h">
        <Bell alerts={alerts} fresh={fresh} focus={focus} active={active} onSeen={onSeen} onRetry={onRetry} onFix={onFix} />
        <div className="profile-head">
          <Avatar n={profile.avatar} size={88} />
          <div>
            <h1 id="me-h">{name}</h1>
            <p className="small muted">{email}</p>
            <span className={`role-badge ${role}`}>{ROLE_NAMES[role]}</span>
          </div>
        </div>

        <fieldset className="avatar-pick">
          <legend>Choose your avatar</legend>
          <div className="avatar-grid">
            {Array.from({ length: AVATAR_COUNT }, (_, n) => (
              <button key={n} type="button" className={`avatar-btn${profile.avatar === n ? ' on' : ''}`} aria-pressed={profile.avatar === n}
                aria-label={`Avatar ${n + 1}`} onClick={() => onChange({ avatar: n })}>
                <Avatar n={n} size={64} />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="bio">Bio</label>
          <textarea id="bio" rows={3} maxLength={300} value={profile.bio} placeholder="A line about you: what you teach, where."
            onChange={(e) => onChange({ bio: e.target.value })} />
        </div>

        <div className="row">
          <button type="button" className="btn quiet" onClick={onSignOut}><SignOutIcon /> Sign out</button>
        </div>
      </section>

      {role === 'admin' && <People me={email} />}
    </main>
  );
}

// ---------------------------------------------------------------- notifications

/** The bell on the profile card: the number of new notifications, and the list when it's open. */
function Bell({ alerts, fresh, focus, active, onSeen, onRetry, onFix }: {
  alerts: Alerts; fresh: Set<string>; focus: Focus; active: boolean; onSeen: () => void; onRetry: () => void; onFix: (a: SentBack) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const unseen = alerts.list?.filter((a) => !a.seen).length ?? 0;
  // "See why" in the formatter, or arriving with new ones, opens it (once per request)
  const handled = useRef(0);
  useEffect(() => {
    if (!active || !focus || handled.current === focus.n) return;
    handled.current = focus.n;
    setOpen(true);
  }, [active, focus]);
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  // opening it marks what was new as seen
  useEffect(() => { if (open && unseen) onSeen(); }, [open, unseen, onSeen]);
  // the questions asked for come into view inside the list
  useEffect(() => {
    if (!open || !focus?.ids.length) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => box.current?.querySelector('.sb-item.flash')?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }));
  }, [open, focus, alerts.list]);
  // a click outside or Escape closes it
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const flash = new Set(focus?.ids);

  return (
    <div className="bell-box" ref={box}>
      <button type="button" className={`bell-btn${open ? ' on' : ''}`} aria-expanded={open} aria-controls={open ? 'alerts' : undefined}
        aria-label={`Notifications${unseen ? `, ${unseen} new` : ''}`} onClick={() => setOpen((o) => !o)}>
        <BellIcon />
        {unseen > 0 && <span className="badge alert pop" key={unseen} aria-hidden="true">{unseen}</span>}
      </button>
      {open && (
        <div id="alerts" className="alerts-pop" role="region" aria-labelledby="alerts-h">
          <div>
            <h2 id="alerts-h">Notifications</h2>
            <p className="small muted">Questions your HoD sent back, and why. Fix each one in the formatter and send it again.</p>
          </div>
          {alerts.list ? (alerts.list.length ? (
            <ul className="sb-list">
              {alerts.list.map((a) => (
                <li key={a.id} className={`sb-item${flash.has(a.id) ? ' flash' : ''}`}>
                  <p className="small muted">{[a.chapter_no !== null && `Chapter ${a.chapter_no}`, a.chapter].filter(Boolean).join(': ')}{a.topic && ` · ${a.topic}`}</p>
                  <p className="sb-q">{a.question}</p>
                  <p className="sb-a">{a.answer}</p>
                  <p className="reason"><b>Why:</b> {a.note}</p>
                  <p className="small muted">
                    {fresh.has(a.id) && <span className="tag">New</span>}
                    Sent back by {a.reviewer}{a.reviewedAt && `, ${when(a.reviewedAt)}`}.
                    {a.now && (a.now === 'approved' ? ' Since sent again, and approved.' : ' Since sent again, and waiting for the HoD.')}
                  </p>
                  {!a.now && <button type="button" className="btn small" onClick={() => onFix(a)}>Fix in the formatter</button>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state sb-empty">
              <span className="bell"><BellIcon /></span>
              <p><b>No notifications</b></p>
              <p className="small muted">When your HoD sends a question back, it shows up here with the reason.</p>
            </div>
          )) : alerts.error ? (
            <div className="empty-state sb-empty" role="alert">
              <p><b>Couldn't load your notifications.</b></p>
              <p className="small muted">{alerts.error}</p>
              <button type="button" className="btn small primary" onClick={onRetry}>Try again</button>
            </div>
          ) : <p className="small muted">Loading your notifications…</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the admin's list of people

function People({ me }: { me: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('hod');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const { offer, toast } = useUndo();

  const load = useCallback(() => loadPeople().then((p) => { setPeople(p); setError(''); }, (e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  /** Runs a change, then shows the list as the database now has it. */
  const change = async (run: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setNote('');
    setError('');
    try {
      await run();
      setNote(done);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const mail = email.trim().toLowerCase();
    if (await change(() => setPersonRole(mail, role), `${mail} is now ${ROLE_NAMES[role]}.`)) setEmail('');
  };
  const remove = (p: Person) => {
    change(() => removePerson(p.email), '').then((ok) => {
      if (ok) offer(`${p.name ?? p.email} removed`, () => { change(() => setPersonRole(p.email, p.role), ''); });
    });
  };

  return (
    <section className="card stack people enter" aria-labelledby="people-h" style={{ animationDelay: '60ms' }}>
      <div>
        <h2 id="people-h">People and roles</h2>
        <p className="small muted">Everyone who signs in is a member: they can format questions and send them. HoDs also get the HoD desk, to approve questions. Admins also get Revise and can change roles; the owner stays an admin, and nobody can remove them. A change shows the next time the person opens or refreshes the site.</p>
      </div>

      <form className="row add-person" onSubmit={(e) => { e.preventDefault(); if (email.trim()) add(); }}>
        <input type="text" inputMode="email" autoComplete="off" aria-label="Email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="hod">HoD</option>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" className="btn primary" disabled={!email.trim() || busy}>Add</button>
      </form>
      {note && <p className="sent-note ok" role="status">{note}</p>}
      {error && <p className="sent-note warn" role="alert">{error}</p>}

      {!people ? <p className="small muted">{error ? '' : 'Loading people…'}</p> : (
        <ul className="person-list">
          {people.map((p) => (
            <li key={p.email} className="person">
              <div className="who">
                <b>{p.name ?? p.email}</b>
                {p.name && <span className="small muted">{p.email}</span>}
                <span className="small muted">{p.last_seen_at ? `Last here ${when(p.last_seen_at)}` : "Hasn't signed in yet"}</span>
              </div>
              {p.email === me.toLowerCase() || p.owner ? <span className={`role-badge ${p.role}`}>{ROLE_NAMES[p.role]} ({p.email === me ? 'you' : 'owner'})</span> : (
                <div className="row">
                  <select aria-label={`Role for ${p.email}`} value={p.role} disabled={busy}
                    onChange={(e) => { const r = e.target.value as Role; change(() => setPersonRole(p.email, r), `${p.name ?? p.email} is now ${ROLE_NAMES[r]}.`); }}>
                    <option value="member">Member</option>
                    <option value="hod">HoD</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button type="button" className="chip" disabled={busy} onClick={() => remove(p)}>Remove</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="floating" aria-live="polite">{toast}</div>
    </section>
  );
}
