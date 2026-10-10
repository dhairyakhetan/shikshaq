# CLAUDE.md

This repo is **Shikshaq's question bank site**, a standalone site of its own, deployed at
https://shikshaq-games.vercel.app. It uses Shikshaq's look (shikshaq.in) but will never move into Shikshaq's main code
(`kushalsetha/Shikshaq`); never push there. It is one page with three parts, each in its own file and independent of
the others; they share only the question bank (`src/db.ts`) and a few things on screen (`src/ui.tsx`). Nothing shows
until the person signs in with Google. Everyone signed in sees the formatter and their profile, with their
notifications (their questions that were sent back, and why); HoDs and admins also see the HoD desk; only admins see
Revise, and the people-and-roles list on their profile.

1. **Question formatter** (`/`): teachers write questions in one format, `Question | Answer` (or `| easy`, `| medium`,
   `| hard`) under the detail and `Topic` lines; the page shows only this format, though other common layouts are still
   read. They get clean rows for the question
   bank, each linked to its chapter and topic by an ID. They download them or send them to the HoD. Chatbots that fetch
   the page get hidden instructions for writing questions in the right format.
2. **HoD desk** (`/hod/`, HoDs and admins only): approve questions or send them back with a reason. Approved
   questions are the question bank.
3. **Revise** (`/play/`, admin only for now): students pick their class, subject, chapter and the topics they studied and play puzzles made
   from the approved questions: crossword, word search, matching, fill in the blank. The puzzles are made on the device
   by the games engine (`src/games/`), with no AI, and every one is checked before it is shown.

All questions live in a Supabase database (see "The database" below); there is no sample data, and when the bank is
empty the pages say so.

## Commands

```bash
npm run dev      # http://localhost:5173
npm test         # all tests, including every database rule on a throwaway Postgres (about 5 s)
npm run build    # typecheck + production build into dist/
npm run stress   # 2,500 question sets of each kind through every game (about 3 min)
```

Stack: React 19, Vite 8, TypeScript 7, vitest 5, Supabase's auth-js and postgrest-js (only these two parts, to keep the page small); PGlite (Postgres in WebAssembly) for the database tests only. Deployed on Vercel from `main` (static site, no environment variables).

## How to work here

- **Push to `main`.** Run `npx tsc --noEmit`, `npm test` and `npm run build` first.
- **Fewer files is better**, as long as no file gets huge. Merge small files into their natural neighbour rather than
  adding new ones.
- **Plain language** in everything people read (site text, guide, docs): short sentences, no jargon. The site's users are
  teachers and students, not developers.
- **Questions and answers are never reworded** by any code. Only numbering, labels, bullets, Markdown and spaces are removed.
- **Keep the chatbot instructions and the code in step.** `tests/instructions.test.ts` fails if they disagree; change
  `src/instructions.html` in the same commit as the rule.
- **No browser storage and no sample data.** No `localStorage` or `sessionStorage`, with two exceptions: the Google
  sign-in (Supabase keeps it so people stay signed in) and the profile's avatar and bio (this device only, on purpose). Never put made-up questions in the code
  or the database: the pages show only what is in the database.
- **Change the database by editing `supabase/schema.sql`**, with a test in `tests/database.test.ts`, then give the user
  the change to run in the Supabase SQL editor: `create or replace` for functions, in parts under 5,000 characters each
  (long pastes get cut off), each wrapped in `begin;` … `commit;` and safe to run twice. Check it the way the repo does:
  apply it to the committed schema on PGlite and compare with the new `schema.sql`. Never run writes on the real database
  yourself.
- **Keep the database's board and subject codes in step.** `private.codes_match` in `supabase/schema.sql` lists them;
  `tests/formatter.test.ts` fails if they disagree with `src/details.ts`.
- **Write invisible characters as escapes** (`'​'`, `' '`), never as the raw character: tools can't match or
  edit them reliably.

## Files

### The three pages

