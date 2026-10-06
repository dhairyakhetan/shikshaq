import type { FormatId } from '../types';
import type { BuiltOk } from './build';
import { esc, slug } from './text';

export interface FormatMeta { id: FormatId; label: string; sub: string; ext: string; mime: string }

export const FORMATS: FormatMeta[] = [
  { id: 'json', label: 'JSON', sub: 'For apps & chatbots', ext: 'json', mime: 'application/json' },
  { id: 'csv', label: 'CSV', sub: 'For Sheets / Excel', ext: 'csv', mime: 'text/csv' },
  { id: 'html', label: 'Printable', sub: 'Worksheet + answer key', ext: 'html', mime: 'text/html' },
  { id: 'txt', label: 'Text', sub: 'Plain, paste anywhere', ext: 'txt', mime: 'text/plain' },
];

export const titleOf = (t: string) => t.trim() || 'My Game';

/** Which layout of how many this file is; only matters when there is more than one. */
export interface LayoutInfo { n: number; of: number }
const multi = (l?: LayoutInfo): l is LayoutInfo => !!l && l.of > 1;
const heading = (T: string, l?: LayoutInfo) => (multi(l) ? `${T} — Layout ${l.n} of ${l.of}` : T);

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');

/** The game as a plain object: this is what the JSON file holds. */
export function gameObject(b: BuiltOk, title: string, layout?: LayoutInfo) {
  const base = gameData(b, titleOf(title), `${slug(titleOf(title))}-${b.game}${multi(layout) ? `-${layout.n}` : ''}`);
  return multi(layout) ? { ...base, layout: layout.n, layouts: layout.of } : base;
}

function gameData(b: BuiltOk, T: string, id: string) {
  switch (b.game) {
    case 'matching': {
      const map = new Map<string, number>(); // a Map, so answers such as "constructor" survive
      b.options.forEach((o, i) => { if (!map.has(o.answer)) map.set(o.answer, i); });
      return {
        id, gameType: 'matching', title: T,
        pairs: b.rows.map((r) => ({ id: `pair-${r.n}`, question: r.q, answer: r.a, correctOption: r.correct })),
        shuffledAnswers: b.options.map((o) => o.answer),
        answerShuffleMap: Object.fromEntries(map),
      };
    }
    case 'fillBlank':
      return {
        id, gameType: 'fillBlank', title: T,
        questions: b.rows.map((r) => ({ id: `q${r.n}`, text: r.text, answer: r.answer, answerIndex: r.answerIndex })),
      };
    case 'crossword': {
      const clue = (x: { number: number; row: number; col: number; length: number; answer: string; clue: string }) =>
        ({ number: x.number, row: x.row, col: x.col, length: x.length, answer: x.answer, clue: x.clue });
      return {
        id, gameType: 'crossword', title: T, rows: b.rows, cols: b.cols, grid: b.grid,
        clues: { across: b.across.map(clue), down: b.down.map(clue) },
      };
    }
    case 'wordSearch':
      return {
        id, gameType: 'wordSearch', title: T, size: b.size, grid: b.grid,
        words: b.words.map((w) => ({ word: w.word, clue: w.clue, row: w.row, col: w.col, direction: w.direction })),
      };
  }
}

function text(b: BuiltOk, title: string, layout?: LayoutInfo): string {
  const out = [heading(titleOf(title), layout).toUpperCase(), ''];
  const key = ['', '--- ANSWER KEY ---'];
  switch (b.game) {
    case 'matching':
      out.push('Match each question with the right letter.', '');
      b.rows.forEach((r) => out.push(`${r.n}. ${r.q}   ____`));
      out.push('');
      b.options.forEach((o) => out.push(`${o.letter}) ${o.answer}`));
      b.rows.forEach((r) => key.push(`${r.n} = ${r.correct} (${r.a})`));
      break;
    case 'fillBlank':
      out.push('Fill in the blank.', '');
      b.rows.forEach((r) => { out.push(`${r.n}. ${r.text}`); key.push(`${r.n}. ${r.answer}`); });
      break;
    case 'crossword':
      out.push('Crossword. # = blocked, . = letter square. Row and column numbers start at 0.', '');
      b.grid.forEach((row) => out.push(row.replace(/[A-Z0-9]/g, '.').split('').join(' ')));
      out.push('', 'ACROSS');
      b.across.forEach((x) => out.push(`${x.number}. ${x.clue} (${x.length})  [row ${x.row}, col ${x.col}]`));
      out.push('', 'DOWN');
      b.down.forEach((x) => out.push(`${x.number}. ${x.clue} (${x.length})  [row ${x.row}, col ${x.col}]`));
      b.grid.forEach((row) => key.push(row.split('').join(' ')));
      break;
    case 'wordSearch':
      out.push('Word search. Words run across, down or diagonally.', '');
      b.grid.forEach((row) => out.push(row.split('').join(' ')));
      out.push('', 'FIND:');
      b.words.forEach((w) => {
        out.push(`- ${w.word}  (${w.clue})`);
        key.push(`${w.word}: row ${w.row + 1}, column ${w.col + 1}, ${w.direction}`);
      });
      break;
  }
  return out.concat(key).join('\n');
}

