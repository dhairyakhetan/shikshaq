# Shikshaq question bank and revision games

Three separate parts, each its own page. They work without each other and share only the question bank (`src/db.ts`):

| Page | For | What it does |
| --- | --- | --- |
| `/` **Question formatter** | Teachers | Paste questions and answers in any format, get clean rows, send them to the HoD. |
| `/hod/` **HoD desk** | The HoD | Approve questions or send them back with a reason. Approved questions are the question bank. |
| `/play/` **Revise** | Students | Pick the topics you studied and play a crossword, word search, matching or fill-in-the-blank puzzle made from them. |

All questions live in a Supabase database: every question sent, waiting, approved or sent back, and a clean
`question_bank` table of the approved ones. The tables, rules and functions are in `supabase/schema.sql`. Nothing is kept
in the browser, and there is no sample data: when the bank is empty, the pages say so. There is no login yet.

The pages use Shikshaq's look (its colours, fonts, pill buttons, shadows and motion timings), so they can move into the
main site without looking out of place.

## Question formatter (`/`)

Paste questions and answers in any format; get clean rows for the question bank, one row per question:

```
chapter_id, topic_id, board, class, subject, chapter_no, chapter, topic_no, topic, question_no, question, answer, difficulty
```

Download them as **CSV** (imports straight into a database table, no byte-order mark) or **JSON** (an array of the same records,
`null` for anything missing, `class` as a number), or copy them for Google Sheets. The site reads its own CSV and Sheets copy back
unchanged. Everything runs in the browser; nothing is uploaded or saved.

## Chapter and topic IDs

Every question is linked to its chapter and topic by a short ID made from the details, so the same chapter always gets the same ID
and nothing has to be looked up:

| | Example | Made of |
| --- | --- | --- |
| `chapter_id` | `CBSE11CHE01` | board code + class (2 digits) + subject code (3 letters) + chapter number (2 digits) |
| `topic_id` | `CBSE11CHE01T03` | chapter ID + `T` + topic number (2 digits) |

IDs sort by board, class, subject, chapter, topic. Board codes: CBSE, ICSE, ISC, IB, IGCSE, CAIE (Cambridge), NIOS, and two-letter
state codes (MH, TN, UP, ...). 44 subjects have fixed codes (PHY, CHE, MAT, SCI, ...); any other subject gets one made from its name
(never one of the fixed codes) and a warning. A question gets no ID until board, class, subject and chapter number are all known.
The lists live in `src/details.ts`.

## The page

- **Board, Class, Subject, Chapter boxes** are the detail lines at the top of the Questions box: typing in a box writes its line
  (in that order), editing the line changes the box, emptying the box removes the line. A box warns as soon as its value is wrong
  (class not 1 to 12, chapter without a number, unknown board or subject, a likely typo such as "chemsitry"), and when you leave it the
  value is written the standard way (`cbse` → `CBSE`, `xi` → `11`, `maths` → `Mathematics`, `3 - acids` → `3: Acids`).
  When all four are valid the chapter ID is shown.
