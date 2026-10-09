/**
 * The database, shared by the three parts and by nothing else:
 *   the question formatter writes questions into it, waiting for approval;
 *   the HoD desk approves them or sends them back;
 *   the revision games read only the approved ones.
 * None of the three uses another's code; they only agree on the shapes below.
 *
 * Demo: there is no database yet and nothing is saved anywhere (no localStorage either). Every page starts from the
 * sample bank at the end of this file, and a reload starts again. The shapes match the tables planned for Shikshaq's
 * database (batches, and questions with a status): moving to it means replacing `useBank` and deleting the sample.
 * CLAUDE.md, "The database", says how.
 */
import { useState } from 'react';

// ---------------------------------------------------------------- a question row

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** The columns of a row, in order. These are the column names of the CSV and the keys of the JSON. */
export const COLUMNS = ['chapter_id', 'topic_id', 'board', 'class', 'subject', 'chapter_no', 'chapter', 'topic_no', 'topic', 'question_no', 'question', 'answer', 'difficulty'] as const;

export interface Row {
  /** Board code + class + subject code + chapter number, such as CBSE10SCI01. Null until all four are known. */
  chapter_id: string | null;
  /** Chapter ID + "T" + topic number, such as CBSE10SCI01T02. */
  topic_id: string | null;
  board: string;
  class: number | null;
  subject: string;
  chapter_no: number | null;
  chapter: string;
  topic_no: number | null;
  topic: string;
  /** Position of the question within its topic (within its chapter when there is no topic), from 1. */
  question_no: number;
  question: string;
  answer: string;
  difficulty: Difficulty | null;
  /** The line of the pasted text the question came from. Not exported. */
  line: number;
}

// ---------------------------------------------------------------- rows as files

type Record_ = Record<(typeof COLUMNS)[number], string | number | null>;

/** A row as the database sees it: the columns only, with an empty value as null. */
export function toRecord(r: Row): Record_ {
  const out = {} as Record_;
  for (const c of COLUMNS) out[c] = r[c] === '' ? null : r[c];
  return out;
}

/** A header row, then one line per question. */
function table(rows: Row[], sep: string, cell: (v: string) => string): string {
  const line = (r: Row) => {
    const rec = toRecord(r);
    return COLUMNS.map((c) => cell(String(rec[c] ?? ''))).join(sep);
  };
  return [COLUMNS.join(sep), ...rows.map(line)].join('\n');
}

/** CSV with a header row (RFC 4180 quoting, no byte-order mark), ready to import into a table. */
export const toCSV = (rows: Row[]) => table(rows, ',', (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)) + '\n';

export const toJSON = (rows: Row[]) => JSON.stringify(rows.map(toRecord), null, 2) + '\n';

/** Tab-separated with a header row, for pasting into Google Sheets or Excel. */
export const toTSV = (rows: Row[]) => table(rows, '\t', (v) => v.replace(/\t/g, ' '));

// ---------------------------------------------------------------- the question bank

export type Status = 'pending' | 'approved' | 'rejected';
export interface Batch { id: string; by: string; at: string }
export interface BankQuestion extends Row { id: string; batch: string; status: Status; note: string; reviewedAt: string | null }
export interface Bank { batches: Batch[]; questions: BankQuestion[] }

export const EMPTY_BANK: Bank = { batches: [], questions: [] };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Adds a batch of questions. Questions with no chapter ID can't be linked to a chapter, so they aren't sent; a question
 * already waiting or approved for the same chapter isn't sent twice. One that was sent back can be sent again.
 */
export function addBatch(bank: Bank, rows: Row[], by: string, at: string, newId: () => string) {
  const ready = rows.filter((r) => r.chapter_id);
  const fresh = ready.filter((r) => !bank.questions.some((q) => q.status !== 'rejected' && q.chapter_id === r.chapter_id && norm(q.question) === norm(r.question)));
  const result = { noId: rows.length - ready.length, already: ready.length - fresh.length, sent: fresh.length };
  if (!fresh.length) return { bank, ...result };
  const batch: Batch = { id: newId(), by: by.trim(), at };
  const questions = fresh.map((r): BankQuestion => ({ ...r, id: newId(), batch: batch.id, status: 'pending', note: '', reviewedAt: null }));
  return { bank: { batches: [...bank.batches, batch], questions: [...bank.questions, ...questions] }, ...result };
}

