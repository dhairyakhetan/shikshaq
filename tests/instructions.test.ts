import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import { BOARDS } from '../src/lib/details';
import { COLUMNS, DIFFICULTIES, format, MAX_ANSWER, MAX_QUESTION, missing } from '../src/lib/format';
import config from '../vite.config';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('src/instructions.html');
const index = read('index.html');
const app = read('src/App.tsx');
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const block = (id: string) => unescape(html.match(new RegExp(`<pre id="${id}"><code>([\\s\\S]*?)</code></pre>`))![1]);

describe('the chatbot instructions agree with the code', () => {
  it('list the columns the site writes, in order', () => {
    expect(html).toContain(`<code>${COLUMNS.join(', ')}</code>`);
  });

  it('explain the IDs the site makes, with real examples', () => {
    const rows = format(block('example')).rows;
    expect(text).toContain(`for example ${rows[0].chapter_id} for CBSE, class 10, Science, chapter 1, and ${rows[0].chapter_id}T02 for its topic 2`);
  });

  it('name every board the site knows', () => {
    for (const b of BOARDS) expect(text, b.name).toContain(b.name);
    expect(text).toContain('Maharashtra State Board');
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
    const { rows, issues } = format(block('format'));
    expect(issues).toEqual([]);
    expect(rows.map((r) => [r.topic_id, r.board, r.class, r.subject, r.chapter_no, r.topic_no, r.question_no, r.difficulty])).toEqual([
      ['CBSE10SCI01T01', 'CBSE', 10, 'Science', 1, 1, 1, 'easy'],
      ['CBSE10SCI01T01', 'CBSE', 10, 'Science', 1, 1, 2, null],
      ['CBSE10SCI01T02', 'CBSE', 10, 'Science', 1, 2, 1, 'medium'],
    ]);
  });

  it('give a worked example that the site reads cleanly, with nothing missing', () => {
    const { rows, issues } = format(block('example'));
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(12);
    expect(missing(rows)).toEqual({ board: 0, class: 0, subject: 0, chapter: 0, topic: 0, id: 0 });
    expect(new Set(rows.map((r) => `${r.topic_id} ${r.topic}`))).toEqual(new Set(['CBSE10SCI01T01 Chemical Equations', 'CBSE10SCI01T02 Types of Chemical Reactions', 'CBSE10SCI01T03 Effects of Oxidation in Everyday Life']));
    // the example is written exactly as the site would store it
    expect(rows.every((r) => block('example').includes(`Topic ${r.topic_no}: ${r.topic}`) && block('example').includes(`Chapter 1: ${r.chapter}`))).toBe(true);
    expect(rows.every((r) => r.difficulty && r.answer.length <= 30)).toBe(true);
    expect(text).toContain(`Chapter 1, ${rows[0].chapter}`);
  });

  it('name the box and buttons the user really sees', () => {
    for (const label of ['Questions', 'Download CSV', 'Download JSON']) {
      expect(app).toMatch(new RegExp(`>\\s*${label}\\s*<`));
      expect(text).toContain(label);
    }
  });
});

describe('the guide for people', () => {
  it('has an example that the site reads with no warnings and nothing missing', () => {
    const guide = read('src/components/Guide.tsx');
    const sample = guide.match(/<pre className="sample">\{`([\s\S]*?)`\}<\/pre>/)![1];
    const { rows, issues } = format(sample);
    expect(issues).toEqual([]);
    expect(rows.length).toBeGreaterThan(2);
    expect(missing(rows)).toEqual({ board: 0, class: 0, subject: 0, chapter: 0, topic: 0, id: 0 });
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
