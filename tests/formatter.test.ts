import { describe, expect, it } from 'vitest';
import {
  BOARDS, chapterId, checkBoard, checkClass, checkDetail, checkSubject, detailsId, parseNumbered, readDetails, readMeta, standardDetail,
  STATES, SUBJECTS, titleCase, writeDetail,
} from '../src/details';
import {
  baseName, EXAMPLE, format, lineLevels, MAX_ANSWER, MAX_QUESTION, missing, NO_ANSWER, visibleIssues,
} from '../src/format';
import { addBatch, addSample, counts, EMPTY_BANK, SAMPLE, setStatus, toCSV, toJSON, toRecord, toTSV } from '../src/db';

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

describe('letting people finish writing before flagging', () => {
  // 1 bad class, 2 no answer (a topic line follows), 4 unreadable, 5 too many parts
  const { issues } = format('Class: 13\nWhat is H2O?\nTopic 1: Water\njust some words\nQ1 | A1 | x | y');
  const lines = (xs: typeof issues) => xs.map((x) => x.line);

  it('shows everything when nobody is typing', () => {
    expect(lines(visibleIssues(issues, {}))).toEqual([1, 2, 4, 5]);
    expect(issues.find((x) => x.line === 2)!.text).toBe(NO_ANSWER);
  });

  it('holds back the line being typed, and "no answer" on the line just above it', () => {
    expect(lines(visibleIssues(issues, { caret: 4 }))).toEqual([1, 2, 5]);
    expect(lines(visibleIssues(issues, { caret: 3 }))).toEqual([1, 4, 5]);
  });

  it('only holds back "no answer" above, not other problems there', () => {
    expect(lines(visibleIssues(issues, { caret: 5 }))).toEqual([1, 2, 4]);
  });

  it('holds back the line a detail box is writing while it is typed in', () => {
    expect(lines(visibleIssues(issues, { line: 1 }))).toEqual([2, 4, 5]);
  });
});

describe('capitalising names', () => {
  it('capitalises each word, keeps joining words small, and leaves acronyms, formulas and other scripts alone', () => {
    expect(titleCase('chemical reactions and equations')).toBe('Chemical Reactions and Equations');
    expect(titleCase('the french revolution')).toBe('The French Revolution');
    expect(titleCase('light: reflection and refraction')).toBe('Light: Reflection and Refraction');
    expect(titleCase('light – the nature of light')).toBe('Light – The Nature of Light');
    expect(titleCase('acid-base indicators')).toBe('Acid-Base Indicators');
    expect(titleCase('newton’s laws of motion')).toBe('Newton’s Laws of Motion');
    expect(titleCase('the pH scale and DNA')).toBe('The pH Scale and DNA');
    expect(titleCase('co2 in the air')).toBe('co2 in the Air');
    expect(titleCase('part ii: x-rays')).toBe('Part II: X-Rays');
    expect(titleCase('रासायनिक अभिक्रियाएँ')).toBe('रासायनिक अभिक्रियाएँ');
  });
});

