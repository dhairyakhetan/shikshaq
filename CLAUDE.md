# CLAUDE.md

Two things live in this repo, both for **Shikshaq** (shikshaq.in; its main code is `kushalsetha/Shikshaq`, a React + Vite +
Supabase app):

1. **Question Formatter** (the website, two pages):
   - `/` **Format**: people paste questions and answers in any format and get clean rows for the question bank, each
     linked to its chapter and topic by an ID. They download them or send them to the HoD for approval. Chatbots that
     fetch the page get hidden instructions for writing questions in the right format.
   - `/review` **Approve**: the HoD approves questions or sends them back with a reason. Approved questions are the
     question bank. A demo for now: saved in the browser, shaped like the planned Shikshaq tables.
2. **Revision games engine** (`src/games/`): makes crossword, word search, matching and fill-in-the-blank puzzles from
   bank questions on the student's device, with no AI. Not used by the website yet; it will go into Shikshaq.

## Commands

```bash
npm run dev      # http://localhost:5173
npm test         # all tests (about 5 s)
npm run build    # typecheck + production build into dist/
npm run stress   # 2,500 question sets of each kind through every game (about 3 min)
```

Stack: React 19, Vite 8, TypeScript 7, vitest 5. Deployed on Vercel from `main` (static site, no environment variables).

## How to work here

- **Push to `main`.** Run `npx tsc --noEmit`, `npm test` and `npm run build` first.
- **Fewer files is better**, as long as no file gets huge. Merge small files into their natural neighbour rather than
  adding new ones.
- **Plain language** in everything people read (site text, guide, docs): short sentences, no jargon. The site's users are
  teachers and students, not developers.
- **Questions and answers are never reworded** by any code. Only numbering, labels, bullets, Markdown and spaces are removed.
- **Keep the chatbot instructions and the code in step.** `tests/instructions.test.ts` fails if they disagree; change
  `src/instructions.html` in the same commit as the rule.
- **Write invisible characters as escapes** (`'​'`, `' '`), never as the raw character: tools can't match or
  edit them reliably.

## Files

### Website

