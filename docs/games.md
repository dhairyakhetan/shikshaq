# Revision games: how they are made, and what "correct" means

Short puzzles made from the question bank, on the student's own device, from the topics they studied.
The code is in `src/games/`. It is plain TypeScript with no website code, so the same files can go into the Shikshaq app.

## The guarantee

1. **No AI.** Each game is an ordinary program. The same questions and the same seed (for example student, date and
   topics) always give exactly the same puzzle, so any puzzle a student saw can be made again to look into it.
2. **Every game has a maker and a separate checker.** The maker builds the puzzle. The checker is written separately and
   reads the finished puzzle from scratch against the rules below. **A puzzle is only shown after its checker passes it.**
3. **If a check ever fails**, the puzzle is made again with a new seed (up to 12 times). If the game still can't be made
   from those questions, the next game is tried: crossword, then word search, then matching, then fill in the blank.
   So a student can't be shown a broken puzzle. The worst case is a different game.
4. **The checkers are tested by breaking puzzles on purpose** (a changed letter, a moved word, a second copy of a word,
   two answers side by side, a gap in the wrong place, ...). Each checker must catch every kind of break. Then thousands
   of question sets, from ordinary to deliberately nasty, are run through every game (see *Proof* below).

## Rules all games share

- **Typed answers** are accepted when they match the stored answer, ignoring capital letters, accents, spaces and
  punctuation: "law of conservation of MASS." is right for "Law of conservation of mass". Spelling mistakes are wrong.
- **Grid answers** (crossword, word search) use the answer's letters A to Z: spaces, hyphens, apostrophes and full stops
  are dropped ("Carbon dioxide" becomes CARBONDIOXIDE), accents removed. Answers with digits, symbols or another
  script (H2O, f = R/2, Hindi) can't go in a letter grid; they are still used in matching and fill in the blank.
- A question needs both a question and an answer. Each question has its own ID from the bank.

## Matching

- **Uses:** 3 to 8 questions with different answers.
- **Correct when:** every answer belongs to exactly one question shown, and the text is the bank's text unchanged;
  no two answers are the same (otherwise a question would have two right matches); the answers are not in the same
  order as the questions.
- **Left out:** a second question with the same answer as one already used.

## Fill in the blank

- **Uses:** 1 to 10 questions. Each is shown with one gap:
  - if the question has `___`, the gap goes there;
  - otherwise, if the answer appears in the question exactly once as whole words, that part is cut out;
  - otherwise the gap goes after the question ("SI unit of force? ____").
- **Correct when:** the text around the gap is the bank's question exactly; there is one gap; and the visible text does
  not show the answer.
- **Left out:** a question with two gaps, or one that would still show its own answer.

## Word search

- **Uses:** 3 to 10 answers of 3 to 12 letters, in a square grid of 8 to 15 letters.
- **Directions:** forwards only, so young students can read them: left to right, top to bottom, diagonally down and
  diagonally up (both left to right).
- **Correct when:** each answer is where the puzzle says, and **each answer can be found in exactly one place**, looking
  in all eight directions, forwards and backwards. The filler letters are repainted until no answer appears by accident.
- **Left out:** answers that contain another answer (ION and IONIC: ION would always be found twice). Only one is used.

## Crossword

- **Uses:** 3 to 12 answers of 3 to 15 letters, in a grid of at most 15 by 15.
- **Correct when:** every run of two or more letters in the grid, across or down, is exactly one clued answer (no
  accidental words where answers touch); every letter belongs to an answer; all answers are joined into one grid; clue
  numbers follow the standard reading order; each clue is the bank's question with the letter count, such as "(8, 8)".
- **The limit:** not every answer always fits, because some answers share no letters with the others. Those answers
  are left out of that crossword. A crossword with fewer than 3 answers is not made at all, and the next game is used.
  **The promise is that every crossword shown is correct, not that every question appears in every crossword.**

## Proof

`npm test` runs the checker-breaking tests and a short stress run. `npm run stress` runs 2,500 question sets of each
kind below through all four games. The table is from that run; **"bad puzzles caught" is how many times a maker produced
something its checker refused**, which a student would never see.

Run on 9 kinds of question set × 2,500 sets each × 4 games: **80,805 puzzles made and checked, 0 bad puzzles from any maker.**

Ordinary questions (3 to 16 real school words):

| Game | Made | Right first time | Bad puzzles caught | Time to make (laptop) |
| --- | --- | --- | --- | --- |
| Crossword | 99.8% | 99.8% | 0 | 3 ms |
| Word search | 100% | 100% | 0 | 0.2 ms |
| Matching | 100% | 100% | 0 | under 0.1 ms |
| Fill in the blank | 100% | 100% | 0 | 0.1 ms |

(The few crosswords not made are small sets whose words can't cross; the student gets a word search instead.)

Deliberately nasty sets, where a game is sometimes refused (and the next game used instead):

| Question set | What happens |
| --- | --- |
| Words inside words (ION, IONIC, IONS...) | word search made 97.2%, crossword 98.5%; never two words that contain each other |
| Words of only A and B | word search made 88.9%: the rest would unavoidably show a word twice, so it is refused |
| Palindromes and repeats (RADAR, ZZZZZZ...) | crossword made 39.5%: words with no shared letters can't cross |
| 12 to 15-letter answers | word search made 14.4%: answers over 12 letters aren't used in a word search |
| Only digits, formulas, Hindi | no crossword or word search; matching and fill in the blank still made |
| Repeats, empty questions or answers | ignored; every game made |

What "can't be made" means: the questions really can't make that game, for example answers too long for a word search,
words that contain each other, or words that share no letters for a crossword. The student then gets the next game.

## To decide

1. **Crossword:** is "every crossword shown is correct, but not every question is always in it" acceptable?
2. **Sizes:** matching 3 to 8 pairs, fill in the blank up to 10, word search up to 10 words, crossword up to 12 answers.
3. **Word search directions:** forwards only (easier) or also backwards (harder)?
4. **Order when a game can't be made:** crossword, word search, matching, fill in the blank.
5. **Typed answers:** exact apart from case, accents, spaces and punctuation. Should small spelling mistakes count?
