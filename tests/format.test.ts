import { describe, expect, it } from 'vitest';
import { EXAMPLE } from '../src/example';
import { format, MAX_ANSWER, MAX_QUESTION, missing, normClass, parseChapter, type Details } from '../src/lib/format';
import { baseName, toCSV, toJSON, toRecord, toTSV } from '../src/lib/rows';

const NONE: Details = { board: '', class: '', subject: '', chapter: '' };
const qa = (raw: string, d: Details = NONE) => format(raw, d).rows.map((r) => [r.question, r.answer]);

describe('reading questions and answers', () => {
  it('reads every common shape the same way', () => {
    const shapes = [
      'What is the capital of France? | Paris',
      'What is the capital of France?\tParis',
      '| What is the capital of France? | Paris |',
      '1. What is the capital of France? Paris',
      'Q1. What is the capital of France? Ans: Paris',
      'Q: What is the capital of France? A: Paris',
      '- What is the capital of France? - Paris',
      '**What is the capital of France?** Paris',
      'What is the capital of France? → Paris',
      'Q. What is the capital of France?\nAns. Paris',
      '2) What is the capital of France?\nParis',
      'Question 3: What is the capital of France?\nAnswer: Paris',
    ];
    for (const s of shapes) expect(qa(s), s).toEqual([['What is the capital of France?', 'Paris']]);
  });

  it('splits statement lines on =, a spaced dash or a colon', () => {
    expect(qa('SI unit of force = Newton')).toEqual([['SI unit of force', 'Newton']]);
    expect(qa('Powerhouse of the cell - Mitochondria')).toEqual([['Powerhouse of the cell', 'Mitochondria']]);
    expect(qa('Powerhouse of the cell: Mitochondria')).toEqual([['Powerhouse of the cell', 'Mitochondria']]);
    expect(qa('Q1. Name the gas plants take in\nAns: Carbon dioxide')).toEqual([['Name the gas plants take in', 'Carbon dioxide']]);
  });

  it('never changes the wording, the fill-in gap or numbers inside the text', () => {
    expect(qa('The ___ is the powerhouse of the cell | mitochondria')).toEqual([['The ___ is the powerhouse of the cell', 'mitochondria']]);
    expect(qa('3.14 is the value of which constant? | Pi')).toEqual([['3.14 is the value of which constant?', 'Pi']]);
    expect(qa('Quartz is made of which element besides oxygen? | Silicon')).toEqual([['Quartz is made of which element besides oxygen?', 'Silicon']]);
    expect(qa('What is v = u + at called? Equation of motion')).toEqual([['What is v = u + at called?', 'Equation of motion']]);
    expect(qa('Relation between f and R for a spherical mirror | f = R/2')).toEqual([['Relation between f and R for a spherical mirror', 'f = R/2']]);
    expect(qa('पानी का रासायनिक सूत्र क्या है? | H₂O')).toEqual([['पानी का रासायनिक सूत्र क्या है?', 'H₂O']]);
  });

  it('skips code fences, Markdown dividers and table headers', () => {
    const raw = '```\n| Question | Answer |\n|---|---|\n| Capital of France | Paris |\n```';
    expect(qa(raw)).toEqual([['Capital of France', 'Paris']]);
    expect(format(raw, NONE).issues).toEqual([]);
  });

  it('reports every line it cannot use, with its line number', () => {
    const { rows, issues } = format([
      'Just a note without an answer',
      'What is the capital of France?',
      'Ans: Paris',
      'Ans: Rome',
      'What is the capital of Italy?',
      'Chapter 2: Maps',
      `${'q'.repeat(MAX_QUESTION + 1)} | a`,
      `q | ${'a'.repeat(MAX_ANSWER + 1)}`,
      ' | answer',
      '# Some heading',
      'a | b | c | d',
      'What is the capital of France? | Paris',
      'What is the capital of France? | Paris',
    ].join('\n'), NONE);
    expect(rows.map((r) => r.line)).toEqual([2, 12]);
    expect(issues.map((x) => x.line)).toEqual([1, 4, 5, 7, 8, 9, 10, 11, 13]);
    expect(issues.find((x) => x.line === 5)!.text).toBe('This question has no answer.');
    expect(issues.find((x) => x.line === 13)!.text).toBe('Same question as line 12, skipped.');
  });
});

