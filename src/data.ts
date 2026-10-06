import { readPasted, clearPasted } from './lib/pasted';
import { parseQuestions } from './lib/questions';
import type { Dataset } from './types';

async function fetchSheet(): Promise<string | { warning: string } | null> {
  let res: Response;
  try {
    res = await fetch('/api/questions');
  } catch {
    return null; // offline or no API (plain static hosting)
  }
  if (res.ok && !(res.headers.get('content-type') ?? '').includes('text/html')) return res.text();
  if (res.status === 502) {
    const { error } = await res.json().catch(() => ({ error: '' }));
    return { warning: `Couldn't load the Google Sheet${error ? ` (${error})` : ''}. Showing sample questions.` };
  }
  return null; // not configured, or `vite dev` without the API
}

/**
 * Where the questions come from, first match wins:
 *   1. what the user pasted into the site (this browser only)
 *   2. the Google Sheet behind /api/questions, when configured
 *   3. the bundled sample
 */
export async function loadDataset(): Promise<Dataset> {
  const pasted = readPasted();
  if (pasted) {
    const { items, skipped } = parseQuestions(pasted);
    if (items.length) return { items, skipped, source: 'pasted' };
    clearPasted(); // unusable leftovers
  }

  const sheet = await fetchSheet();
  if (typeof sheet === 'string') {
    const { items, skipped } = parseQuestions(sheet);
    if (items.length) return { items, skipped, source: 'sheet' };
    return await sample(`The Google Sheet has no usable rows. Showing sample questions.`);
  }
  return await sample(sheet?.warning);
}

async function sample(warning?: string): Promise<Dataset> {
  const res = await fetch('/questions.csv');
  if (!res.ok) throw new Error('Could not load any questions.');
  const { items, skipped } = parseQuestions(await res.text());
  return { items, skipped, source: 'sample', warning };
}