| File | What it does |
| --- | --- |
| `index.html` | The page shell. `<div id="app">` is where React draws. `<main id="for-ai">` holds the chatbot instructions (baked in at build). A one-line script in `<head>` adds the `js` class before the first paint, and `.js #for-ai { display: none }` hides the instructions from people. No `hidden` attribute on purpose: some fetchers drop hidden elements. |
| `vite.config.ts` | Vite + React, plus the `bake-instructions` plugin that replaces `<!--INSTRUCTIONS-->` in `index.html` with `src/instructions.html`. Also the vitest config. |
| `src/instructions.html` | Instructions for AI assistants: how to get the material, work out board/class/subject/chapter/topics, write short-answer questions, and reply in the exact format the formatter reads. Has `<pre id="format">` and `<pre id="example">`, which the tests parse. |
| `src/main.tsx` | Startup and the two pages. `App` picks the page from the address (`/` or `/review`, with `pushState` and the back button), draws the shared header (Format / Approve with the number waiting), and holds the question bank (`useBank`). `Formatter` is the Format page: the text (the single source of truth, saved in `localStorage` key `question-formatter:v1`), the cursor line, which detail box is being typed in, undo, button feedback; it runs `format()`, decides which problems to show (`visibleIssues`), builds the notes, and handles download, copy, "Send for approval" (teacher's name kept in `question-formatter:name`), smooth scrolling and the phone "jump to results" pill. |
| `src/review.tsx` | The Approve page and the question bank behind it. Pure functions first (`addBatch`: a teacher's batch, skipping questions with no chapter ID or already waiting/approved; `setStatus`: approve, send back with a reason, or move back to waiting; `counts`), then `useBank` (kept in `localStorage` key `question-bank:v1`, in step across tabs), then `ReviewPage`: tabs Waiting / Approved / Sent back, batches grouped by chapter and topic, approve or send back per question or per batch, the reason box, rows sliding away, undo for every action, "Add a sample batch", download of the approved bank. To move to Shikshaq's database, replace `useBank`'s storage; the shapes (`Batch`, `BankQuestion`) match the planned tables. |
| `src/ui.tsx` | Parts both pages use: `Editor` (the Questions box: a transparent textarea over an exact copy of its text that carries the red/amber underlines; the copy is kept to the same width and scroll, and the note under it explains the line the cursor is on), `RowsTable` (rows grouped by chapter and topic with their IDs; rows slide in; optional buttons under each row and stable keys, used by the Approve page), `useUndo` (the "Undo" bar), the icons (`ActionIcon` swaps an icon for a check mark without resizing the button) and `Logo`. |
| `src/Guide.tsx` | "How to write your questions", the guide for people at the bottom of the page. Board and subject code lists and limits come from the code, so they can't drift. Cards fade in as they scroll into view. |
| `src/styles.css` | All styling. Colours are variables on `:root`. The motion section at the end: no overshoot, only transform and opacity animate, and "reduce motion" turns sliding and scaling off (`--rise`, `--press`, `--pop` become 0/1). |
| `public/favicon.svg` | Tab icon. |
| `vercel.json` | Security headers, long caching for hashed files in `/assets/`, and `/review` served by `index.html`. |

### Formatter logic

| File | What it does |
| --- | --- |
| `src/format.ts` | `format(text)` → `{ rows, issues }`. Reads every line: detail lines (`Board:`, `Class 10`, `Chapter 1: ...`, `## Topic 2 - ...`), `Q \| A \| difficulty`, tab or CSV tables with a header row in any order, numbered lists, `Q.`/`Ans.` on one or two lines, `question? answer`, `=`, arrows, ` - `, `: `. Each row gets `chapter_id`, `topic_id`, numbered topics and questions. Issues are `error` (line left out) or `warn` (kept, check it), with line numbers. Also `visibleIssues` (problems near the cursor wait until the person moves on), `lineLevels`, `missing`, the output (`toCSV` with no byte-order mark, `toJSON`, `toTSV`, `baseName` for file names), and `EXAMPLE` for "Try an example". `COLUMNS` is the column order of every export. |
| `src/details.ts` | Everything about board, class, subject, chapter and topic. Text helpers first (`tidy`, `titleCase`, `distance`, `pad2`). Then the board list (national boards and states with codes), class 1 to 12 (numbers, ordinals, Roman), 44 subjects with 3-letter codes, typo hints, made-up codes for unknown names, `checkNumbered` for chapters and topics, the IDs (`chapterId` = board + class + subject code + chapter, e.g. `CBSE11CHE01`; `topicId` adds `T03`), `readMeta` (is this line a detail line?), and the four boxes, which are the detail lines at the top of the text (`readDetails`, `writeDetail`, `detailLine`, `checkDetail`, `standardDetail`, `detailsId`). |

### Games engine (`src/games/`)

Each game file has a **maker** and a separately written **checker**. A puzzle is only returned after its checker passes
it. The rules are explained for people in `docs/games.md`.

| File | What it does |
| --- | --- |
| `src/games/index.ts` | The entry point. `makeGame(type, items, seed)` makes, checks, and retries with new seeds (`TRIES` = 12). `makePuzzle(items, seed, prefer)` tries games in order (crossword, word search, matching, fill) and returns the first that works. `checkGame` dispatches to the right checker. |
| `src/games/shared.ts` | Rules all games share: `Item` (`{ id, question, answer }`), `loose`/`sameAnswer` (how typed answers are compared), `gridWord` (answer → A to Z letters, or null when it can't go in a grid), `enumeration` ("(8, 8)"), `usable`. Plus seeded randomness: `rng` (mulberry32), `seedOf` (text → seed), `shuffle`. |
| `src/games/matching.ts` | 3 to 8 pairs with different answers, both sides shuffled, never in the same order. |
| `src/games/fill.ts` | 1 to 10 questions, each with one gap: at `___`, else where the answer appears once, else at the end. Never shows its own answer. |
| `src/games/wordsearch.ts` | 3 to 10 words of 3 to 12 letters in an 8 to 15 grid, forwards directions only. Every word must be findable in exactly one place in all 8 directions; filler letters are repainted until true; words that contain each other aren't used together. `occurrences()` finds every place a word can be read. |
| `src/games/crossword.ts` | 3 to 12 answers of 3 to 15 letters in at most 15×15. Greedy interlocking layout, best of 24 orders. The checker reads every letter run from the grid: each must be exactly a clued answer, every letter must belong to one, all must connect, numbering must be standard. |

### Tests

| File | What it checks |
| --- | --- |
| `tests/formatter.test.ts` | `format()`: every input shape, wording kept, detail lines and tables, topic numbering, IDs, every kind of problem and its level, `visibleIssues`, output round-trips (its own CSV and TSV read back unchanged). `details.ts`: capitalising, boards, classes, subjects, codes, the four boxes (every keystroke round-trips). `review.tsx`: sending batches, no duplicates, approving, sending back, resending. |
| `tests/instructions.test.ts` | The chatbot instructions agree with the code (columns, IDs, boards, limits, difficulty words, page labels); the template, worked example and the guide's example parse with no warnings; the hide-from-people setup in `index.html` and the build plugin. |
| `tests/games.test.ts` | Each game on real questions; determinism; fallbacks; and **every checker is shown deliberately broken puzzles and must catch each one**, which is what makes the stress results mean something. |
| `tests/games-stress.test.ts` | Ordinary and nasty question sets (words inside words, A/B-only words, palindromes, long answers, digits and Hindi, duplicates and blanks) through every game, with a report table. `STRESS=n` sets the number of sets per kind (default 40; `npm run stress` uses 2,500). |

### Other

| File | What it is |
| --- | --- |
| `README.md` | For people on GitHub: what the formatter reads, the IDs, the page, the hidden-instructions setup, the games engine, deploy. |
| `docs/games.md` | For Krish and the team: the rules of each game, the guarantee, the stress results, and decisions still to make. |
| `package.json`, `tsconfig.json`, `.gitignore` | The usual. `tsconfig` is strict with `noUnusedLocals`. |

## Where this is going

Planned order for the games: (1–4 done) rules, makers, checkers, stress proof → (5) game picker for the topics a student
studied → (6) playable games (tap-to-match, typing into a crossword, swiping in a word search) on a demo page here →
(7) test with real chapters made with the formatter → (8) into `kushalsetha/Shikshaq` as a pull request: the questions
and batches tables behind the Approve page (Kanishk sets up the tables and who counts as an HoD), a "Revise" page, behind login. Never push to their repo without
the user's OK.
