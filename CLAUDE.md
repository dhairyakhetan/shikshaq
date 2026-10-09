# CLAUDE.md

This repo is for **Shikshaq** (shikshaq.in; its main code is `kushalsetha/Shikshaq`, a React + Vite + Supabase app). It has
three separate parts. Each is its own page and works without the other two; they share only the question bank
(`src/db.ts`) and a few things on screen (`src/ui.tsx`). In Shikshaq they will sit in different places (teachers, HoDs,
students); here the header links them.

1. **Question formatter** (`/`): teachers paste questions and answers in any format and get clean rows for the question
   bank, each linked to its chapter and topic by an ID. They download them or send them to the HoD. Chatbots that fetch
   the page get hidden instructions for writing questions in the right format.
2. **HoD desk** (`/hod/`): the HoD approves questions or sends them back with a reason. Approved questions are the
   question bank.
3. **Revise** (`/play/`): students pick their class, subject, chapter and the topics they studied and play puzzles made
   from the approved questions: crossword, word search, matching, fill in the blank. The puzzles are made on the device
   by the games engine (`src/games/`), with no AI, and every one is checked before it is shown.

All questions live in a Supabase database (see "The database" below); there is no sample data, and when the bank is
empty the pages say so. Teachers and HoDs sign in with Google; students don't sign in.

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
- **No browser storage and no sample data.** No `localStorage` or `sessionStorage` of our own; the one exception is the
  Google sign-in, which Supabase keeps in the browser so people stay signed in. Never put made-up questions in the code
  or the database: the pages show only what is in the database.
- **Write invisible characters as escapes** (`'​'`, `' '`), never as the raw character: tools can't match or
  edit them reliably.

## Files

### The three pages

