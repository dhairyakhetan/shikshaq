/**
 * Revise: the students' part. It reads only approved questions from the database (src/db.ts); the student picks a
 * class, subject and chapter, and the topics they studied, and a puzzle is made from those questions on their device by src/games, which
 * checks every puzzle before it is shown. Works on its own: no formatter or HoD desk code.
 */
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { counts, useBank, type BankQuestion } from './db';
import { GAME_TYPES, makeGame, seedOf, type Game, type GameType, type Item } from './games';
import { GameView } from './playgames';
import { SectionHeader } from './ui';

const NAMES: Record<GameType, string> = { crossword: 'Crossword', wordsearch: 'Word search', matching: 'Matching', fill: 'Fill in the blank' };

interface Topic { key: string; no: number | null; name: string; count: number }
interface Chapter { id: string; cls: number | null; subject: string; no: number | null; name: string; title: string; meta: string; topics: Topic[]; questions: BankQuestion[] }

const topicKey = (q: BankQuestion) => q.topic_id ?? `${q.chapter_id}|${q.topic}`;

/** Approved questions grouped into chapters and their topics, by class, subject and chapter number. */
function chaptersOf(questions: BankQuestion[]): Chapter[] {
  const byChapter = new Map<string, BankQuestion[]>();
  for (const q of questions) if (q.chapter_id) byChapter.set(q.chapter_id, [...(byChapter.get(q.chapter_id) ?? []), q]);
  return [...byChapter].map(([id, qs]) => {
    const topics = new Map<string, Topic>();
    for (const q of qs) {
      const k = topicKey(q);
      const t = topics.get(k) ?? { key: k, no: q.topic_no, name: q.topic || 'Other questions', count: 0 };
      t.count++;
      topics.set(k, t);
    }
    const q0 = qs[0];
    return {
      id, questions: qs, cls: q0.class, subject: q0.subject, no: q0.chapter_no, name: q0.chapter,
      title: `Chapter ${q0.chapter_no}: ${q0.chapter}`,
      meta: [q0.board, q0.class && `Class ${q0.class}`, q0.subject].filter(Boolean).join(' · '),
      topics: [...topics.values()].sort((a, b) => (a.no ?? 99) - (b.no ?? 99)),
    };
  }).sort((a, b) => (a.cls ?? 0) - (b.cls ?? 0) || a.subject.localeCompare(b.subject) || (a.no ?? 0) - (b.no ?? 0));
}

