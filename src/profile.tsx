/**
 * The profile page: the person's avatar (pick one), name, email and role, a bio, and signing out. The avatar and bio are
 * kept on this device only (localStorage). For the admin, a list of people underneath: add someone by email with a role,
 * change anyone's role, or take them off the list. Roles live in the database, and each person's device asks for theirs
 * every time the site opens, so a change shows on their next refresh.
 */
import { useCallback, useEffect, useState } from 'react';
import { loadPeople, removePerson, ROLE_NAMES, setPersonRole, type Person, type Role } from './db';
import { Avatar, AVATAR_COUNT, avatarFor, SignOutIcon, useUndo } from './ui';

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

export function ProfilePage({ name, email, role, profile, onChange, onSignOut }: {
  name: string; email: string; role: Role; profile: Profile; onChange: (p: Partial<Profile>) => void; onSignOut: () => void;
}) {
  return (
    <main className="page profile">
      <section className="card stack enter" aria-labelledby="me-h">
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
          <span className="small muted">Your avatar and bio are kept on this device only.</span>
        </div>

        <div className="row">
          <button type="button" className="btn quiet" onClick={onSignOut}><SignOutIcon /> Sign out</button>
        </div>
      </section>

      {role === 'admin' && <People me={email} />}
    </main>
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
        <p className="small muted">Everyone who signs in is a member: they can send questions and see the HoD desk. HoDs can also approve questions. Admins can also see Revise and change roles. A change shows the next time the person opens or refreshes the site.</p>
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
              {p.email === me ? <span className={`role-badge ${p.role}`}>{ROLE_NAMES[p.role]} (you)</span> : (
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