| File | What it does |
| --- | --- |
| `index.html` | The formatter's page shell. `<div id="app">` is where React draws. `<main id="for-ai">` holds the chatbot instructions (baked in at build). A one-line script in `<head>` adds the `js` class before the first paint, and `.js #for-ai { display: none }` hides the instructions from people. No `hidden` attribute on purpose: some fetchers drop hidden elements. |
| `hod/index.html`, `play/index.html` | The shells of the HoD desk and Revise pages. |
| `vite.config.ts` | Vite + React. Three pages (`appType: 'mpa'`, one build input each). The `bake-instructions` plugin replaces `<!--INSTRUCTIONS-->` in `index.html` with `src/instructions.html`. Also the vitest config. |
| `src/instructions.html` | Instructions for AI assistants: how to get the material, work out board/class/subject/chapter/topics, write short-answer questions, and reply in the exact format the formatter reads. Has `<pre id="format">` and `<pre id="example">`, which the tests parse. |
| `src/formatter.tsx` | The formatter page. The text (the single source of truth; not saved), the cursor line, which detail box is being typed in, undo, button feedback. Runs `format()`, decides which problems to show (`visibleIssues`), builds the notes, and handles download, copy, "Send for approval" (needs a Google sign-in, `sendBatch`; the batch carries the person's Google name; the note shows the new batch ID), smooth scrolling and the phone "jump to results" pill. Also `Editor`, the Questions box: a transparent textarea over an exact copy of its text that carries the red/amber underlines; the copy is kept to the same width and scroll, and the note under it explains the line the cursor is on. |
| `src/Guide.tsx` | "How to write your questions", the guide for people at the bottom of the formatter. Board and subject code lists and limits come from the code, so they can't drift. Cards fade in as they scroll into view. |
| `src/hod.tsx` | The HoD desk. Sign in with Google, then the database says whether the email is an HoD's (`amIHod`); only then does it load every question (`loadForHod`). Tabs Waiting / Approved / Sent back, batches grouped by chapter and topic, approve or send back per question or per batch, the reason box, rows sliding away, every change saved at once (`saveStatus`) and undoable for a few seconds, "Check for new questions" when nothing is waiting, download of the approved bank. |
| `src/play.tsx` | Revise. Loads the `question_bank` table (`loadQuestionBank`; says so when it is empty or can't be reached), groups the questions into chapters and topics (`chaptersOf`, ordered by class, subject, chapter), Class and Subject pills, chapter cards (number, name, topics, questions) and topic chips, makes every game the chosen topics allow (only checked puzzles; a game that can't be made is greyed out), "New puzzle" (a new seed). |
| `src/playgames.tsx` | The four games, playable. Matching: tap a question, then its answer (either side first). Fill in the blank: type in the gap, Enter; "Show answer" after 2 wrong tries. Word search: drag across a word, or tap its first and last letter. Crossword: tap a square and type (a hidden input catches keys and phone keyboards), Backspace, arrows, Enter for the next clue, tap again to switch across/down, Check, Reveal word. Each ends with a "Next puzzle" banner. |
| `src/ui.tsx` | What the three pages share on screen: `SectionHeader` (the header with links to the three parts and the number waiting), `RowsTable` (rows grouped by chapter and topic with their IDs; rows slide in; optional buttons under each row), `useUndo` (the "Undo" bar), the icons (`ActionIcon` swaps an icon for a check mark without resizing the button) and `Logo`. |
| `src/styles.css` | All styling, for all three pages, including the page-to-page transition (`@view-transition`: the header stays, the dark pill slides to the new page's link, the page crossfades; each HTML file also preloads a page when its link is hovered), in Shikshaq's look (taken from its `tailwind.config.ts` and `src/index.css`): warm cream page, bone cards with a soft shadow instead of a border, near-black pill buttons, orange and indigo accents, Geist / Geist Mono / Archivo (bundled, imported at the top). Colours are Shikshaq's values, as variables on `:root`. Hover only applies where there is a mouse. The motion section at the end uses Shikshaq's curve and timings; only success moments pop; only transform and opacity animate; "reduce motion" turns sliding, scaling and shaking off (`--rise`, `--press`, `--pop`, `--reveal` become 0/1). |
| `public/favicon.svg` | Tab icon. |
| `vercel.json` | Security headers, long caching for hashed files in `/assets/`, `trailingSlash` (so `/hod` opens `/hod/`), and the old `/review` address sent to `/hod/`. |

### The question bank

| File | What it does |
| --- | --- |
| `src/db.ts` | The only thing the three parts share. The row (`Row`, `COLUMNS`, `DIFFICULTIES`) and its exports (`toCSV` with no byte-order mark, `toJSON`, `toTSV`). The bank's shapes (`Batch`, `BankQuestion`: a row plus its question ID, batch ID, `status` pending/approved/rejected and the HoD's `note`), `setStatus` and `counts` for the page's own copy. Then the database calls through the Supabase client with the publishable key: `loadQuestionBank`, `waitingCount`, `sendBatch`, `loadForHod`, `saveStatus`, `amIHod`, `useLoad` (load when the page opens). Then signing in: `useSession`, `signIn` (Google, back to the same page), `signOut`, `nameOf`. |
| `supabase/schema.sql` | The whole database: tables (with `hods`, the HoD list), IDs, the trigger that keeps `question_bank` in step, the security rules and the functions the pages call. |

### Formatter logic

| File | What it does |
| --- | --- |
| `src/format.ts` | `format(text)` → `{ rows, issues }`. Reads every line: detail lines (`Board:`, `Class 10`, `Chapter 1: ...`, `## Topic 2 - ...`), `Q \| A \| difficulty`, tab or CSV tables with a header row in any order, numbered lists, `Q.`/`Ans.` on one or two lines, `question? answer`, `=`, arrows, ` - `, `: `. Each row gets `chapter_id`, `topic_id`, numbered topics and questions. Issues are `error` (line left out) or `warn` (kept, check it), with line numbers. Also `visibleIssues` (problems near the cursor wait until the person moves on), `lineLevels`, `missing`, `baseName` for file names, and `EXAMPLE` for "Try an example". |
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
| `tests/formatter.test.ts` | `format()`: every input shape, wording kept, detail lines and tables, topic numbering, IDs, every kind of problem and its level, `visibleIssues`, output round-trips (its own CSV and TSV read back unchanged). `details.ts`: capitalising, boards, classes, subjects, codes, the four boxes (every keystroke round-trips). `db.ts`: approving, sending back and moving back to waiting on the page's copy (undo relies on the original being untouched). Duplicates, numbering and IDs are the database's job (`supabase/schema.sql`). |
| `tests/instructions.test.ts` | The chatbot instructions agree with the code (columns, IDs, boards, limits, difficulty words, page labels); the template, worked example and the guide's example parse with no warnings; the hide-from-people setup in `index.html` and the build plugin. |
| `tests/games.test.ts` | Each game on real questions; determinism; fallbacks; and **every checker is shown deliberately broken puzzles and must catch each one**, which is what makes the stress results mean something. |
| `tests/games-stress.test.ts` | Ordinary and nasty question sets (words inside words, A/B-only words, palindromes, long answers, digits and Hindi, duplicates and blanks) through every game, with a report table. `STRESS=n` sets the number of sets per kind (default 40; `npm run stress` uses 2,500). |

### Other

| File | What it is |
| --- | --- |
| `README.md` | For people on GitHub: the three parts, what the formatter reads, the IDs, the hidden-instructions setup, the games engine, deploy. |
| `docs/games.md` | For Krish and the team: the rules of each game, the guarantee, the stress results, and decisions still to make. |
| `package.json`, `tsconfig.json`, `.gitignore` | The usual. `tsconfig` is strict with `noUnusedLocals`. |

## The database

Supabase project "dhairyakhetan's Project" (`dfytzracuyiitlqeqszm`). Everything is in `supabase/schema.sql`, already
applied. Change the database only by editing that file and running the change in the Supabase SQL editor.

**Tables:**
- `batches`: one row per "Send for approval": `batch_id`, `teacher` (Google name), `teacher_email`, `sent_at`.
- `questions`: every question ever sent, with `status` pending (waiting), approved or rejected (sent back) and the HoD's
  `note`, and `reviewed_by` (the HoD's email). A question already waiting or approved in the same chapter can't be added
  again.
- `hods`: the HoD list, by email. Add one with `insert into public.hods (email) values ('name@example.com');`
- `question_bank`: the clean final table, approved questions only, one row per question with a described column each.
  A trigger keeps it in step with `questions`; nothing else writes to it. This is the table to use elsewhere.

**IDs say what they are:**
- Question: `CBSE10SCI01T02Q003` = chapter ID `CBSE10SCI01` + topic `T02` + question `Q003` of that topic (`T00` = no
  topic). The database numbers questions in order within each topic and never reuses a number.
- Batch: `B20261009-03` = the 3rd batch sent on 9 October 2026 (India time).

**Who can do what.** Row-level security is on, and the database decides, not the page:
- Anyone: read `question_bank`, `waiting_count()` (the number in the header) and `hod_questions()` (the HoD desk list).
- Signed in with Google: `submit_batch(questions)` (Send: a batch as themselves, skips duplicates, gives the IDs).
- HoDs (signed in with Google, email in `hods`): `hod_set_status(ids, new_status, reason)` (approve, send back, move
  back to waiting), and `am_i_hod()` answers true.

`hods`, `batches` and `questions` can't be read or written directly. Sign-in is Supabase Auth with Google only; the
Email provider must stay off, or someone could claim an HoD's email without proving it.

## Where this is going

Done: the three pages on a real database. Next: a place for
teachers to see what was sent back and why, and moving the pages into `kushalsetha/Shikshaq`. Never push to their repo
without the user's OK.
