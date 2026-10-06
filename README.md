# Game Maker

Turn a list of questions and answers into a **crossword**, a **matching** game, a **fill-in-the-blank** sheet or a **word search**,
and download it as JSON, CSV, a printable worksheet (with answer key) or plain text.

It is a workflow, not a gameplay engine: the user's data goes in, a game *file* comes out. Everything runs in the browser;
nothing is uploaded and there is no backend.

1. **Add your questions.** One per line, `Question | Answer`. Pasting two columns from Google Sheets, or a Markdown table from a chatbot, works too.
2. **Pick a game.** Each card shows how many of your pairs fit it.
3. **Check it, then download.** The preview is exactly what goes in the file. *Show answers* and *New layout* are there to help you decide.

The user's work is saved in their browser (`localStorage`, key `game-maker:v1`) so a refresh never loses it.

## For chatbots

Most people will start from notes, not from `Question | Answer` lines. So the page itself is written for AI assistants:
`src/instructions.html` holds exact, step-by-step instructions (get the user's data, extract pairs, the line format, per-game limits,
a checklist, how to reply, a worked example, what never to do).

That file is **baked into `index.html` at build time** (`vite.config.ts`), so anything that fetches the page without running JavaScript
(chatbot fetch tools, crawlers, `curl`) receives the instructions as plain HTML. The same file is rendered at the bottom of the page for
people, with a **For chatbots** link in the header. The intended use: give a chatbot the site's address and your notes, say
"follow the instructions on this page", paste the lines it returns into Step 1.

`tests/instructions.test.ts` fails if the instructions and the code disagree (limits, minimums, interface labels, file keys, the worked example).
If you change a rule, update `src/instructions.html` in the same change.

## Rules the games follow

| Game | Uses | Needs |
| --- | --- | --- |
| Crossword | answers of 2–20 letters or digits (spaces, punctuation and accents ignored), all different | 2 pairs, some sharing letters |
| Matching | any pair | 2 pairs |
| Fill-in-the-Blank | any pair; `___` in the question marks the gap, otherwise the answer is blanked inside the question, otherwise a gap is added at the end | 1 pair |
| Word Search | answers of 2–15 letters or digits, all different | 1 pair |

A pair that doesn't fit a game is left out of that game only. A line that can't be read is reported with its line number, never dropped silently.
Crossword and word search cap at 40 and 30 words (a random subset; *New layout* picks another). Limits: question 300 characters, answer 100.

## Files

- **JSON**: one game (`id`, `gameType`, `title`, plus the game's data). *Download all games* saves all four in one JSON file.
- **CSV**: the same game as a table (UTF-8 with BOM, so Excel shows accents and Hindi correctly).
- **Printable**: worksheet with name/date line and the answer key on its own page; *Print worksheet* opens it with a print button.
- **Text**: the same worksheet as plain text.

## Deploy to Vercel

1. Push the repo to GitHub and **Import** it in Vercel. The Vite preset is detected: build `npm run build`, output `dist`. No environment variables.
2. `vercel.json` only adds security headers (`nosniff`, `no-referrer`, `SAMEORIGIN`) and long-lived caching for hashed assets.

Fonts (Atkinson Hyperlegible, Bricolage Grotesque) are bundled, so the page makes no third-party requests.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # parser, generators, files, escaping, instructions-vs-code checks
npm run build      # typecheck + production build into dist/
```

```
src/instructions.html      instructions for chatbots: single source (baked into index.html, rendered on the page)
src/lib/parse.ts           text -> pairs, with line-numbered warnings
src/lib/games.ts           the four games: names, colours, what fits, minimums
src/lib/build.ts           matching, fill-in-the-blank, crossword, word search builders (seeded, repeatable)
src/lib/crossword.ts       interlocking-grid generator (best of many layouts)
src/lib/wordsearch.ts      word-search generator
src/lib/output.ts          JSON / CSV / printable HTML / text writers
src/components/            header, the three steps, previews, tips, instructions
```
