# Shikshaq – turn study data into games

One site, four games, and a workflow that starts with **data from the user**:

1. The user gives a chatbot their notes or questions and the address of this site.
2. The home page is written for the chatbot: plain HTML with exact instructions (`src/instructions.html`). The chatbot
   replies with one CSV block in a fixed format.
3. The user pastes the CSV into **Step 1 · Paste your questions** on the home page (or into a connected Google Sheet).
4. The site builds the games from the rows in the browser: no build step per game, no database, no redeploy.

The instructions are baked into `index.html` at build time, so a fetcher that doesn't run JavaScript (most chatbot
web-fetch tools, `curl`) receives them on **every** URL of the site. The same file is rendered on the home page for people.
Tests (`tests/instructions.test.ts`) fail if the page and the code drift apart: limits, minimums, round sizes, type names,
button labels, and the worked examples are parsed with the real parser.

Where the questions come from, first match wins: **pasted by the user** (this browser only) → **Google Sheet** via
`/api/questions` (when `SHEET_CSV_URL` is set) → the **bundled sample** in `public/questions.csv`.

| Game | How it plays | Which rows it uses |
| --- | --- | --- |
| 🔗 **Matching** | Pair questions with shuffled answers | Any row |
| ✏️ **Fill in the blank** | Type the answer; `___` in the question marks the blank | Any row (no `___` → answer goes under the question) |
| 🧩 **Crossword** | Answers interlock in a grid, questions are the clues | Answers of 3–15 letters/digits |
| 🔎 **Word search** | Drag across the letters to answer each clue | Answers of 3–12 letters/digits |

Each play is a short round (6–10 random questions); **New round** reshuffles. Best score per game is kept in the browser.

## The data format (CSV, or cells pasted from a spreadsheet)

| Question | Answer | Type | Subject | Difficulty |
| --- | --- | --- | --- | --- |
| Capital of France? | Paris | | Geography | Easy |
| The \_\_\_ of France is Paris | capital | fillBlank | Geography | Easy |
| Large feline predator | Lion | wordSearch | Biology | Easy |
| Capital of Japan? | Tokyo \| Tokyo, Japan | matching,crossword | Geography | Medium |

- Pasted tab-separated text (copied from Google Sheets or Excel) works too.
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
npm test           # parsers, answer matching, generators, API function, instructions-vs-code drift guard
npm run build      # typecheck + production build into dist/
npx vercel dev     # optional: also runs /api/questions locally (needs SHEET_CSV_URL)
```

```
src/instructions.html the instructions for chatbots – single source: baked into index.html and rendered on the home page
vite.config.ts        build plugin that bakes the instructions into index.html
api/questions.ts      Vercel function – fetches the sheet as CSV
src/data.ts           picks the data source (pasted → sheet → sample) and validates rows
src/lib/              CSV parser, answer matching, crossword + word-search generators, score storage
src/games/            one React component per game + the registry (src/games/index.ts)
src/pages/            home (instructions, paste box, game menu) and play pages
public/questions.csv  sample questions
```

**Changing a rule** (a limit, a minimum, a type name, a label)? Update `src/instructions.html` in the same change;
`npm test` tells you what no longer matches.

**Adding a game:** write a component taking `{ items, onFinish }`, then add an entry to `GAMES` in `src/games/index.ts`
(title, round size, which rows suit it). The menu, filters, scoring and routing pick it up.

## Scores

Best score and play count per game are stored in `localStorage` under `shikshaq:scores:v1`
(`{ "<game>": { "best": 0-100, "plays": n } }`), so a dashboard on the same origin can read them. There is no server-side
score storage or multiplayer; that would be the point to add a database.
