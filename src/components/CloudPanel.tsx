import { useEffect, useRef, useState } from 'react';
import { CloudError, isSetId, loadSet, saveSet, type CloudConfig } from '../lib/cloud';
import { addSaved, loadSaved, removeSaved, storeSaved, type SavedSet } from '../lib/saved';

interface Props {
  cfg: CloudConfig;
  title: string;
  raw: string;
  /** Replace the editor's title and questions with an opened set. */
  onLoad: (title: string, raw: string) => void;
}

interface Note { ok: boolean; text: string; link?: string; undo?: boolean }

const linkFor = (id: string) => `${location.origin}${location.pathname}?set=${id}`;
const messageOf = (e: unknown) => (e instanceof CloudError ? e.message : 'Something went wrong. Try again.');

/** Save the current questions online, and open saved sets (from this browser's list or a shared link). */
export function CloudPanel({ cfg, title, raw, onLoad }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [saved, setSaved] = useState<SavedSet[]>(loadSaved);
  const [copied, setCopied] = useState('');
  const previous = useRef<{ title: string; raw: string } | null>(null);
  const latest = useRef({ title, raw });
  latest.current = { title, raw };

  async function open(id: string) {
    setBusy(true);
    setNote(null);
    try {
      const set = await loadSet(cfg, id);
      if (!set) {
        setNote({ ok: false, text: 'No saved set was found for that link. It may have been removed.' });
        return;
      }
      previous.current = latest.current; // so "Undo" can put back what was in the editor
      onLoad(set.title, set.raw);
      setNote({ ok: true, text: `Opened “${set.title}”.`, undo: true });
    } catch (e) {
      setNote({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  }

  // A shared link looks like  /?set=<id>. Open it once, then tidy the address bar.
  useEffect(() => {
    const url = new URL(location.href);
    const id = url.searchParams.get('set');
    if (id === null) return;
    url.searchParams.delete('set');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    if (!isSetId(id)) {
      setNote({ ok: false, text: 'That is not a valid link to a saved set.' });
      return;
    }
    void open(id);
  }, []); // eslint-disable-line

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const id = await saveSet(cfg, title, raw);
      const next = addSaved(saved, { id, title: title.trim() || 'Untitled', at: Date.now() });
      setSaved(next);
      storeSaved(next);
      setNote({ ok: true, text: 'Saved. Anyone with this link can open it:', link: linkFor(id) });
    } catch (e) {
      setNote({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  }

  const copy = (text: string, key: string) => {
    const done = () => { setCopied(key); setTimeout(() => setCopied(''), 2000); };
    try { navigator.clipboard.writeText(text).then(done, () => setCopied('')); } catch { /* the link is also shown in a box to select */ }
  };

  const forget = (id: string) => {
    const next = removeSaved(saved, id);
    setSaved(next);
    storeSaved(next);
  };

  return (
    <div className="cloud">
      <p>Keep this set online to open it on another device or share a link. Anyone with the link can open it, so don’t save anything private.</p>
      <div className="row">
        <button type="button" className="btn" disabled={busy || !raw.trim()} onClick={save}>{busy ? 'Working…' : 'Save online'}</button>
      </div>

      {note && (
        <div role="status" className={`notice ${note.ok ? 'ok' : 'bad'}`}>
          <span>{note.text}</span>
          {note.link && (
            <span className="link-row">
              <input readOnly value={note.link} aria-label="Link to this saved set" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn tiny" onClick={() => copy(note.link!, 'new')}>{copied === 'new' ? 'Copied ✓' : 'Copy link'}</button>
            </span>
          )}
          {note.undo && previous.current && (
            <span>
              <button type="button" className="btn tiny" onClick={() => { const p = previous.current!; onLoad(p.title, p.raw); previous.current = null; setNote({ ok: true, text: 'Put back what you had before.' }); }}>
                Undo
              </button>
            </span>
          )}
        </div>
      )}

      {saved.length > 0 && (
        <details className="saved">
          <summary>Saved online ({saved.length})</summary>
          <ul>
            {saved.map((s) => (
              <li key={s.id}>
                <span className="t">{s.title} <small>{new Date(s.at).toLocaleDateString()}</small></span>
                <span className="row tight">
                  <button type="button" className="btn tiny" disabled={busy} onClick={() => open(s.id)}>Open</button>
                  <button type="button" className="btn tiny quiet" onClick={() => copy(linkFor(s.id), s.id)}>{copied === s.id ? 'Copied ✓' : 'Copy link'}</button>
                  <button type="button" className="btn tiny quiet" onClick={() => forget(s.id)} title="Remove from this list. The saved set stays online.">Forget</button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
