import { LIMITS } from '../lib/games';

export function Tips({ online = false }: { online?: boolean }) {
  return (
    <section id="info" aria-labelledby="h-info" className="tips">
      <h2 id="h-info">Quick tips</h2>
      <div className="tip" style={{ background: '#EEF2F8' }}><b style={{ color: '#1F4FD1' }}>Data format:</b> one pair per line: <code>Question | Answer</code>. Pasting from Google Sheets or a Markdown table works too.</div>
      <div className="tip" style={{ background: '#DDF3EF' }}><b style={{ color: '#0C7A6B' }}>Fill-in-the-Blank:</b> put <code>___</code> in your question to choose where the blank goes.</div>
      <div className="tip" style={{ background: '#FCEBDD' }}><b style={{ color: '#B4531B' }}>Crossword:</b> needs 2+ answers that share letters. Answers are {LIMITS.crossword.min}–{LIMITS.crossword.max} letters or digits; spaces and accents are ignored.</div>
      <div className="tip" style={{ background: '#FBE3EE' }}><b style={{ color: '#B0306B' }}>Word Search:</b> hides only the answers in a grid. {LIMITS.wordSearch.min}–{LIMITS.wordSearch.max} letters or digits each.</div>
      <div className="tip" style={{ background: '#E6EDFD' }}><b style={{ color: '#1F4FD1' }}>Layouts:</b> long lists are split so each puzzle stays a printable size (10 questions by default; change it in Step 2). Switch between layouts in Step 3, or download them all as one zip.</div>
      <div className="tip bare"><b>Downloads:</b> JSON for apps, a printable worksheet with answer key, CSV for spreadsheets, text for anywhere. {online ? 'Your work is kept in this browser; it is only uploaded if you press Save online.' : 'Your work is saved in this browser and never uploaded.'}</div>
    </section>
  );
}
