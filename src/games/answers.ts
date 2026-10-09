/**
 * The rules every game shares: what a question is, how answers are compared, and which answers can go in a grid.
 * Makers and checkers both use these, so they can never disagree about them.
 */

/** One question from the bank. `id` must be unique (the question's ID in the database). */
export interface Item { id: string; question: string; answer: string }

/** An answer as a student would type it, for comparing: case, accents, spaces and punctuation don't matter. */
export const loose = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Whether a typed answer counts as correct. "law of conservation of MASS." matches "Law of conservation of mass". */
export const sameAnswer = (typed: string, answer: string) => loose(typed) !== '' && loose(typed) === loose(answer);

/**
 * The form an answer takes in a crossword or word search: letters A to Z only, upper case.
 * Spaces, hyphens, apostrophes and full stops are dropped ("Carbon dioxide" → CARBONDIOXIDE, "Newton's" → NEWTONS);
 * accents are removed. Null when the answer has digits, symbols or another script, which can't go in a letter grid.
 */
export function gridWord(answer: string): string | null {
  const t = answer.normalize('NFKD').replace(/\p{M}/gu, '').trim();
  return /^[A-Za-z][A-Za-z\s\-'’.]*$/.test(t) ? t.replace(/[^A-Za-z]/g, '').toUpperCase() : null;
}

/** Crossword enumeration: the length of each word of the answer, "(8, 8)" for "Balanced equation". */
export const enumeration = (answer: string) => `(${answer.normalize('NFKD').replace(/\p{M}/gu, '').split(/[\s\-]+/).map((w) => w.replace(/[^A-Za-z]/g, '').length).filter(Boolean).join(', ')})`;

/** Usable questions: both parts filled in, each ID once. */
export const usable = (items: readonly Item[]) => {
  const ids = new Set<string>();
  return items.filter((it) => it.id && it.question.trim() && it.answer.trim() && !ids.has(it.id) && ids.add(it.id));
};
