/** Collapses spaces and removes Markdown bold and wrappers or quotes around the whole text. Never touches the words. */
export function tidy(s: string): string {
  let t = s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  for (;;) {
    const m = t.match(/^(__|`|"|“)(.+)(__|`|"|”)$/);
    if (!m || (m[1] === '“' ? '”' : m[1]) !== m[3]) return t;
    t = m[2].trim();
  }
}

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'per', 'than', 'the', 'to', 'via', 'vs', 'with']);
const ROMAN = /^(?:ii|iii|iv|vi|vii|viii|ix|xi|xii)$/;

/**
 * Capitalises the start of each word: "chemical reactions and equations" → "Chemical Reactions and Equations".
 * Short joining words stay lower case unless they start the name or follow ":", "–" or "(".
 * Words that already contain a capital or a digit (DNA, pH, CO2) are left as they are; Roman numerals become upper case.
 */
export function titleCase(s: string): string {
  let start = true;
  return s.replace(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’]*|[:–—(]|\s-\s/gu, (tok) => {
    if (/^(?:[:–—(]|\s-\s)$/u.test(tok)) { start = true; return tok; }
    const first = start;
    start = false;
    if (/\d/.test(tok) || tok !== tok.toLowerCase()) return tok;
    if (ROMAN.test(tok)) return tok.toUpperCase();
    if (!first && SMALL.has(tok)) return tok;
    return tok[0].toUpperCase() + tok.slice(1);
  });
}

/** Edit distance (insertions, deletions, substitutions), for "did you mean" hints. */
export function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