| File | What it does |
| --- | --- |
| `index.html` | The page shell (`/hod/`, `/play/` and `/profile/` are the same page; `vercel.json` rewrites them). The icons, and the preview shown when the link is shared (`og:` tags, `public/og.png`; `og:description` is for people, the plain `description` for chatbots). Connects to Supabase early (`preconnect`). `<div id="app">` is where React draws. `<main id="for-ai">` holds the chatbot instructions (baked in at build). A one-line script in `<head>` adds the `js` class before the first paint, and `.js #for-ai { display: none }` hides the instructions from people. No `hidden` attribute on purpose: some fetchers drop hidden elements. |
| `src/main.tsx` | The app: the sign-in screen (nothing else shows until Google sign-in; an account with no role, i.e. not signed in with Google, is told to use Google), the person's role (`myRole`: admin, hod or member, asked on every load), the header with the parts they may open, and the parts themselves. Each part sets its own tab title. Also the notifications (`mySentBack`): loaded on sign-in (alongside `myRole`, not after it) and whenever the profile opens; opening the bell marks them seen (`markSentBackSeen`); the number of new ones goes on the avatar; arriving at the profile with new ones, or "See why" in the formatter, opens the bell (at the right question); a load that fails says so, with Try again; "Fix in the formatter" on one puts it, with its details (`asText`), in the Questions box (`draft`). A part stays mounted once opened, so its text or puzzle survives a trip to another part. Revise (with the games engine) is a separate download, fetched only when an admin opens it. |
| `vite.config.ts` | Vite + React, one page. The `bake-instructions` plugin replaces `<!--INSTRUCTIONS-->` in `index.html` with `src/instructions.html`. Also the vitest config. |
| `src/instructions.html` | Instructions for AI assistants: how to get the material, work out board/class/subject/chapter/topics (the subject is the textbook's; NCERT changed its books, so say which chapter was assumed), write short-answer questions that suit puzzles (no answer inside its question, no yes/no or either-or), and reply in the exact format the formatter reads, ending with how to paste it, sign in and press Send. Has `<pre id="format">` and `<pre id="example">`, which the tests parse. Test changes the way a teacher would use them: give the site's "Copy chatbot prompt" text to a fresh assistant that knows nothing of this repo, and run its reply through `format()`. |
| `src/formatter.tsx` | The formatter (`Formatter`), with the guide at the bottom (its link sits on the left of the header). The text (the single source of truth; not saved), the cursor line, which detail box is being typed in, undo, button feedback. Runs `format()`, decides which problems to show (`visibleIssues`), builds the notes, and handles download, copy, "Send for approval" (`sendBatch`; the example's questions are never sent, and a warning above Send says so; the batch carries the person's Google name; the note shows the new batch ID, and "See why" for questions that were sent back to this person and haven't changed; then "Start a new batch"), a text from "Fix in the formatter" (`draft`), the browser's "leave the page?" warning while there are questions not yet sent or downloaded (the text isn't saved anywhere), smooth scrolling and the phone "jump to results" pill. Also `Editor`, the Questions box: a transparent textarea over an exact copy of its text that carries the red/amber underlines; the copy is kept to the same width and scroll, and the note under it explains the line the cursor is on. |
| `src/Guide.tsx` | "How to write your questions", the guide for people at the bottom of the formatter. It teaches the one format only. Board and subject code lists and limits come from the code, so they can't drift. Cards fade in as they scroll into view. |
| `src/hod.tsx` | The HoD desk (`HodDesk`). Only HoDs and the admin get it (members don't see the link, and the database refuses them). Loads the waiting and sent-back questions (`loadForHod`); approved ones load a page at a time, newest first, when their tab opens (`loadApproved`, "Show older approved questions"), and their tab shows the bank's count (`approvedCount`). Tabs Waiting / Approved / Sent back, batches (with the teacher's email) grouped by chapter and topic, approve or send back per question or per batch, the reason box, rows sliding away, every change saved at once (`saveStatus`, which also gives back the new counts, so nothing is asked again; a sent-back question the same as one now waiting or approved stays sent back, and the page says so) and undoable for a few seconds, "Check for new questions" when nothing is waiting, download of the whole question bank. |
| `src/play.tsx` | Revise (`Revise`). Loads the `question_bank` table (`loadQuestionBank`; says so when it is empty or can't be reached), groups the questions into chapters and topics (`chaptersOf`, ordered by class, subject, chapter), Class and Subject pills, chapter cards (number, name, topics, questions) and topic chips, makes every game the chosen topics allow (only checked puzzles; a game that can't be made is greyed out), "New puzzle" (a new seed). |
| `src/profile.tsx` | The profile page (open it from the avatar in the header): pick one of 8 avatars, name, email, role, a bio, Sign out. Avatar and bio are kept in `localStorage` (`profile:<email>`), this device only. On the right of the card, `Bell`: the number of new notifications, and when opened (a click outside or Escape closes it) the person's questions that were sent back, newest first, with the reason, who sent it back, "New", and whether it has been sent again, or "Fix in the formatter"; "No notifications" when there are none. For admins, `People` underneath: add an email with a role, change roles, remove (with undo), through `admin_set_role` and `admin_remove`; the owner can't be changed. |
| `src/playgames.tsx` | The four games, playable. Matching: tap a question, then its answer (either side first). Fill in the blank: type in the gap, Enter; "Show answer" after 2 wrong tries. Word search: drag across a word, or tap its first and last letter. Crossword: tap a square and type (a hidden input catches keys and phone keyboards), Backspace, arrows, Enter for the next clue, tap again to switch across/down, Check, Reveal word. Each ends with a "Next puzzle" banner. |
| `src/ui.tsx` | What the parts share on screen: moving between parts without reloading (`go`, `Link`, `useRoute`, with a view transition), `SectionHeader` (left: the part's name and its own links, such as the guide link; right: the parts this person may open, the number waiting, their avatar with the number of new notifications), `Avatar` (8 faces on bold colours), `RowsTable` (rows grouped by chapter and topic with their IDs; rows slide in; optional buttons under each row), `useUndo` (the "Undo" bar), `download` (save text as a file), the icons (`ActionIcon` swaps an icon for a check mark without resizing the button) and `Logo` (the tab icon's mark). |
| `src/styles.css` | All styling, for all three pages, including the transition between parts (the header stays, the dark pill slides to the new link, the part crossfades) and the sign-in screen, in Shikshaq's look (taken from its `tailwind.config.ts` and `src/index.css`): warm cream page, bone cards with a soft shadow instead of a border, near-black pill buttons, orange and indigo accents, Geist / Geist Mono / Archivo (bundled, imported at the top). Colours are Shikshaq's values, as variables on `:root`. Hover only applies where there is a mouse. The motion section at the end uses Shikshaq's curve and timings; only success moments pop; only transform and opacity animate; "reduce motion" turns sliding, scaling and shaking off (`--rise`, `--press`, `--pop`, `--reveal` become 0/1). |
| `public/` | `favicon.svg` (the tab icon: rows of questions with a tick, in Shikshaq orange, also the `Logo`), `favicon.ico` (the same at 32 px, for older browsers), `apple-touch-icon.png` (phones' home screens), `og.png` (the 1200×630 preview when the link is shared). |
| `vercel.json` | Security headers, long caching for hashed files in `/assets/`, `trailingSlash` (so `/hod` opens `/hod/`), and `/hod/`, `/play/`, `/profile/` served by the one page. |

### The question bank

| File | What it does |
| --- | --- |
| `src/db.ts` | The only thing the three parts share. The row (`Row`, `COLUMNS`, `DIFFICULTIES`) and its exports (`toCSV` with no byte-order mark, `toJSON`, `toTSV`). The bank's shapes (`Batch`, `BankQuestion`: a row plus its question ID, batch ID, `status` pending/approved/rejected and the HoD's `note`), `setStatus` and `counts` for the page's own copy. Then the database calls (Supabase sign-in and database clients, publishable key; every call carries the signed-in person's pass): `loadQuestionBank` (the first page of 1,000 gives the count, the rest are asked for at once, in an exact order), `waitingCount`, `sendBatch`, `loadForHod`, `loadApproved`, `approvedCount`, `saveStatus`, `mySentBack`, `markSentBackSeen`, `useLoad` (load when the page opens). Then roles (`myRole`, `ROLE_NAMES`; for admins `loadPeople`, `setPersonRole`, `removePerson`) and signing in: `useSession`, `signIn` (Google, back to the same page), `signOut`, `nameOf`. |
| `supabase/schema.sql` | The whole database: tables (with `roles`: admin and HoD emails), IDs, the trigger that keeps `question_bank` in step, the security rules and the functions the pages call. |

### Formatter logic

| File | What it does |
| --- | --- |
| `src/format.ts` | `format(text)` → `{ rows, issues }`. Reads every line: detail lines (`Board:`, `Class 10`, `Chapter 1: ...`, `## Topic 2 - ...`), `Q \| A \| difficulty`, tab or CSV tables with a header row in any order, numbered lists, `Q.`/`Ans.` on one or two lines, `question? answer`, `=`, arrows, ` - `, `: `. Each row gets `chapter_id`, `topic_id`, numbered topics and questions. Issues are `error` (line left out) or `warn` (kept, check it), with line numbers. Also `visibleIssues` (problems near the cursor wait until the person moves on), `lineLevels`, `missing`, `baseName` for file names, `asText` (rows back in the one format, for "Fix in the formatter"), and `EXAMPLE` for "Try an example" (in the one format only; the tests keep a mixed-format text, `MIXED`, for the parser). |
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
| `tests/formatter.test.ts` | `format()`: every input shape, wording kept, detail lines and tables, topic numbering, IDs, every kind of problem and its level, `visibleIssues`, output round-trips (its own CSV and TSV read back unchanged). `details.ts`: capitalising, boards, classes, subjects, codes, the four boxes (every keystroke round-trips). `db.ts`: approving, sending back and moving back to waiting on the page's copy (undo relies on the original being untouched). Duplicates, numbering and IDs are the database's job (`supabase/schema.sql`); the database's board and subject codes must match `details.ts`. |
| `tests/instructions.test.ts` | The chatbot instructions agree with the code (columns, IDs, boards, limits, difficulty words, the box and button names, signing in and Send); the template, worked example and the guide's example parse with no warnings, and follow the instructions' own rules (no answer inside its question, no yes/no answers); the hide-from-people setup in `index.html` and the build plugin. |
| `tests/database.test.ts` | Every rule in `supabase/schema.sql`, on an empty in-memory Postgres (PGlite) with Supabase's sign-in stubbed: who can read and call what (signed out, not Google, member, HoD, admin, owner), sending (sizes, codes, limits, topic IDs, numbering, duplicates, batch IDs, names), sending back and notifications, resending, approving and the question bank, paging with ties, people and the owner. |
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
  `note`, `reviewed_by` (the HoD's email) and `seen_at` (when the teacher saw it was sent back). A question already
  waiting or approved in the same chapter can't be added again (case, spaces and punctuation at the end don't count).
  One sent back to the same teacher, unchanged (same question and answer), isn't added again either: the site points
  them to the reason. Sent back to someone else, it goes in as new.
- `roles`: everyone who has signed in (saved as `member` the first time) and anyone an admin added, with `role`
  admin, hod or member, their Google `name` and `last_seen_at`. Admins change it from their profile page. One admin is
  the `owner` (set by hand in the SQL editor): nobody can remove or demote them, and they come first in the list.
- `question_bank`: the clean final table, approved questions only, one row per question with a described column each.
  A trigger keeps it in step with `questions`; nothing else writes to it. This is the table to use elsewhere.

**IDs say what they are:**
- Question: `CBSE10SCI01T02Q003` = chapter ID `CBSE10SCI01` + topic `T02` + question `Q003` of that topic (`T00` = no
  topic). The database numbers questions in order within each topic and never reuses a number.
- Batch: `B20261009-03` = the 3rd batch sent on 9 October 2026 (India time).

**Who can do what.** Row-level security is on, and the database decides, not the page.
- Anyone, even without signing in: read `question_bank` (approved questions only). Nothing else.
- Member (anyone signed in with Google): also `submit_batch(questions)` (Send: a batch as themselves, skips duplicates,
  gives the IDs and works out each topic ID itself, and returns only the new IDs, not the rows; the board and subject
  must match the chapter ID's codes, `private.codes_match`), and their notifications: `my_sent_back()` and `mark_sent_back_seen()`.
- HoD: also the HoD desk: `hod_questions()` (waiting and sent back), `hod_approved(before_at, before_id, take)`
  (approved, newest first, a page at a time), `waiting_count()` and `hod_set_status(ids, new_status, reason)` (approve,
  send back, move back to waiting; returns what changed and what was skipped, and how many are now waiting and
  approved; deciding the same thing twice changes
  nothing, so a question's approval time and the teacher's "seen" stay as they were).
- Admin: also `admin_people()`, `admin_set_role(email, role)`, `admin_remove(email)`; the site shows them Revise. An
  admin can't remove themselves or take away their own admin role, and nobody can remove or demote the owner.
- `my_role()` runs every time the site opens: it saves a new person as a member and returns their role (a refresh
  within 10 minutes with the same name writes nothing).
- Every lookup the functions make has an index (numbering, duplicates, sent-back copies, approved pages, a teacher's
  notifications), so none reads the whole table.

`roles`, `batches` and `questions` can't be read or written directly, and `question_bank` can't be written. Sign-in is Supabase Auth with Google only; the
Email provider must stay off, or someone could claim an HoD's email without proving it.

## Where this is going

Done: the three pages on a real database, notifications for questions sent back, and a full test sweep (the database
rules in `npm test`; the site in a browser against a throwaway copy of the database). This stays a standalone site.

On hold, by the user's choice: a fixed list of chapters to pick from, so a chapter number and name always agree, with
IDs in the style `CBSE-10-SCI-3.3` (chapter 3, topic 3) built by the database from the chapter and topic rows. The
subject in an ID must be the book the chapter is in: CBSE has one Science book up to class 10 and one Social Science
book up to class 9 (four books in class 10 until 2027-28), and splits them in class 11; ICSE has separate Physics,
Chemistry, Biology, History & Civics and Geography books from about class 6. Until then the formatter numbers unnumbered
topics within one paste only, so two teachers can give the same topic number to different topics.