- **Questions box**: lines with a problem are underlined, red when the line is left out, amber when it is kept but worth checking.
  Putting the cursor on an underlined line says why. People get to write first: nothing is flagged on the line being typed (nor "no
  answer" on the question just above it, whose answer is probably being typed), until the cursor moves to another line or leaves the
  box; a detail box warns once it is left or typing pauses for 1.5 seconds. A paste is finished text and is checked at once. A fix
  always clears straight away, and jumping to a flagged line keeps its problem in view. (A textarea can't style its text, so an exact copy of the text with the underlines
  sits behind it, kept to the same width and scroll position.)
- **Check and download**: the rows grouped by chapter and topic with their IDs, the problems with clickable line numbers, and a note
  for questions missing a detail.
- **Undo instead of "are you sure?"**: Clear and Try an example can be undone for 7 seconds. Download and copy buttons turn green with a
  check mark for a moment (same size, so nothing jumps). On a phone, a pill at the bottom points to the results while they are off screen.
  The header link scrolls to the guide without adding anything to the address.
- **Motion**: the page, table rows (staggered on a paste), messages and guide cards ease in; presses give way at once; underlines fade in after half
  a second. Timings and the easing curve are Shikshaq's; only success moments (a solved puzzle, a new count) pop slightly.
  Only transform and opacity animate, and with "reduce motion" switched on only short fades remain. The header is a solid
  pill floating at the top, as on Shikshaq.
- **How to write your questions**: a guide for people at the bottom of the page (formats, detail lines, good questions, what the
  underlines mean, the IDs, board and subject codes, starting from notes).

## HoD desk (`/hod/`)

Teachers press **Send for approval** (with their name) on the formatter. On the HoD desk the HoD sees each batch,
grouped by chapter and topic, and approves questions or sends them back with a reason the teacher sees, one by one or the
whole batch; every action can be undone. **Approved** is the question bank the games use, and downloads as CSV or JSON.
A question with no chapter ID can't be sent, and one already waiting or approved isn't sent twice. Each question gets an
ID that says what it is, such as `CBSE10SCI01T02Q003` (chapter, topic 2, question 3), and each batch one such as
`B20261009-03` (the 3rd batch sent that day).

## Revise (`/play/`)

Students tap their class and subject, pick a chapter card, and tick the topics they studied. Every game those questions can make is offered (a game that
can't be made, say because the answers are too long for a grid, is greyed out); **New puzzle** makes another.

- **Crossword**: tap a square and type; tap it again to switch between across and down. Check marks wrong letters;
  Reveal word fills one in. Works with a phone's on-screen keyboard.
- **Word search**: drag across a word, or tap its first and last letter. The clues are the questions; the words can be shown.
- **Matching**: tap a question, then its answer (or the other way round).
- **Fill in the blank**: type in the gap and press Enter. Capitals, accents and punctuation don't matter; after two wrong tries
  the answer can be shown.

Only approved questions are used.

## What it reads

| Shape | Example |
| --- | --- |
| Bar or tab separated, optional difficulty | `What is H2O? \| Water \| easy` |
| Markdown table, or a spreadsheet paste / CSV with a header row in any column order | `Chapter \| Topic \| Question \| Answer` |
| Numbered or bulleted, with labels | `1. Q. What is H2O? Ans: Water` |
| Question on one line, answer on the next | `Q2) What is H2O?` then `Ans. Water` |
| Question mark, `=`, arrow, spaced dash or colon | `What is H2O? Water`, `SI unit of force = Newton` |

Detail lines (`Board: CBSE`, `Class 10`, `Subject: Science`, `Chapter 1: Chemical Reactions`, `## Topic 2 - Indicators`,
`Difficulty: hard`) apply to the questions below them. A new chapter clears the topic. `Topic 10.2` is topic 2.

- **Never reworded:** questions and answers keep their wording; only numbering, labels (`Q.`, `Ans:`), bullets, Markdown markers and extra
  spaces go. Board, subject, chapter and topic **names are capitalised** (`acids, bases and salts` → `Acids, Bases and Salts`; joining words
  stay small, and DNA, pH and CO2 are left alone).
- **Left out (red):** no answer, an answer with no question, an empty part, too many parts, a question over 300 characters or an answer
  over 100, the same question twice in a chapter, a class that isn't 1 to 12, a chapter or topic number over 99.
- **Kept, but check (amber):** unknown or misspelt board or subject, a chapter with no number or name, an unknown difficulty, a heading
  that isn't a detail line, a topic with no questions, a detail set again before any question used it, one chapter or topic ID given two
  names, ICSE in class 11 or 12 (that's ISC) and similar board and class mismatches.
- Topics are numbered from their `Topic N:` line, otherwise in order of appearance within the chapter. `question_no` counts within the topic.

## Chatbots see instructions, people see the app

`src/instructions.html` holds exact instructions for AI assistants: get the material (notes, or just "class 10 science chapter 1"),
work out board, class, subject, chapter and numbered topics, write short-answer questions, and reply in the format below, which the site reads with no warnings. The site makes the IDs; the chatbot never writes them.

```
Board: CBSE
Class: 10
Subject: Science
Chapter 1: Chemical Reactions and Equations
Topic 1: Chemical equations
Law that requires a chemical equation to be balanced | Law of conservation of mass | medium
```

At build time `vite.config.ts` bakes that file into `index.html` inside `<main id="for-ai">`. Anything that fetches the page without
running JavaScript (chatbot fetch tools, crawlers, `curl`) reads it as plain HTML. In a browser, a one-line script in `<head>` adds a
`js` class before the first paint and a stylesheet rule hides `#for-ai`, so people only ever see the app. The element has no `hidden`
attribute or inline style, because some fetchers drop elements marked that way. The page itself offers only a **Copy chatbot prompt**
button: it points the chatbot at this page.

`tests/instructions.test.ts` fails if the instructions and the code disagree (columns, IDs, boards, limits, difficulty words, labels on
the page), if the template, the worked example or the guide's example would produce a single warning, or if the hiding setup changes.

## Revision games engine

`src/games/` makes matching, fill-in-the-blank, word search and crossword puzzles from bank questions, on the student's
device, with no AI: the same questions and seed always give the same puzzle. Every game has a maker and a separate
checker, and a puzzle is only returned after its checker passes it; otherwise it is made again with a new seed, then the
next game is tried. Revise uses it; it has no page code, so the same files can go into Shikshaq. The rules for each game, the guarantee and the stress results are in [docs/games.md](docs/games.md).

```ts
import { makePuzzle, seedOf, sameAnswer } from './src/games';
const puzzle = makePuzzle(questions, seedOf(`${studentId}|${date}|${topicIds}`)); // crossword, else word search, matching, fill
```

`tests/games.test.ts` breaks puzzles on purpose and checks that every checker catches every kind of break;
`tests/games-stress.test.ts` runs thousands of question sets through every game (`npm run stress` for 2,500 sets of each kind).

## Deploy to Vercel

Import the repo in Vercel; the Vite preset is detected (build `npm run build`, output `dist`). No environment variables.
`vercel.json` adds security headers and long-lived caching for hashed assets. Fonts are bundled, so the page makes no third-party requests.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # typecheck + production build into dist/
```

Every file and how it works is described in [CLAUDE.md](CLAUDE.md).

The previous Game Maker (crossword, word search and other puzzle builders) is in the git history, up to commit `952a258`.
