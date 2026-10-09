import { describe, expect, it } from 'vitest';
import { EXAMPLE } from '../src/example';
import { format, lineLevels, MAX_ANSWER, MAX_QUESTION, missing } from '../src/lib/format';
import { baseName, toCSV, toJSON, toRecord, toTSV } from '../src/lib/rows';

const qa = (raw: string) => format(raw).rows.map((r) => [r.question, r.answer]);
const HEAD = 'Board: CBSE\nClass: 10\nSubject: Science\nChapter 1: Matter\n';

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
      '﻿What is the capital of France? | Paris\r\n',
    ];
    for (const s of shapes) expect(qa(s), s).toEqual([['What is the capital of France?', 'Paris']]);
  });

  it('splits statement lines on =, a spaced dash or a colon', () => {
    expect(qa('SI unit of force = Newton')).toEqual([['SI unit of force', 'Newton']]);
    expect(qa('Powerhouse of the cell - Mitochondria')).toEqual([['Powerhouse of the cell', 'Mitochondria']]);
    expect(qa('Powerhouse of the cell: Mitochondria')).toEqual([['Powerhouse of the cell', 'Mitochondria']]);
    expect(qa('Q1. Name the gas plants take in\nAns: Carbon dioxide')).toEqual([['Name the gas plants take in', 'Carbon dioxide']]);
  });

  it('never changes the wording of questions and answers', () => {
    expect(qa('The ___ is the powerhouse of the cell | mitochondria')).toEqual([['The ___ is the powerhouse of the cell', 'mitochondria']]);
    expect(qa('3.14 is the value of which constant? | Pi')).toEqual([['3.14 is the value of which constant?', 'Pi']]);
    expect(qa('Quartz is made of which element besides oxygen? | silicon')).toEqual([['Quartz is made of which element besides oxygen?', 'silicon']]);
    expect(qa('What is v = u + at called? Equation of motion')).toEqual([['What is v = u + at called?', 'Equation of motion']]);
    expect(qa('Relation between f and R for a spherical mirror | f = R/2')).toEqual([['Relation between f and R for a spherical mirror', 'f = R/2']]);
    expect(qa('पानी का रासायनिक सूत्र क्या है? | H₂O')).toEqual([['पानी का रासायनिक सूत्र क्या है?', 'H₂O']]);
  });

  it('skips code fences, Markdown dividers and table headers', () => {
    const raw = '```\n| Question | Answer |\n|---|---|\n| Capital of France | Paris |\n```';
    expect(qa(raw)).toEqual([['Capital of France', 'Paris']]);
    expect(format(raw).issues).toEqual([]);
  });

  it('reports every line it cannot use, as an error with its line number', () => {
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
      'a | b | c | d',
      'What is the capital of France? | Paris',
      'What is the capital of France? | Paris',
      'What is the capital of Spain?',
    ].join('\n'));
    expect(rows.map((r) => r.line)).toEqual([2, 11]);
    expect(issues.filter((x) => x.level === 'error').map((x) => x.line)).toEqual([1, 4, 5, 7, 8, 9, 10, 12, 13]);
    expect(issues.find((x) => x.line === 5)!.text).toBe('This question has no answer.');
    expect(issues.find((x) => x.line === 13)!.text).toBe('This question has no answer.');
    expect(issues.find((x) => x.line === 12)!.text).toBe('Same question as line 11, skipped.');
  });

  it('marks each line with its worst problem, for the underline', () => {
    const { issues } = format('Board: Xyz\nClass: 13\nq1 | a1\nwhat?');
    expect([...lineLevels(issues)]).toEqual([[1, 'warn'], [2, 'error'], [4, 'error']]);
  });
});