describe('details: board, class, subject, chapter, topic, difficulty', () => {
  it('takes them from lines in the text, in any common style', () => {
    const { rows, issues } = format(EXAMPLE, NONE);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => `${r.board}/${r.class}/${r.subject}/${r.chapter_no}/${r.chapter}`))).toEqual(new Set(['CBSE/10/Science/1/Chemical Reactions and Equations']));
    expect(rows.map((r) => [r.topic_no, r.question_no])).toEqual([[1, 1], [1, 2], [2, 1], [2, 2], [2, 3], [3, 1], [3, 2]]);
    expect(rows.map((r) => r.topic)).toEqual(['Chemical equations', 'Chemical equations', 'Types of chemical reactions', 'Types of chemical reactions', 'Types of chemical reactions', 'Effects of oxidation in everyday life', 'Effects of oxidation in everyday life']);
    expect(rows.map((r) => r.answer)).toEqual(['Balanced equation', 'Law of conservation of mass', 'Combination reaction', 'Decomposition reaction', 'Oxidation', 'Rusting', 'Nitrogen']);
    expect(rows.map((r) => r.difficulty)).toEqual([null, null, 'easy', null, null, null, 'easy']);
  });

  it('uses the details boxes unless the text says otherwise', () => {
    const d = { board: 'ICSE', class: 'Class 9th', subject: 'Physics', chapter: 'Chapter 4: Light' };
    const [a, b] = format('Q1 | A1\nChapter 5 - Sound\nQ2 | A2', d).rows;
    expect([a.board, a.class, a.subject, a.chapter_no, a.chapter]).toEqual(['ICSE', '9', 'Physics', 4, 'Light']);
    expect([b.chapter_no, b.chapter]).toEqual([5, 'Sound']);
  });

  it('numbers topics by order of appearance unless numbered, and a new chapter clears the topic', () => {
    const rows = format('Topic: A\nq1 | a\nTopic: B\nq2 | a\nTopic 7: C\nq3 | a\nTopic: A\nq4 | a\nChapter 2: X\nq5 | a', NONE).rows;
    expect(rows.map((r) => [r.topic, r.topic_no, r.question_no])).toEqual([['A', 1, 1], ['B', 2, 1], ['C', 7, 1], ['A', 1, 2], ['', null, 1]]);
  });

  it('accepts difficulty as a third part or a line, and reports unknown values', () => {
    const { rows, issues } = format('q1 | a | Hard\nDifficulty: medium\nq2 | a\nq3 | a | e\nq4 | a | tricky', NONE);
    expect(rows.map((r) => r.difficulty)).toEqual(['hard', 'medium', 'easy', 'medium']);
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(5);
  });

  it('does not mistake sentences for detail lines', () => {
    expect(qa('Class of compounds that turn litmus red | Acids')).toEqual([['Class of compounds that turn litmus red', 'Acids']]);
    expect(qa('Section of a plant cell that holds sap? Vacuole')).toEqual([['Section of a plant cell that holds sap?', 'Vacuole']]);
    expect(qa('Chlorophyll is found in which organelle? Chloroplast')).toEqual([['Chlorophyll is found in which organelle?', 'Chloroplast']]);
  });

  it('reads spreadsheet tables with a header row, in any column order', () => {
    const tsv = 'Chapter\tTopic\tQuestion\tAnswer\tLevel\n3: Acids\tIndicators\tColour of litmus in acid\tRed\teasy\n3: Acids\tIndicators\tColour of litmus in base\tBlue\t';
    const rows = format(tsv, NONE).rows;
    expect(rows.map((r) => [r.chapter_no, r.chapter, r.topic, r.topic_no, r.question_no, r.question, r.answer, r.difficulty])).toEqual([
      [3, 'Acids', 'Indicators', 1, 1, 'Colour of litmus in acid', 'Red', 'easy'],
      [3, 'Acids', 'Indicators', 1, 2, 'Colour of litmus in base', 'Blue', null],
    ]);
    const csv = 'question,answer,topic\n"Capital of France, the country",Paris,Europe\n"He said ""hi""",Hi,Words';
    expect(format(csv, NONE).rows.map((r) => [r.question, r.answer, r.topic])).toEqual([['Capital of France, the country', 'Paris', 'Europe'], ['He said "hi"', 'Hi', 'Words']]);
    expect(qa('1\tCapital of France\tParis')).toEqual([['Capital of France', 'Paris']]);
  });

  it('normalises class and chapter values', () => {
    expect(['10', '10th', 'Class 10', 'X', 'Grade: 7'].map(normClass)).toEqual(['10', '10', '10', 'X', '7']);
    expect(['Chapter 10: Light', '10. Light', 'Light', '10', 'Ch. 2 - Sound'].map(parseChapter)).toEqual([
      { no: 10, name: 'Light' }, { no: 10, name: 'Light' }, { no: null, name: 'Light' }, { no: 10, name: '' }, { no: 2, name: 'Sound' },
    ]);
  });

  it('counts questions missing a detail', () => {
    const { rows } = format('Class: 10\nq1 | a\nTopic: T\nq2 | a', NONE);
    expect(missing(rows)).toEqual({ class: 0, subject: 2, chapter: 2, topic: 1 });
  });
});

