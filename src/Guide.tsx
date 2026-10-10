import { useEffect, useRef } from 'react';
import { ALL_BOARDS, MAX_NAME, MAX_NO, SUBJECTS } from './details';
import { MAX_ANSWER, MAX_QUESTION } from './format';

/** How to write questions for this site: for people. (Chatbots get their own instructions in the page's HTML.) */
export function Guide() {
  const ref = useRef<HTMLElement>(null);
  // each card fades up the first time it scrolls into view
  useEffect(() => {
    const cards = [...(ref.current?.querySelectorAll<HTMLElement>('.g-card') ?? [])];
    cards.forEach((c, i) => c.style.setProperty('--d', `${(i % 3) * 70}ms`));
    if (typeof IntersectionObserver === 'undefined') return cards.forEach((c) => c.classList.add('seen'));
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('seen');
      io.unobserve(e.target);
    }), { rootMargin: '0px 0px -8% 0px' });
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  return (
    <section className="guide" id="guide" tabIndex={-1} ref={ref} aria-labelledby="guide-h">
      <h2 id="guide-h">How to write your questions</h2>

      <div className="guide-grid">
        <article className="g-card wide">
          <h3>The format</h3>
          <ol className="steps">
            <li><b>Fill in Board, Class, Subject and Chapter.</b> They are written at the top of the Questions box for you, and you can edit them in either place.</li>
            <li><b>Add a Topic line, then one question per line:</b> the question, a bar <code>|</code>, then the answer. To say how hard it is, add another bar and <i>easy</i>, <i>medium</i> or <i>hard</i>.</li>
            <li><b>Fix anything underlined</b>, check the table, then <b>send it for approval</b> (or download it). Your HoD approves it on the HoD desk; only approved questions are used in the games.</li>
          </ol>
          <pre className="sample">{`Board: CBSE
Class: 10
Subject: Science
Chapter 1: Chemical Reactions and Equations
Topic 1: Chemical Equations
Law that requires a chemical equation to be balanced | Law of conservation of mass | medium
Equation with the same number of atoms of each element on both sides | Balanced equation
Topic 2: Types of Chemical Reactions
Reaction in which a single reactant breaks down into simpler products | Decomposition reaction | easy`}</pre>
        </article>

        <article className="g-card">
          <h3>Detail lines</h3>
          <p>Each one applies to every question below it, until it is changed.</p>
          <dl className="rules">
            <dt><code>Board: CBSE</code></dt>
            <dd>CBSE, ICSE, ISC, IB, IGCSE, Cambridge, Edexcel, NIOS, a state board such as <i>Maharashtra</i>, or another board on the list below.</dd>
            <dt><code>Class: 10</code></dt>
            <dd>1 to 12.</dd>
            <dt><code>Subject: Chemistry</code></dt>
            <dd>The textbook's subject, as in the list below.</dd>
            <dt><code>Chapter 3: Acids, Bases and Salts</code></dt>
            <dd>Number and name, as in the textbook.</dd>
            <dt><code>Topic 2: Indicators</code></dt>
            <dd>Number and name, as in the textbook. Its questions go under it.</dd>
          </dl>
          <p className="small muted">Names are capitalised for you: <i>acids, bases and salts</i> becomes <i>Acids, Bases and Salts</i>. Questions and answers are never changed.</p>
        </article>

        <article className="g-card">
          <h3>Writing good questions</h3>
          <ul className="ticks">
            <li><b>One fact per question</b>, with exactly one correct answer.</li>
            <li><b>Short answers:</b> a word, a short phrase or a number (at most {MAX_ANSWER} characters). Puzzles need them short.</li>
            <li><b>Questions that stand alone:</b> no <i>this</i>, <i>the above</i> or <i>as mentioned</i>. At most {MAX_QUESTION} characters.</li>
            <li><b>Fill in the blank:</b> write <code>___</code> where the answer goes: <code>The ___ is the powerhouse of the cell | Mitochondria</code>.</li>
            <li><b>No <code>|</code> inside</b> a question or answer: it separates them. Use <code>/</code>.</li>
            <li><b>No repeats:</b> the same question twice in a chapter is left out.</li>
          </ul>
        </article>

        <article className="g-card">
          <h3>Underlines and warnings</h3>
          <p><span className="mark error">Red</span>: the line is <b>left out</b>. It has no answer, no question, an empty part, too many parts, is too long, is a repeat, the class is not 1 to 12, or the board or subject isn't on the site's list.</p>
          <p><span className="mark warn">Amber</span>: the line is <b>kept, but check it</b>. A chapter with no number or name, a topic with no questions, a detail set twice, or the same chapter number with two different names.</p>
          <p className="small muted">You can write first: a line is only checked once you move on from it, and a box once you leave it or pause. Put the cursor on an underlined line to see why, or click a line number in the list.</p>
        </article>

        <article className="g-card">
          <h3>Chapter and topic IDs</h3>
          <p>Every question gets the ID of its chapter and topic, made from the details, so the same chapter always gets the same ID:</p>
          <p className="id-demo" aria-label="CBSE, class 10, Science, chapter 1, topic 2">
            <span><b>CBSE</b>board</span><span><b>10</b>class</span><span><b>SCI</b>subject</span><span><b>01</b>chapter</span><span><b>T02</b>topic</span>
          </p>
          <p className="small muted">A question needs a board, class, subject and chapter number to get a chapter ID, and a topic number too for a topic ID. Chapter and topic numbers go up to {MAX_NO}; names up to {MAX_NAME} characters.</p>
          <details>
            <summary>Board codes</summary>
            <p className="codes">
              {ALL_BOARDS.map((b) => <span key={b.code}><b>{b.code}</b> {b.name}</span>)}
            </p>
          </details>
          <details>
            <summary>Subject codes</summary>
            <p className="codes">{SUBJECTS.map((s) => <span key={s.code}><b>{s.code}</b> {s.name}</span>)}</p>
            <p className="small muted">Only boards and subjects on these lists can be used. If yours is missing, tell the site's admin.</p>
          </details>
        </article>

        <article className="g-card">
          <h3>Starting from notes</h3>
          <ol className="steps">
            <li>Press <b>Copy chatbot prompt</b>.</li>
            <li>Paste it into ChatGPT, Gemini or Claude, and add your notes, or just the class, subject and chapter.</li>
            <li>Paste its reply into the Questions box, and check the answers before you use them.</li>
          </ol>
        </article>
      </div>
    </section>
  );
}