const PRINT_CSS =
  'body{font-family:Georgia,serif;max-width:760px;margin:32px auto;padding:0 20px;color:#111}h1{margin:0 0 4px}p.sub{margin:0 0 20px;color:#444}.who{margin:0 0 24px}' +
  'table.g{border-collapse:collapse;margin:8px 0 20px}table.g td{width:30px;height:30px;border:1px solid #222;text-align:center;font:600 16px monospace;position:relative;padding:0}' +
  'table.g td.x{border:none}table.g td sup{position:absolute;top:1px;left:2px;font:9px sans-serif}table.g td.k{background:#ddd}' +
  '.cols{display:flex;gap:40px;flex-wrap:wrap}.cols>div{flex:1 1 280px}li{margin:6px 0}.blank{display:inline-block;min-width:110px;border-bottom:2px solid #111}' +
  '.key{page-break-before:always;break-before:page;margin-top:40px}.bar{margin:0 0 20px}.bar button{font:inherit;padding:8px 16px;cursor:pointer}@media print{.bar{display:none}}';

function printable(b: BuiltOk, title: string, layout?: LayoutInfo): string {
  const T = heading(titleOf(title), layout);
  const who = '<p class="who">Name: ______________________ &nbsp; Date: ____________</p>';
  let body = '';
  let key = '';
  switch (b.game) {
    case 'matching':
      body = `<p class="sub">Write the letter of the matching answer next to each question.</p>${who}<div class="cols"><div><ol>${b.rows.map((r) => `<li>${esc(r.q)} &nbsp; ____</li>`).join('')}</ol></div><div><ul style="list-style:none;padding:0">${b.options.map((o) => `<li><b>${esc(o.letter)})</b> ${esc(o.answer)}</li>`).join('')}</ul></div></div>`;
      key = `<ol>${b.rows.map((r) => `<li><b>${esc(r.correct)}</b> — ${esc(r.a)}</li>`).join('')}</ol>`;
      break;
    case 'fillBlank':
      body = `<p class="sub">Fill in each blank.</p>${who}<ol>${b.rows.map((r) => `<li>${esc(r.before)}<span class="blank"></span>${esc(r.after)}</li>`).join('')}</ol>`;
      key = `<ol>${b.rows.map((r) => `<li>${esc(r.answer)}</li>`).join('')}</ol>`;
      break;
    case 'crossword': {
      const table = (answers: boolean) =>
        `<table class="g">${b.grid.map((row, r) => `<tr>${row.split('').map((ch, c) => {
          if (ch === '#') return '<td class="x"></td>';
          const n = b.numAt[`${r},${c}`];
          return `<td>${n ? `<sup>${n}</sup>` : ''}${answers ? ch : ''}</td>`;
        }).join('')}</tr>`).join('')}</table>`;
      const clues = (xs: typeof b.across) =>
        `<ul style="list-style:none;padding:0">${xs.map((x) => `<li><b>${x.number}.</b> ${esc(x.clue)} (${x.length})</li>`).join('')}</ul>`;
      body = `<p class="sub">Use the clues to fill in the grid.</p>${who}${table(false)}<div class="cols"><div><h3>Across</h3>${clues(b.across)}</div><div><h3>Down</h3>${clues(b.down)}</div></div>`;
      key = table(true);
      break;
    }
    case 'wordSearch': {
      const table = (answers: boolean) =>
        `<table class="g">${b.grid.map((row, r) => `<tr>${row.split('').map((ch, c) => `<td${answers && b.mark[r * b.size + c] ? ' class="k"' : ''}>${ch}</td>`).join('')}</tr>`).join('')}</table>`;
      body = `<p class="sub">Find each word. Words run across, down or diagonally.</p>${who}${table(false)}<div class="cols"><div><h3>Words</h3><ul>${b.words.map((w) => `<li><b>${esc(w.word)}</b> — ${esc(w.clue)}</li>`).join('')}</ul></div></div>`;
      key = table(true);
      break;
    }
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(T)}</title><style>${PRINT_CSS}</style></head><body><p class="bar"><button type="button" onclick="window.print()">Print or save as PDF</button></p><h1>${esc(T)}</h1>${body}<div class="key"><h2>Answer key</h2>${key}</div></body></html>`;
}

export function makeOutput(b: BuiltOk, fmt: FormatId, title: string, layout?: LayoutInfo): string {
  switch (fmt) {
    case 'json': return JSON.stringify(gameObject(b, title, layout), null, 2);
    case 'txt': return text(b, title, layout);
    case 'html': return printable(b, title, layout);
    case 'csv':
      switch (b.game) {
        case 'matching':
          return csv([['number', 'question', 'answer', 'correct_option', 'option_letter', 'option_text']].concat(
            b.rows.map((r, i) => [r.n, r.q, r.a, r.correct, b.options[i].letter, b.options[i].answer].map(String))));
        case 'fillBlank':
          return csv([['number', 'sentence', 'answer', 'answer_word_index']].concat(
            b.rows.map((r) => [r.n, r.text, r.answer, r.answerIndex].map(String))));
        case 'crossword':
          return csv([['number', 'direction', 'row', 'col', 'length', 'answer', 'clue']].concat(
            [...b.across, ...b.down].map((x) => [x.number, x.direction, x.row, x.col, x.length, x.answer, x.clue].map(String))));
        case 'wordSearch':
          return csv([['word', 'clue', 'row', 'col', 'direction']].concat(
            b.words.map((w) => [w.word, w.clue, w.row, w.col, w.direction].map(String))));
      }
  }
}

export function fileName(title: string, game: string, ext: string, layout?: LayoutInfo): string {
  return `${slug(title)}-${game}${multi(layout) ? `-layout-${layout.n}` : ''}.${ext}`;
}

export function zipName(title: string, game: string): string {
  return `${slug(title)}-${game}-layouts.zip`;
}
