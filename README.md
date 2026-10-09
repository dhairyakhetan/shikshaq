# Question Formatter

Paste questions and answers in any format; get clean rows for the question bank, one row per question:

```
chapter_id, topic_id, board, class, subject, chapter_no, chapter, topic_no, topic, question_no, question, answer, difficulty
```

Download them as **CSV** (imports straight into a database table, no byte-order mark) or **JSON** (an array of the same records,
`null` for anything missing, `class` as a number), or copy them for Google Sheets. The site reads its own CSV and Sheets copy back
unchanged. Everything runs in the browser; nothing is uploaded. The draft is kept in the browser (`localStorage`, key `question-formatter:v1`).

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
The lists live in `src/lib/details.ts`.

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
  a second. Nothing overshoots, only transform and opacity animate, and with "reduce motion"
  switched on only short fades remain. The header is a translucent bar (solid with "reduce transparency").
- **How to write your questions**: a guide for people at the bottom of the page (formats, detail lines, good questions, what the
  underlines mean, the IDs, board and subject codes, starting from notes).

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

```
src/lib/format.ts            text -> rows, with line-numbered errors and warnings
src/lib/details.ts           boards, classes, subjects, chapters, topics: reading, checking, codes, IDs, the four boxes
src/lib/text.ts              tidying, capitalising, edit distance
src/lib/rows.ts              CSV, JSON, spreadsheet copy, download and clipboard helpers
src/App.tsx                  the page
src/components/              Editor (underlined Questions box), RowsTable (grouped preview), Guide (for people)
src/instructions.html        instructions for chatbots (baked into index.html, hidden from people)
src/example.ts               "Try an example"
```

The previous Game Maker (crossword, word search and other puzzle builders) is in the git history, up to commit `952a258`.