/** Approve, send back (with the reason the teacher sees) or move back to waiting. */
export function setStatus(bank: Bank, ids: string[], status: Status, note: string, at: string): Bank {
  const pick = new Set(ids);
  return {
    ...bank,
    questions: bank.questions.map((q) => (pick.has(q.id) ? { ...q, status, note: status === 'rejected' ? note.trim() : '', reviewedAt: status === 'pending' ? null : at } : q)),
  };
}

export const counts = (bank: Bank): Record<Status, number> => ({
  pending: bank.questions.filter((q) => q.status === 'pending').length,
  approved: bank.questions.filter((q) => q.status === 'approved').length,
  rejected: bank.questions.filter((q) => q.status === 'rejected').length,
});

/**
 * The bank. Demo: it starts from the sample below and keeps changes only while the page is open. In Shikshaq this
 * reads from and writes to the database instead (see CLAUDE.md).
 */
export const useBank = () => useState<Bank>(SAMPLE_BANK);

export const newId = () => (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

// ---------------------------------------------------------------- demo data

/**
 * What the database might hold, so each page can be tried on its own: CBSE chapters from Classes 9, 10 and 11, each one
 * teacher's batch. Approved batches are the question bank the games use; waiting ones are on the HoD desk. A 4th item on
 * a question means the HoD sent it back, with that reason. Delete all of this when the real database is connected.
 */
type DemoQuestion = [question: string, answer: string, difficulty: Difficulty, sentBack?: string];
interface DemoChapter { cls: number; subject: string; code: string; no: number; name: string; by: string; hoursAgo: number; status: 'approved' | 'pending'; topics: [string, DemoQuestion[]][] }

const DEMO: DemoChapter[] = [
  { cls: 10, subject: 'Science', code: 'SCI', no: 1, name: 'Chemical Reactions and Equations', by: 'Ms Sharma', hoursAgo: 150, status: 'approved', topics: [
    ['Chemical Equations', [
      ['Equation with the same number of atoms of each element on both sides', 'Balanced equation', 'easy'],
      ['Law that requires a chemical equation to be balanced', 'Law of conservation of mass', 'medium'],
      ['Substances that take part in a chemical reaction', 'Reactants', 'easy'],
      ['Substances formed in a chemical reaction', 'Products', 'easy'],
      ['Symbol written after a formula to show that a substance is a gas', '(g)', 'medium'],
    ]],
    ['Types of Chemical Reactions', [
      ['Reaction in which two or more reactants form a single product', 'Combination', 'easy'],
      ['Reaction in which a single reactant breaks down into simpler products', 'Decomposition', 'easy'],
      ['Reaction in which a more reactive element takes the place of a less reactive one in its compound', 'Displacement', 'medium'],
      ['Gain of oxygen by a substance during a reaction', 'Oxidation', 'easy'],
      ['Loss of oxygen by a substance during a reaction', 'Reduction', 'easy'],
      ['Reaction in which heat is given out', 'Exothermic', 'easy'],
      ['Insoluble solid formed when two solutions react', 'Precipitate', 'medium'],
    ]],
    ['Effects of Oxidation in Everyday Life', [
      ['Process in which metals are slowly eaten away by air and moisture', 'Corrosion', 'easy'],
      ['Common name for the corrosion of iron', 'Rusting', 'easy'],
      ['Fats and oils go ___ when they are oxidised and their smell and taste change', 'Rancid', 'medium'],
      ['Gas filled in chip packets to keep the chips from going rancid', 'Nitrogen', 'easy'],
      ['Coating iron with zinc to stop it rusting', 'Galvanisation', 'medium'],
      ['Colour of the coating that forms on copper left in moist air', 'Green', 'easy'],
    ]],
  ] },
  { cls: 10, subject: 'Science', code: 'SCI', no: 2, name: 'Acids, Bases and Salts', by: 'Ms Sharma', hoursAgo: 100, status: 'approved', topics: [
    ['Acids and Bases', [
      ['Natural indicator that is extracted from lichen', 'Litmus', 'easy'],
      ['Colour that blue litmus turns in an acid', 'Red', 'easy'],
      ['Colour that phenolphthalein turns in a base', 'Colourless', 'easy', 'Wrong answer: phenolphthalein turns pink in a base. It is colourless in an acid.'],
      ['Gas given out when an acid reacts with a metal such as zinc', 'Hydrogen', 'easy'],
      ['Gas given out when an acid reacts with a metal carbonate', 'Carbon dioxide', 'easy'],
      ['Bases that dissolve in water', 'Alkalis', 'medium'],
      ['Reaction of an acid with a base to give a salt and water', 'Neutralisation', 'medium'],
    ]],
    ['How Strong Are Acids and Bases', [
      ['Scale used to measure how acidic or basic a solution is', 'pH scale', 'easy'],
      ['pH of a neutral solution', '7', 'easy'],
      ['Acid made in our stomach that helps digest food', 'Hydrochloric acid', 'medium'],
      ['Mild base, such as milk of magnesia, taken for indigestion', 'Antacid', 'easy'],
      ['Tooth decay starts when the pH in the mouth falls below this', '5.5', 'hard'],
    ]],
    ['Salts', [
      ['Common name of sodium chloride', 'Common salt', 'easy'],
      ['Chemical name of baking soda', 'Sodium hydrogencarbonate', 'medium'],
      ['Common name of sodium carbonate decahydrate', 'Washing soda', 'medium'],
      ['Calcium sulphate hemihydrate, used to support fractured bones', 'Plaster of Paris', 'medium'],
      ['Compound made by the action of chlorine on dry slaked lime', 'Bleaching powder', 'hard'],
      ['Fixed number of water molecules in one formula unit of a salt', 'Water of crystallisation', 'medium'],
    ]],
  ] },
  { cls: 9, subject: 'Science', code: 'SCI', no: 5, name: 'The Fundamental Unit of Life', by: 'Mr Iyer', hoursAgo: 130, status: 'approved', topics: [
    ['Discovery and Types of Cells', [
      ['Scientist who first saw cells, in a thin slice of cork', 'Robert Hooke', 'easy'],
      ['Scientist who first saw free-living cells in pond water', 'Leeuwenhoek', 'medium'],
      ['Organisms made of a single cell', 'Unicellular', 'easy'],
      ['Cells, such as bacteria, whose nuclear region has no nuclear membrane', 'Prokaryotic', 'medium'],
    ]],
    ['Plasma Membrane and Cell Wall', [
      ['Movement of water through a selectively permeable membrane', 'Osmosis', 'easy'],
      ['Solution in which a cell swells up because water moves into it', 'Hypotonic', 'medium'],
      ['Shrinking of the contents of a plant cell away from its wall when it loses water', 'Plasmolysis', 'medium'],
      ['Substance that the plant cell wall is mainly made of', 'Cellulose', 'easy'],
      ['Process by which an amoeba takes in food using its flexible membrane', 'Endocytosis', 'hard'],
    ]],
    ['Cell Organelles', [
      ['Organelle known as the powerhouse of the cell', 'Mitochondria', 'easy'],
      ['Organelles known as the suicide bags of the cell', 'Lysosomes', 'easy'],
      ['Organelle that stores, changes and packages materials made in the cell', 'Golgi apparatus', 'medium'],
      ['Plastids that contain chlorophyll', 'Chloroplasts', 'easy'],
      ['Tiny particles where proteins are made', 'Ribosomes', 'medium'],
      ['Storage sacs that are filled with cell sap in plant cells', 'Vacuoles', 'medium'],
    ]],
  ] },
  { cls: 11, subject: 'Biology', code: 'BIO', no: 1, name: 'The Living World', by: 'Ms Fernandes', hoursAgo: 80, status: 'approved', topics: [
    ['Diversity in the Living World', [
      ['The number and types of organisms present on Earth', 'Biodiversity', 'easy'],
      ['Process of giving a standard scientific name to an organism', 'Nomenclature', 'easy'],
      ['Naming system in which every name has a genus name and a species name', 'Binomial nomenclature', 'easy'],
      ['Scientist who gave the binomial system of naming', 'Carolus Linnaeus', 'easy'],
      ['Language in which scientific names are written', 'Latin', 'medium'],
    ]],
    ['Taxonomic Categories', [
      ['Basic unit of classification: a group of similar organisms', 'Species', 'easy'],
      ['Group of related genera', 'Family', 'easy'],
      ['Group of related families', 'Order', 'easy'],
      ['Group of related classes, in animals', 'Phylum', 'medium'],
      ['Highest taxonomic category', 'Kingdom', 'easy'],
    ]],
    ['Taxonomical Aids', [
      ['Store of dried, pressed and preserved plant specimens on sheets', 'Herbarium', 'easy'],
      ['Place where living plants are grown for study and reference', 'Botanical garden', 'easy'],
      ['Place where wild animals are kept in surroundings like their natural home', 'Zoological park', 'easy'],
      ['Collection of preserved plant and animal specimens for study', 'Museum', 'easy'],
      ['Aid for identifying organisms, based on pairs of contrasting characters', 'Key', 'medium'],
    ]],
  ] },
  { cls: 10, subject: 'Geography', code: 'GEO', no: 1, name: 'Resources and Development', by: 'Mr Iyer', hoursAgo: 60, status: 'approved', topics: [
    ['Types of Resources', [
      ['Resources that come from living things, such as forests and livestock', 'Biotic', 'easy'],
      ['Resources made of non-living things, such as rocks and metals', 'Abiotic', 'easy'],
      ['Resources that can be renewed, such as solar and wind energy', 'Renewable', 'easy'],
      ['Resources found everywhere, like the air we breathe', 'Ubiquitous', 'medium'],
      ['Resources found only in certain places, such as copper and iron ore', 'Ubiquitous', 'medium', 'Wrong answer: resources found only in certain places are localised. Ubiquitous means found everywhere, like air.'],
    ]],
    ['Resource Planning', [
      ['Summit held in Rio de Janeiro in 1992 on the environment and development', 'Earth Summit', 'easy'],
      ['Plan for sustainable development signed at the Rio summit', 'Agenda 21', 'medium'],
      ['Development that meets present needs without harming future generations', 'Sustainable development', 'easy'],
    ]],
    ['Soil as a Resource', [
      ['Most widely spread soil in India, found in the northern plains', 'Alluvial soil', 'easy'],
      ['Other name for black soil', 'Regur', 'medium'],
      ['Soil formed under high temperature and heavy rainfall, with intense leaching', 'Laterite', 'medium'],
      ['Wearing away of the topsoil by wind and water', 'Soil erosion', 'easy'],
      ['Ploughing along the contour lines to slow water running down a slope', 'Contour ploughing', 'medium'],
      ['Rows of trees planted to break the force of the wind', 'Shelter belts', 'medium'],
    ]],
  ] },
  { cls: 10, subject: 'Science', code: 'SCI', no: 3, name: 'Metals and Non-Metals', by: 'Mr Iyer', hoursAgo: 3, status: 'pending', topics: [
    ['Physical Properties', [
      ['Property of metals that lets them be beaten into thin sheets', 'Malleability', 'easy'],
      ['Property of metals that lets them be drawn into thin wires', 'Ductility', 'easy'],
      ['Metals that make a ringing sound when struck are said to be this', 'Sonorous', 'medium'],
      ['Only metal that is a liquid at room temperature', 'Mercury', 'easy'],
      ['Non-metal that is a liquid at room temperature', 'Bromine', 'easy'],
    ]],
    ['Chemical Properties', [
      ['Metal, other than potassium, that is kept in kerosene so it does not catch fire', 'Sodium', 'medium'],
      ['Metal oxides that react with both acids and bases', 'Amphoteric', 'medium'],
      ['List of metals in order of how reactive they are', 'Reactivity series', 'easy'],
      ['Compounds formed when a metal gives electrons to a non-metal', 'Ionic compounds', 'medium'],
    ]],
    ['Occurrence of Metals', [
      ['Minerals from which a metal can be extracted at a profit', 'Ores', 'easy'],
      ['Impurities such as soil and sand found with an ore', 'Gangue', 'medium'],
      ['Strongly heating a sulphide ore in plenty of air', 'Roasting', 'medium'],
      ['Strongly heating a carbonate ore in limited air', 'Calcination', 'medium'],
      ['Mixture of two or more metals, or of a metal and a non-metal', 'Alloy', 'easy'],
    ]],
  ] },
  { cls: 9, subject: 'Science', code: 'SCI', no: 6, name: 'Tissues', by: 'Ms Fernandes', hoursAgo: 20, status: 'pending', topics: [
    ['Plant Tissues', [
      ['Plant tissue whose cells keep dividing so the plant can grow', 'Meristematic tissue', 'easy'],
      ['Meristem found at the tips of roots and stems', 'Apical meristem', 'medium'],
      ['Plant tissue that carries water and minerals', 'Xylem', 'easy'],
      ['Plant tissue that carries food', 'Phloem', 'easy'],
      ['Small pores on the surface of a leaf', 'Stomata', 'easy'],
    ]],
    ['Animal Tissues', [
      ['Tissue that covers the body and lines its organs', 'Epithelial tissue', 'easy'],
      ['Fluid connective tissue that carries oxygen and food', 'Blood', 'easy'],
      ['Tissue that joins a muscle to a bone', 'Tendon', 'easy'],
      ['Tissue that joins two bones', 'Ligament', 'easy'],
      ['Muscle found only in the heart', 'Cardiac muscle', 'easy'],
      ['Cell of the nervous tissue', 'Neuron', 'easy'],
    ]],
  ] },
  { cls: 10, subject: 'Geography', code: 'GEO', no: 3, name: 'Water Resources', by: 'Ms Kapoor', hoursAgo: 6, status: 'pending', topics: [
    ['Multi-Purpose River Projects', [
      ['Jawaharlal Nehru called these the "temples of modern India"', 'Dams', 'easy'],
      ['Projects built on rivers for irrigation, electricity and flood control together', 'Multi-purpose projects', 'easy'],
      ['River on which the Bhakra Nangal dam is built', 'Sutlej', 'medium'],
      ['Movement against the Sardar Sarovar dam on the Narmada', 'Narmada Bachao Andolan', 'medium'],
    ]],
    ['Rainwater Harvesting', [
      ['Underground tanks used to store rainwater in Rajasthan', 'Tankas', 'medium'],
      ['First state to make rooftop rainwater harvesting compulsory for all houses', 'Tamil Nadu', 'easy'],
      ['State where bamboo pipes have been used for about 200 years to carry stream water to plants', 'Meghalaya', 'medium'],
      ['Diversion channels, also called guls, used for farming in the western Himalayas', 'Kuls', 'hard'],
    ]],
  ] },
];

const pad2 = (n: number) => String(n).padStart(2, '0');
const HOUR = 3_600_000;

export const SAMPLE_BANK: Bank = (() => {
  const now = Date.now();
  const bank: Bank = { batches: [], questions: [] };
  for (const c of [...DEMO].sort((a, b) => b.hoursAgo - a.hoursAgo)) {
    const chapter_id = `CBSE${pad2(c.cls)}${c.code}${pad2(c.no)}`;
    const batch = `demo-${chapter_id}`;
    const reviewedAt = c.status === 'approved' ? new Date(now - (c.hoursAgo - 2) * HOUR).toISOString() : null;
    bank.batches.push({ id: batch, by: c.by, at: new Date(now - c.hoursAgo * HOUR).toISOString() });
    c.topics.forEach(([topic, qs], t) => qs.forEach(([question, answer, difficulty, sentBack], q) => bank.questions.push({
      id: `${chapter_id}-${t + 1}-${q + 1}`, batch, chapter_id, topic_id: `${chapter_id}T${pad2(t + 1)}`,
      board: 'CBSE', class: c.cls, subject: c.subject, chapter_no: c.no, chapter: c.name, topic_no: t + 1, topic,
      question_no: q + 1, question, answer, difficulty, line: 0,
      status: sentBack ? 'rejected' : c.status, note: sentBack ?? '', reviewedAt,
    })));
  }
  return bank;
})();