describe('boards', () => {
  it('knows the national boards and their other names', () => {
    expect(['cbse', 'CBSE board', 'NCERT', 'Central Board of Secondary Education'].map((b) => checkBoard(b))).toEqual(Array(4).fill({ name: 'CBSE', code: 'CBSE' }));
    expect(checkBoard('cisce')).toEqual({ name: 'ICSE', code: 'ICSE' });
    expect(checkBoard('a levels')).toEqual({ name: 'Cambridge', code: 'CAIE' });
  });

  it('knows state boards by state or by the board’s own name', () => {
    for (const b of ['Maharashtra', 'maharashtra state board', 'MSBSHSE', 'State Board (Maharashtra)']) expect(checkBoard(b)).toEqual({ name: 'Maharashtra State Board', code: 'MH' });
    expect(checkBoard('UP Board')).toEqual({ name: 'Uttar Pradesh State Board', code: 'UP' });
    expect(checkBoard('Jammu & Kashmir')).toEqual({ name: 'Jammu and Kashmir State Board', code: 'JK' });
    expect(checkBoard('samacheer kalvi').code).toBe('TN');
  });

  it('warns about typos, unknown boards and a bare "state board"', () => {
    expect(checkBoard('cbsc').problem).toEqual({ level: 'warn', text: 'Did you mean CBSE?' });
    expect(checkBoard('State board').problem?.text).toBe('Which state? For example: Maharashtra State Board.');
    const odd = checkBoard('Xavier Board of Studies');
    expect(odd.code).toBe('XS');
    expect(odd.problem?.level).toBe('warn');
    expect(checkBoard('').problem).toBeUndefined();
  });

  it('has unique codes', () => {
    const codes = [...BOARDS, ...STATES].map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('classes', () => {
  it('reads numbers, ordinals, labels and Roman numerals', () => {
    expect(['10', '10th', '10 th', 'Class 10', 'X', 'x', 'Std. 8', 'Grade: 7', 'XII', 'i'].map((c) => checkClass(c).value)).toEqual([10, 10, 10, 10, 10, 10, 8, 7, 12, 1]);
  });

  it('rejects anything outside 1 to 12', () => {
    for (const c of ['0', '13', 'nursery', '11-12', '10.5']) expect(checkClass(c).problem?.level, c).toBe('error');
    expect(checkClass('')).toEqual({ value: null });
  });
});

describe('subjects', () => {
  it('knows subjects and short names, and gives each a unique three-letter code', () => {
    expect(checkSubject('maths')).toEqual({ name: 'Mathematics', code: 'MAT' });
    expect(checkSubject('Chem')).toEqual({ name: 'Chemistry', code: 'CHE' });
    expect(checkSubject('history & civics')).toEqual({ name: 'History and Civics', code: 'HCV' });
    const codes = SUBJECTS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => /^[A-Z]{3}$/.test(c))).toBe(true);
  });

  it('suggests the subject for a typo, and makes a code for an unknown one without clashing', () => {
    expect(checkSubject('Phisics').problem?.text).toBe('Did you mean Physics?');
    expect(checkSubject('Astronomy')).toMatchObject({ name: 'Astronomy', code: 'AST' });
    expect(checkSubject('physical geography')).toMatchObject({ name: 'Physical Geography', code: 'PHG' });
    expect(checkSubject('Biochemistry').code).toBe('BIX'); // BIO is Biology's
    expect(checkSubject('विज्ञान').code).toBeNull();
  });
});

describe('chapters, topics and IDs', () => {
  it('reads a number and a name in any common style', () => {
    expect(['10: Light', 'Chapter 10 - Light', '10. Light', 'Ch. 10 Light', 'Light', '10'].map((c) => parseNumbered(c, 'chapter'))).toEqual([
      { no: 10, name: 'Light' }, { no: 10, name: 'Light' }, { no: 10, name: 'Light' }, { no: 10, name: 'Light' }, { no: null, name: 'Light' }, { no: 10, name: '' },
    ]);
    expect(parseNumbered('10.3 Lenses', 'topic')).toEqual({ no: 3, name: 'Lenses' });
    expect(parseNumbered('10.3 Lenses', 'chapter').no).toBe(10);
  });

  it('builds short IDs that sort by board, class, subject and chapter', () => {
    expect(chapterId('CBSE', 11, 'CHE', 1)).toBe('CBSE11CHE01');
    expect(chapterId('MH', 9, 'SCI', 12)).toBe('MH09SCI12');
    expect(chapterId('CBSE', null, 'CHE', 1)).toBeNull();
    const ids = [chapterId('CBSE', 9, 'SCI', 2), chapterId('CBSE', 10, 'SCI', 1), chapterId('CBSE', 9, 'SCI', 10)];
    expect([...ids].sort()).toEqual([chapterId('CBSE', 9, 'SCI', 2), chapterId('CBSE', 9, 'SCI', 10), chapterId('CBSE', 10, 'SCI', 1)]);
  });

  it('recognises detail lines but not sentences', () => {
    expect(readMeta('**Class:** 10')).toEqual({ key: 'class', value: '10' });
    expect(readMeta('## Topic 2 - Indicators')).toEqual({ key: 'topic', value: '2 - Indicators' });
    expect(readMeta('Ch. 3: Acids')).toEqual({ key: 'chapter', value: '3: Acids' });
    expect(readMeta('Class XI')).toEqual({ key: 'class', value: 'XI' });
    expect(readMeta('Board: Computer ')).toEqual({ key: 'board', value: 'Computer ' }); // spaces kept while typing
    for (const s of ['Class of compounds', 'Chapters are long', 'Topic', 'Board games | fun', 'Section of a cell']) expect(readMeta(s), s).toBeNull();
  });
});

describe('the four boxes and the text', () => {
  it('writes each box as a line at the top, in a fixed order, and reads it back exactly as typed', () => {
    let t = '';
    t = writeDetail(t, 'chapter', '1: Matter');
    t = writeDetail(t, 'board', 'CBSE');
    t = writeDetail(t, 'subject', 'Computer ');
    t = writeDetail(t, 'class', '10');
    expect(t).toBe('Board: CBSE\nClass: 10\nSubject: Computer \nChapter 1: Matter\n');
    expect(readDetails(t)).toEqual({ board: 'CBSE', class: '10', subject: 'Computer ', chapter: '1: Matter' });
  });

  it('round-trips every keystroke of every box', () => {
    const typed = { board: 'Maharashtra State Board', class: 'XI', subject: 'Political Science', chapter: '12: Rights, Duties - and More?' };
    for (const [k, word] of Object.entries(typed) as [keyof typeof typed, string][]) {
      let t = 'Topic 1: Start\nq1 | a1';
      for (let i = 1; i <= word.length; i++) {
        t = writeDetail(t, k, word.slice(0, i));
        expect(readDetails(t)[k], `${k} "${word.slice(0, i)}"`).toBe(word.slice(0, i).trim() ? word.slice(0, i) : '');
      }
      expect(t.endsWith('Topic 1: Start\nq1 | a1')).toBe(true);
    }
  });

  it('edits the existing line, removes it when emptied, and leaves later chapters alone', () => {
    const t = 'Class 9\nChapter 1: A\nq1 | a1\nChapter 2: B\nq2 | b';
    expect(writeDetail(t, 'class', '10')).toBe('Class: 10\nChapter 1: A\nq1 | a1\nChapter 2: B\nq2 | b');
    expect(writeDetail(t, 'chapter', '')).toBe('Class 9\nq1 | a1\nChapter 2: B\nq2 | b');
    expect(writeDetail(t, 'board', 'ICSE')).toBe(`Board: ICSE\n${t}`);
    expect(readDetails('q1 | a1\nChapter 2: B').chapter).toBe('');
  });

  it('keeps bars, tabs and line breaks out of a box', () => {
    expect(writeDetail('', 'subject', 'Maths | Physics\tand\nmore')).toBe('Subject: Maths Physics and more\n');
  });

  it('warns under a box as soon as something is wrong, and tidies the value when leaving it', () => {
    expect(checkDetail('class', '15')?.level).toBe('error');
    expect(checkDetail('chapter', 'Light')?.text).toContain('chapter number');
    expect(checkDetail('board', 'cbse')).toBeUndefined();
    expect(standardDetail('board', 'cbse')).toBe('CBSE');
    expect(standardDetail('class', 'xi')).toBe('11');
    expect(standardDetail('class', 'fifteen')).toBe('fifteen');
    expect(standardDetail('subject', 'maths')).toBe('Mathematics');
    expect(standardDetail('chapter', 'chapter 3 - acids, bases and salts')).toBe('3: Acids, Bases and Salts');
    expect(detailsId({ board: 'cbse', class: '11th', subject: 'chem', chapter: '1: Some basic concepts' })).toBe('CBSE11CHE01');
    expect(detailsId({ board: 'cbse', class: '11th', subject: 'chem', chapter: 'Some basic concepts' })).toBeNull();
  });
});

describe('approval (the question bank behind the Approve page)', () => {
  let n = 0;
  const id = () => `id${++n}`;
  const rows = format(EXAMPLE).rows; // 7 questions, all with a chapter ID
  const at = '2026-10-09T10:00:00.000Z';

  it('sends a batch of questions to wait for the HoD', () => {
    const r = addBatch(EMPTY_BANK, rows, '  Ms Sharma ', at, id);
    expect([r.sent, r.already, r.noId]).toEqual([7, 0, 0]);
    expect(r.bank.batches).toEqual([{ id: r.bank.questions[0].batch, by: 'Ms Sharma', at }]);
    expect(r.bank.questions.every((q) => q.status === 'pending' && q.note === '' && q.reviewedAt === null)).toBe(true);
    expect(new Set(r.bank.questions.map((q) => q.id)).size).toBe(7);
    expect(r.bank.questions[0]).toMatchObject({ chapter_id: 'CBSE10SCI01', topic_id: 'CBSE10SCI01T01', question: rows[0].question, answer: rows[0].answer });
  });

  it('does not send a question twice, nor one without a chapter ID', () => {
    const first = addBatch(EMPTY_BANK, rows, 'A', at, id).bank;
    const again = addBatch(first, rows, 'A', at, id);
    expect([again.sent, again.already]).toEqual([0, 7]);
    expect(again.bank).toBe(first);
    const loose = addBatch(EMPTY_BANK, format('q1 | a1\nq2 | a2').rows, 'A', at, id);
    expect([loose.sent, loose.noId]).toEqual([0, 2]);
  });

  it('approves, sends back with a reason, and moves back to waiting', () => {
    const bank = addBatch(EMPTY_BANK, rows, 'A', at, id).bank;
    const [a, b, c] = bank.questions.map((q) => q.id);
    let next = setStatus(bank, [a, b], 'approved', 'ignored', at);
    next = setStatus(next, [c], 'rejected', '  Answer should be Rusting  ', at);
    expect(counts(next)).toEqual({ pending: 4, approved: 2, rejected: 1 });
    expect(next.questions.find((q) => q.id === a)).toMatchObject({ status: 'approved', note: '', reviewedAt: at });
    expect(next.questions.find((q) => q.id === c)).toMatchObject({ status: 'rejected', note: 'Answer should be Rusting' });
    const back = setStatus(next, [c], 'pending', '', at);
    expect(back.questions.find((q) => q.id === c)).toMatchObject({ status: 'pending', note: '', reviewedAt: null });
    expect(bank.questions.every((q) => q.status === 'pending')).toBe(true); // the original is untouched (so undo works)
  });

  it('has a sample set that each part can load on its own', () => {
    expect(SAMPLE).toHaveLength(18);
    expect(new Set(SAMPLE.map((r) => r.topic_id))).toEqual(new Set(['CBSE10SCI01T01', 'CBSE10SCI01T02', 'CBSE10SCI01T03']));
    expect(counts(addSample(EMPTY_BANK, 'pending'))).toEqual({ pending: 18, approved: 0, rejected: 0 });
    expect(counts(addSample(EMPTY_BANK, 'approved'))).toEqual({ pending: 0, approved: 18, rejected: 0 });
    expect(counts(addSample(addSample(EMPTY_BANK, 'approved'), 'pending'))).toEqual({ pending: 0, approved: 18, rejected: 0 }); // not twice
  });

  it('lets a question that was sent back be sent again', () => {
    const bank = addBatch(EMPTY_BANK, rows, 'A', at, id).bank;
    const sentBack = setStatus(bank, [bank.questions[0].id], 'rejected', 'fix it', at);
    const again = addBatch(sentBack, rows, 'A', at, id);
    expect([again.sent, again.already]).toEqual([1, 6]);
  });
});