describe('details: board, class, subject, chapter, topic, difficulty', () => {
  it('takes them from lines in any common style and writes names the standard way', () => {
    const { rows, issues } = format(EXAMPLE);
    expect(issues.map((x) => [x.line, x.level, x.text])).toEqual([[19, 'error', 'This question has no answer.']]);
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => `${r.chapter_id} ${r.board}/${r.class}/${r.subject}/${r.chapter_no}/${r.chapter}`)))
      .toEqual(new Set(['CBSE10SCI01 CBSE/10/Science/1/Chemical Reactions and Equations']));
    expect(rows.map((r) => [r.topic_id, r.question_no])).toEqual([
      ['CBSE10SCI01T01', 1], ['CBSE10SCI01T01', 2], ['CBSE10SCI01T02', 1], ['CBSE10SCI01T02', 2], ['CBSE10SCI01T02', 3], ['CBSE10SCI01T03', 1], ['CBSE10SCI01T03', 2],
    ]);
    expect([...new Set(rows.map((r) => r.topic))]).toEqual(['Chemical Equations', 'Types of Chemical Reactions', 'Effects of Oxidation in Everyday Life']);
    expect(rows.map((r) => r.answer)).toEqual(['Balanced equation', 'Law of conservation of mass', 'Combination reaction', 'Decomposition reaction', 'Oxidation', 'Rusting', 'Nitrogen']);
    expect(rows.map((r) => r.difficulty)).toEqual([null, null, 'easy', null, null, null, 'easy']);
  });

  it('numbers topics by order of appearance unless numbered, and a new chapter clears the topic', () => {
    const rows = format(`${HEAD}Topic: a\nq1 | a\nTopic: b\nq2 | a\nTopic 7: c\nq3 | a\nTopic: a\nq4 | a\nChapter 2: x\nq5 | a`).rows;
    expect(rows.map((r) => [r.topic, r.topic_no, r.question_no, r.topic_id])).toEqual([
      ['A', 1, 1, 'CBSE10SCI01T01'], ['B', 2, 1, 'CBSE10SCI01T02'], ['C', 7, 1, 'CBSE10SCI01T07'], ['A', 1, 2, 'CBSE10SCI01T01'], ['', null, 1, null],
    ]);
    expect(rows[4].chapter_id).toBe('CBSE10SCI02');
  });

  it('reads "10.2" in a topic line as topic 2', () => {
    expect(format(`${HEAD}Topic 1.2: Atoms\nq1 | a1`).rows[0].topic_id).toBe('CBSE10SCI01T02');
  });

  it('gives no ID until board, class, subject and chapter number are all known', () => {
    expect(format('Chapter 1: Matter\nTopic 1: Atoms\nq1 | a1').rows[0]).toMatchObject({ chapter_id: null, topic_id: null, chapter_no: 1, topic_no: 1 });
    const noNumber = format('Board: CBSE\nClass: 10\nSubject: Science\nChapter: Matter\nq1 | a1');
    expect(noNumber.rows[0].chapter_id).toBeNull();
    expect(noNumber.issues).toEqual([{ line: 4, level: 'warn', text: 'Add the chapter number, for example "3: Acids". It is part of the chapter ID.' }]);
  });

  it('accepts difficulty as a third part or a line, and warns about unknown values', () => {
    const { rows, issues } = format('q1 | a | Hard\nDifficulty: medium\nq2 | a\nq3 | a | e\nq4 | a | tricky');
    expect(rows.map((r) => r.difficulty)).toEqual(['hard', 'medium', 'easy', 'medium']);
    expect(issues).toEqual([{ line: 5, level: 'warn', text: '"tricky" is not easy, medium or hard, so no difficulty was set.' }]);
  });

  it('flags a wrong class as an error and an unknown board or subject as a warning', () => {
    const { rows, issues } = format('Board: cbsc\nClass: 13\nSubject: chemsitry\nChapter 1: x\nq1 | a1');
    expect(issues.map((x) => [x.line, x.level, x.text])).toEqual([
      [1, 'warn', 'Did you mean CBSE?'],
      [2, 'error', 'Class must be from 1 to 12.'],
      [3, 'warn', 'Did you mean Chemistry?'],
    ]);
    expect(rows[0].class).toBeNull();
  });

  it('warns about ICSE in class 11, two names for one chapter number, unused details and empty topics', () => {
    const { issues } = format([
      'Board: ICSE', 'Class: 11', 'Subject: Physics', 'Chapter 1: Units', 'q1 | a',
      'Chapter 1: Motion', 'q2 | a',
      'Topic 1: Empty', 'Topic 2: Full', 'q3 | a',
      'Class: 9', 'Class: 11', 'q4 | a',
    ].join('\n'));
    expect(issues.map((x) => [x.line, x.text])).toEqual([
      [1, 'ICSE ends at class 10. Classes 11 and 12 are ISC.'],
      [6, 'Chapter ID ICSE11PHY01 is already "Units" (line 4). Check the chapter number.'],
      [8, 'No questions under this topic.'],
      [11, 'Not used: Class is set again on line 12 before any question.'],
    ]);
  });

  it('does not mistake sentences for detail lines', () => {
    expect(qa('Class of compounds that turn litmus red | Acids')).toEqual([['Class of compounds that turn litmus red', 'Acids']]);
    expect(qa('Section of a plant cell that holds sap? Vacuole')).toEqual([['Section of a plant cell that holds sap?', 'Vacuole']]);
    expect(qa('Chlorophyll is found in which organelle? Chloroplast')).toEqual([['Chlorophyll is found in which organelle?', 'Chloroplast']]);
    expect(qa('Class civil engineering as a branch? Yes')).toEqual([['Class civil engineering as a branch?', 'Yes']]);
  });

  it('reads spreadsheet tables with a header row, in any column order, checking each value once', () => {
    const tsv = 'Board\tClass\tSubject\tChapter\tTopic\tQuestion\tAnswer\tLevel\ncbse\t10th\tchem\t3: acids\tindicators\tColour of litmus in acid\tRed\teasy\ncbse\t10th\tchem\t3: acids\tindicators\tColour of litmus in base\tBlue\t\nxyz\t10\tchem\t3: acids\t\tA third\tC\t\nxyz\t10\tchem\t3: acids\t\tA fourth\tD\t';
    const { rows, issues } = format(tsv);
    expect(rows.map((r) => [r.chapter_id, r.topic_id, r.chapter, r.topic, r.question_no, r.answer, r.difficulty])).toEqual([
      ['CBSE10CHE03', 'CBSE10CHE03T01', 'Acids', 'Indicators', 1, 'Red', 'easy'],
      ['CBSE10CHE03', 'CBSE10CHE03T01', 'Acids', 'Indicators', 2, 'Blue', null],
      ['XYZ10CHE03', null, 'Acids', '', 1, 'C', null],
      ['XYZ10CHE03', null, 'Acids', '', 2, 'D', null],
    ]);
    expect(issues.map((x) => x.line)).toEqual([4]);
    const csv = 'question,answer,topic\n"Capital of France, the country",Paris,Europe\n"He said ""hi""",Hi,Words';
    expect(format(csv).rows.map((r) => [r.question, r.answer, r.topic])).toEqual([['Capital of France, the country', 'Paris', 'Europe'], ['He said "hi"', 'Hi', 'Words']]);
    expect(qa('1\tCapital of France\tParis')).toEqual([['Capital of France', 'Paris']]);
  });

  it('keeps detail lines that contain commas after a CSV header', () => {
    const rows = format('question,answer\nq1,a1\nChapter 3: Acids, Bases and Salts\nq2,a2').rows;
    expect(rows.map((r) => r.chapter)).toEqual(['', 'Acids, Bases and Salts']);
  });

  it('counts questions missing a detail', () => {
    const { rows } = format('Class: 10\nq1 | a\nTopic: T\nq2 | a');
    expect(missing(rows)).toEqual({ board: 2, class: 0, subject: 2, chapter: 2, topic: 1, id: 2 });
  });
});

