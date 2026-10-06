/**
 * Lower-case, drop Latin accents and anything that isn't a letter/digit.
 * Only the U+0300–036F accent block is stripped, so Devanagari and other
 * scripts keep their vowel signs.
 */
export function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

/** A–Z / 0–9 only, upper-cased – the form used inside crossword and word-search grids. */
export function gridWord(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function distance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Typos tolerated for an answer: none for short words and anything with digits. */
function allowedTypos(answer: string): number {
  if (/\d/.test(answer) || answer.length < 5) return 0;
  return answer.length < 10 ? 1 : 2;
}

export type Verdict = 'exact' | 'close' | 'wrong';

/** Case/punctuation/accent-insensitive, with a small typo allowance. */
export function judge(input: string, accepted: string[]): Verdict {
  const given = norm(input);
  if (!given) return 'wrong';
  let close = false;
  for (const a of accepted) {
    const want = norm(a);
    if (given === want) return 'exact';
    const max = allowedTypos(want);
    if (max && distance([...given], [...want]) <= max) close = true;
  }
  return close ? 'close' : 'wrong';
}
