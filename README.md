# Question Formatter

Paste questions and answers in any format; get clean rows for the question bank, one row per question:

```
board, class, subject, chapter_no, chapter, topic_no, topic, question_no, question, answer, difficulty
```

Download them as **CSV** (imports straight into a database table, no byte-order mark) or **JSON** (an array of the same records,
`null` for anything missing), or copy them for Google Sheets. Everything runs in the browser; nothing is uploaded.
The draft is kept in the browser (`localStorage`, key `question-formatter:v1`) so a refresh never loses it.

## What it reads

Any mix of these, line by line:

| Shape | Example |
| --- | --- |
| Bar or tab separated, optional difficulty | `What is H2O? \| Water \| easy` |
| Markdown table, or a spreadsheet paste / CSV with a header row in any column order | `Chapter \| Topic \| Question \| Answer` |
| Numbered or bulleted, with labels | `1. Q. What is H2O? Ans: Water` |
| Question on one line, answer on the next | `Q2) What is H2O?` then `Ans. Water` |
| Question mark, `=`, arrow, spaced dash or colon | `What is H2O? Water`, `SI unit of force = Newton` |

Lines such as `Board: CBSE`, `Class 10`, `Subject: Science`, `Chapter 1: Chemical Reactions`, `## Topic 2 - Indicators` or
`Difficulty: hard` set the details for the questions below them. A new chapter clears the topic. The four boxes above the text
(Board, Class, Subject, Chapter) apply to every question unless the text says otherwise.

- Topics are numbered from their `Topic N:` line, otherwise in order of appearance within the chapter. `question_no` counts within the topic.
- The wording is never changed: only numbering, labels (`Q.`, `Ans:`), bullets, Markdown markers and extra spaces are removed.
- Every line it can't use is listed with its line number (click it to jump there): no answer, empty parts, a question over 300 characters,
  an answer over 100 (puzzles need short answers), a duplicate question in the same chapter, an unknown difficulty.
  Questions with no class, subject, chapter or topic are counted and pointed out.

## Chatbots see instructions, people see the app

`src/instructions.html` holds exact instructions for AI assistants: get the material (notes, or just "class 10 science chapter 1"),
work out board, class, subject, chapter and topics, write short-answer questions, and reply in the format below, which the site reads with no warnings.

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

`tests/instructions.test.ts` fails if the instructions and the code disagree (columns, limits, difficulty words, labels on the page),
if the template or the worked example would produce a single warning, or if the hiding setup changes.

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
src/lib/format.ts            text -> rows, with line-numbered issues
src/lib/rows.ts              CSV, JSON, spreadsheet copy, download and clipboard helpers
src/App.tsx                  the page; src/components/RowsTable.tsx the grouped preview
src/instructions.html        instructions for chatbots (baked into index.html, hidden from people)
src/example.ts               "Try an example"
```

The rest of `src/components`, `src/lib`, `src/sample.ts`, `src/types.ts`, `supabase/` and the other tests are left over from the
previous Game Maker (crossword, word search and other puzzle builders). The site no longer uses them.