describe('output for the database', () => {
  const { rows } = format(EXAMPLE, NONE);

  it('has one flat record per question, with null for missing values', () => {
    expect(toRecord(rows[0])).toEqual({
      board: 'CBSE', class: '10', subject: 'Science', chapter_no: 1, chapter: 'Chemical Reactions and Equations',
      topic_no: 1, topic: 'Chemical equations', question_no: 1,
      question: 'Equation with the same number of atoms of each element on both sides?', answer: 'Balanced equation', difficulty: null,
    });
    expect(JSON.parse(toJSON(rows))).toHaveLength(7);
  });

  it('writes CSV that a CSV reader gets back exactly', () => {
    const tricky = format('He said "hi", then left | Hi, there', NONE).rows;
    const csv = toCSV(tricky);
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
    expect(csv.split('\n')[0]).toBe('board,class,subject,chapter_no,chapter,topic_no,topic,question_no,question,answer,difficulty');
    expect(csv.split('\n')[1]).toBe(',,,,,,,1,"He said ""hi"", then left","Hi, there",');
    const full = format(`board,class,subject,chapter_no,chapter,topic_no,topic,#,question,answer,difficulty\n${csv.split('\n')[1]}`, NONE).rows;
    expect([full[0].question, full[0].answer]).toEqual(['He said "hi", then left', 'Hi, there']);
  });

  it('writes a spreadsheet paste with the same columns', () => {
    const lines = toTSV(rows).split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[1].split('\t')).toHaveLength(11);
  });

  it('names files after the subject and chapter', () => {
    expect(baseName(rows)).toBe('science-ch1-chemical-reactions-and-equations');
    expect(baseName([])).toBe('questions');
  });
});

describe('a header row', () => {
  it('still allows a difficulty after the named columns', () => {
    const { rows, issues } = format('Question | Answer\nq1 | a1 | hard\nq2 | a2', NONE);
    expect(issues).toEqual([]);
    expect(rows.map((r) => [r.question, r.difficulty])).toEqual([['q1', 'hard'], ['q2', null]]);
  });
});
