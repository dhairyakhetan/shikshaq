# Shikshaq – study games from a Google Sheet

One site, four games. Someone types questions and answers into a Google Sheet; the site turns
them into playable games automatically. No build step per game, no database, no redeploy when the sheet changes.

| Game | How it plays | Which rows it uses |
| --- | --- | --- |
| 🔗 **Matching** | Pair questions with shuffled answers | Any row |
| ✏️ **Fill in the blank** | Type the answer; `___` in the question marks the blank | Any row (no `___` → answer goes under the question) |
| 🧩 **Crossword** | Answers interlock in a grid, questions are the clues | Answers of 3–15 letters/digits |
| 🔎 **Word search** | Drag across the letters to answer each clue | Answers of 3–12 letters/digits |

Each play is a short round (6–10 random questions); **New round** reshuffles. Best score per game is kept in the browser.

## The sheet

| Question | Answer | Type | Subject | Difficulty |
| --- | --- | --- | --- | --- |
| Capital of France? | Paris | | Geography | Easy |
| The \_\_\_ of France is Paris | capital | fillBlank | Geography | Easy |
| Large feline predator | Lion | wordSearch | Biology | Easy |
| Capital of Japan? | Tokyo \| Tokyo, Japan | matching,crossword | Geography | Medium |

- **Question** and **Answer** are required. The other columns are optional; header order doesn't matter.
- **Type** is optional. Blank means "use this row in every game it suits". Otherwise list one or more of
  `matching`, `fillBlank`, `crossword`, `wordSearch` (comma/semicolon separated).
- **Subject / Difficulty** become filters on the menu. A filtered link such as `/play/crossword?subject=Biology` can be shared.
- **Alternative answers**: separate with `|` (`Paris|paris france`). The first is displayed; all are accepted.
- Rows that are blank, duplicated, or unreasonably long are skipped, and the menu lists them with their sheet row numbers
  under *"rows need attention"*.

**Answer checking** ignores case, punctuation and accents, and forgives one typo in words of 5–9 letters (two for 10+).
Short words and anything containing digits must be exact. Hindi and other scripts work in Matching and Fill in the blank;
Crossword and Word search only take A–Z / 0–9 answers.

## Deploy to Vercel

1. Share the sheet: **Share → Anyone with the link → Viewer** (or **File → Share → Publish to web → CSV**).
2. Push this repo to GitHub and **Import** it in Vercel. The Vite preset is detected; nothing to configure.
3. Add an environment variable **`SHEET_CSV_URL`** = the sheet's URL (the normal browser URL works, and so does a "Publish to web" CSV link),
   then redeploy once.

From then on, sheet edits go live without a redeploy: `/api/questions` is edge-cached for 60 s and refreshes in the background, so a change shows up within a minute or two (at most about five). If `SHEET_CSV_URL`
is unset the site runs on the sample questions in `public/questions.csv`, so a fresh deploy always works.

`vercel.json` only adds the rewrite that lets deep links like `/play/matching` load.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173, uses public/questions.csv
npm test           # parsers, answer matching, crossword + word search generators, API function
npm run build      # typecheck + production build into dist/
npx vercel dev     # optional: also runs /api/questions locally (needs SHEET_CSV_URL)
```

```
api/questions.ts      Vercel function – fetches the sheet as CSV
src/data.ts           loads the sheet (or the sample) and validates rows
src/lib/              CSV parser, answer matching, crossword + word-search generators, score storage
src/games/            one React component per game + the registry (src/games/index.ts)
src/pages/            menu and play pages
public/questions.csv  sample questions
```

**Adding a game:** write a component taking `{ items, onFinish }`, then add an entry to `GAMES` in `src/games/index.ts`
(title, round size, which rows suit it). The menu, filters, scoring and routing pick it up.

## Scores

Best score and play count per game are stored in `localStorage` under `shikshaq:scores:v1`
(`{ "<game>": { "best": 0-100, "plays": n } }`), so a dashboard on the same origin can read them. There is no server-side
score storage or multiplayer; that would be the point to add a database.
