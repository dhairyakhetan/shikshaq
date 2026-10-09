import { describe, expect, it } from 'vitest';
import {
  BOARDS, chapterId, checkBoard, checkClass, checkDetail, checkSubject, detailsId, parseNumbered, readDetails, readMeta, standardDetail, STATES, SUBJECTS, writeDetail,
} from '../src/lib/details';
import { titleCase } from '../src/lib/text';

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