describe('output for the database', () => {
  const { rows } = format(EXAMPLE);

  it('has one flat record per question, with null for missing values', () => {
    expect(toRecord(rows[0])).toEqual({
      chapter_id: 'CBSE10SCI01', topic_id: 'CBSE10SCI01T01', board: 'CBSE', class: 10, subject: 'Science', chapter_no: 1,
      chapter: 'Chemical Reactions and Equations', topic_no: 1, topic: 'Chemical Equations', question_no: 1,
      question: 'Equation with the same number of atoms of each element on both sides?', answer: 'Balanced equation', difficulty: null,
    });
    expect(JSON.parse(toJSON(rows))).toHaveLength(7);
  });

  it('writes CSV with proper quoting and no byte-order mark', () => {
    const csv = toCSV(format('He said "hi", then left | Hi, there').rows);
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
    expect(csv.split('\n')[0]).toBe('chapter_id,topic_id,board,class,subject,chapter_no,chapter,topic_no,topic,question_no,question,answer,difficulty');
    expect(csv.split('\n')[1]).toBe(',,,,,,,,,1,"He said ""hi"", then left","Hi, there",');
  });

  it('reads its own CSV and spreadsheet copy back into the same rows', () => {
    const strip = (rs: typeof rows) => rs.map(({ line: _line, ...r }) => r);
    expect(strip(format(toCSV(rows)).rows)).toEqual(strip(rows));
    expect(strip(format(toTSV(rows)).rows)).toEqual(strip(rows));
  });

  it('writes a spreadsheet copy with the same columns', () => {
    const lines = toTSV(rows).split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[1].split('\t')).toHaveLength(13);
  });

  it('names files after the chapter ID', () => {
    expect(baseName(rows)).toBe('CBSE10SCI01-chemical-reactions-and-equations');
    expect(baseName(format('Subject: Physics\nq1 | a1').rows)).toBe('physics-questions');
    expect(baseName([])).toBe('questions');
  });
});
