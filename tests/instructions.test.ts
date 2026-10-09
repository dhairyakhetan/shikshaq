import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import { COLUMNS, DIFFICULTIES, format, MAX_ANSWER, MAX_QUESTION, missing, type Details } from '../src/lib/format';
import config from '../vite.config';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('src/instructions.html');
const index = read('index.html');
const app = read('src/App.tsx');
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const block = (id: string) => unescape(html.match(new RegExp(`<pre id="${id}"><code>([\\s\\S]*?)</code></pre>`))![1]);
const NONE: Details = { board: '', class: '', subject: '', chapter: '' };

describe('the chatbot instructions agree with the code', () => {
  it('list the columns the site writes, in order', () => {
    expect(html).toContain(`<code>${COLUMNS.join(', ')}</code>`);
  });

  it('state the length limits the site enforces', () => {
    expect(text).toContain(`at most ${MAX_ANSWER} characters and ideally 1 to 3 words`);
    expect(text).toContain(`is at most ${MAX_QUESTION} characters`);
    expect(text).toContain(`Every answer is short (at most ${MAX_ANSWER} characters) and every question at most ${MAX_QUESTION} characters`);
  });

  it('name exactly the difficulty values the site accepts', () => {
    for (const d of DIFFICULTIES) expect(html).toContain(`<code>${d}</code>`);
    expect(text).toContain(DIFFICULTIES.join(', ').replace(/, (\w+)$/, ' or $1'));
  });

  it('give a format template that the site reads with every detail', () => {
    const { rows, issues } = format(block('format'), NONE);
    expect(issues).toEqual([]);
    expect(rows.map((r) => [r.board, r.class, r.subject, r.chapter_no, r.topic_no, r.question_no, r.difficulty])).toEqual([
      ['CBSE', '10', 'Science', 1, 1, 1, 'easy'],
      ['CBSE', '10', 'Science', 1, 1, 2, null],
      ['CBSE', '10', 'Science', 1, 2, 1, 'medium'],
    ]);
  });

  it('give a worked example that the site reads cleanly, with nothing missing', () => {
    const { rows, issues } = format(block('example'), NONE);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(12);
    expect(missing(rows)).toEqual({ class: 0, subject: 0, chapter: 0, topic: 0 });
    expect(new Set(rows.map((r) => `${r.topic_no}: ${r.topic}`))).toEqual(new Set(['1: Chemical equations', '2: Types of chemical reactions', '3: Effects of oxidation in everyday life']));
    expect(rows.every((r) => r.difficulty && r.answer.length <= 30)).toBe(true);
    expect(text).toContain(`Chapter 1, ${rows[0].chapter}`);
  });

  it('name the box and buttons the user really sees', () => {
    for (const label of ['Questions', 'Download CSV', 'Download JSON']) {
      expect(app).toContain(`>${label}<`);
      expect(text).toContain(label);
    }
  });
});

describe('people see the app, chatbots see the instructions', () => {
  it('index.html keeps the instructions in plain HTML and hides them only when JavaScript runs', () => {
    expect(index).toMatch(/<main id="for-ai">\s*<!--INSTRUCTIONS-->\s*<\/main>/);
    expect(index).toContain("<script>document.documentElement.classList.add('js')</script>");
    expect(index).toContain('<style>.js #for-ai { display: none }</style>');
    // no hidden attribute or inline style: some fetchers drop elements marked that way
    expect(index).not.toMatch(/id="for-ai"[^>]*(hidden|style)/);
    expect(index).toMatch(/<div id="app"><\/div>/);
  });

  it('the build bakes the instructions into the page', () => {
    const plugin = (config.plugins ?? []).flat().find((p) => (p as Plugin)?.name === 'bake-instructions') as Plugin;
    const hook = plugin.transformIndexHtml as (html: string) => string;
    const out = hook(index);
    expect(out).not.toContain('<!--INSTRUCTIONS-->');
    expect(out).toContain('<h1>Instructions for AI assistants</h1>');
    expect(out.indexOf('id="for-ai"')).toBeLessThan(out.indexOf('Instructions for AI assistants'));
  });
});