function Revise() {
  const [bank] = useBank();
  const chapters = useMemo(() => chaptersOf(bank.questions.filter((q) => q.status === 'approved')), [bank]);
  const [pick, setPickState] = useState({ chapter: '', topics: [] as string[] });
  const [round, setRound] = useState(0);
  const [want, setWant] = useState<GameType | null>(null);
  const setPick = (p: { chapter: string; topics: string[] }) => {
    setPickState(p);
    setRound(0);
  };

  const chapter = chapters.find((c) => c.id === pick.chapter) ?? chapters[0];
  const classes = [...new Set(chapters.map((c) => c.cls))];
  const subjects = [...new Set(chapters.filter((c) => c.cls === chapter?.cls).map((c) => c.subject))];
  const inSubject = chapters.filter((c) => c.cls === chapter?.cls && c.subject === chapter?.subject);
  const open = (c: Chapter | undefined) => { if (c) setPick({ chapter: c.id, topics: [] }); };
  const known = new Set(chapter?.topics.map((t) => t.key));
  const chosen = pick.chapter === chapter?.id && pick.topics.some((t) => known.has(t)) ? pick.topics.filter((t) => known.has(t)) : [...known];
  const items: Item[] = useMemo(
    () => (chapter?.questions ?? []).filter((q) => chosen.includes(topicKey(q))).map((q) => ({ id: q.id, question: q.question, answer: q.answer })),
    [chapter, chosen.join('|')],
  );
  const seed = seedOf(`${chapter?.id}|${chosen.join(',')}|${round}`);
  // every game these questions can make (each one already checked), so the student can switch between them
  const games = useMemo(() => {
    const out: Partial<Record<GameType, Game>> = {};
    for (const t of GAME_TYPES) { const g = makeGame(t, items, seed); if (g) out[t] = g; }
    return out;
  }, [items, seed]);
  const type = want && games[want] ? want : GAME_TYPES.find((t) => games[t]);
  const game = type && games[type];

  const toggle = (k: string) => {
    const next = chosen.includes(k) ? chosen.filter((t) => t !== k) : [...chosen, k];
    if (next.length) setPick({ chapter: chapter!.id, topics: next });
  };

  return (
    <>
      <SectionHeader here="play" waiting={counts(bank).pending} />
      <main className="page play">
        <div className="intro enter">
          <h1>Revise</h1>
          <p>Pick the topics you studied, and play a short puzzle made from them.</p>
        </div>

        {!chapter ? (
          <div className="empty-state enter">
            <p><b>No approved questions yet.</b> Questions appear here once the HoD approves them.</p>
          </div>
        ) : (
          <>
            <section className="card stack picker enter" aria-labelledby="pick-h">
              <h2 id="pick-h">What are you revising?</h2>
              <div className="pick-top">
                <div className="pick-row">
                  <span className="pick-label" id="class-l">Class</span>
                  <div className="tabs" role="radiogroup" aria-labelledby="class-l">
                    {classes.map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={n === chapter.cls} className={`tab${n === chapter.cls ? ' on' : ''}`}
                        onClick={() => open(chapters.find((c) => c.cls === n))}>Class {n}</button>
                    ))}
                  </div>
                </div>
                <div className="pick-row">
                  <span className="pick-label" id="subject-l">Subject</span>
                  <div className="tabs" role="radiogroup" aria-labelledby="subject-l">
                    {subjects.map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={s === chapter.subject} className={`tab${s === chapter.subject ? ' on' : ''}`}
                        onClick={() => open(chapters.find((c) => c.cls === chapter.cls && c.subject === s))}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <span className="pick-label" id="chapter-l">Chapter</span>
                <ul className="chapters" aria-labelledby="chapter-l">
                  {inSubject.map((c) => (
                    <li key={c.id}>
                      <button type="button" className={`chapter${c.id === chapter.id ? ' on' : ''}`} aria-pressed={c.id === chapter.id} onClick={() => open(c)}>
                        <span className="ch-no">Chapter {c.no}</span>
                        <b>{c.name}</b>
                        <span className="small muted">{c.topics.length} topics · {c.questions.length} questions</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <fieldset className="topics">
                <legend>Which topics of Chapter {chapter.no} did you study?</legend>
                {chapter.topics.map((t) => (
                  <label key={t.key} className={`topic${chosen.includes(t.key) ? ' on' : ''}`}>
                    <input type="checkbox" checked={chosen.includes(t.key)} onChange={() => toggle(t.key)} />
                    {t.no !== null && <b>{t.no}</b>} {t.name} <span className="muted">({t.count})</span>
                  </label>
                ))}
              </fieldset>
            </section>

            <section className="card stack enter" aria-label="Puzzle" style={{ animationDelay: '60ms' }}>
              <div className="batch-head">
                <div className="tabs" role="tablist" aria-label="Game">
                  {GAME_TYPES.map((t) => (
                    <button key={t} type="button" role="tab" aria-selected={t === type} className={`tab${t === type ? ' on' : ''}`} disabled={!games[t]}
                      title={games[t] ? undefined : 'These topics don\'t have enough suitable answers for this game'} onClick={() => setWant(t)}>
                      {NAMES[t]}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn small quiet" onClick={() => setRound((r) => r + 1)}>New puzzle</button>
              </div>
              {game ? <GameView key={`${type}|${seed}`} game={game} onNext={() => setRound((r) => r + 1)} /> : (
                <p className="empty">These topics don't have enough questions for a puzzle yet. Pick more topics.</p>
              )}
            </section>
            <p className="demo small">Demo: these are sample questions built into the page, and nothing is saved. In Shikshaq they will come from the database, and only questions the HoD approved are shown.</p>
          </>
        )}
      </main>
    </>
  );
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <Revise />
  </StrictMode>,
);
