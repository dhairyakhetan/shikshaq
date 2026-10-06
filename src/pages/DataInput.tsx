import { useState } from 'react';
import { useDataset, useReload } from '../App';
import { clearPasted, savePasted } from '../lib/pasted';
import { parseQuestions } from '../lib/questions';

const PLACEHOLDER = `Question,Answer,Type,Subject,Difficulty
Capital of France?,Paris,,Geography,Easy
The ___ is the powerhouse of the cell,mitochondria,,Biology,Medium`;

export function DataInput() {
  const data = useDataset();
  const reload = useReload();
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const { items } = parseQuestions(text);
    if (!items.length) {
      return setMessage({ ok: false, text: 'No usable rows found. The first line must be Question,Answer,Type,Subject,Difficulty, followed by one question per line.' });
    }
    if (!savePasted(text)) {
      return setMessage({ ok: false, text: "Your browser wouldn't save the questions (private browsing or full storage), so they can't be loaded." });
    }
    await reload();
    setText('');
    setMessage({ ok: true, text: `Loaded ${items.length} question${items.length === 1 ? '' : 's'}. Pick a game below.` });
  }

  async function remove() {
    clearPasted();
    await reload();
    setMessage(null);
  }

  return (
    <section className="input">
      <h2>Step 1 · Paste your questions</h2>
      <p className="hint">
        Paste the CSV your chatbot gave you, or cells copied from a spreadsheet. It stays in this browser; nothing is uploaded.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={7}
        spellCheck={false}
        aria-label="Questions and answers as CSV"
      />
      <div className="row">
        <button className="btn primary" onClick={load} disabled={!text.trim()}>Load questions</button>
        {data.source === 'pasted' && <button className="btn" onClick={remove}>Remove my questions</button>}
      </div>
      {message && <p className={`notice ${message.ok ? 'ok' : 'bad'}`} role="status">{message.text}</p>}
    </section>
  );
}
