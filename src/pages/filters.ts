import { useSearchParams } from 'react-router-dom';
import { useDataset } from '../App';
import type { QA } from '../types';

/** Subject / difficulty filters live in the URL, so a link shares the exact game. */
export function useFilters() {
  const { items } = useDataset();
  const [params, setParams] = useSearchParams();
  const subject = params.get('subject') ?? '';
  const difficulty = params.get('difficulty') ?? '';

  const options = (field: 'subject' | 'difficulty') =>
    [...new Set(items.map((q) => q[field]).filter(Boolean))].sort();

  const apply = (q: QA) => (!subject || q.subject === subject) && (!difficulty || q.difficulty === difficulty);

  function set(name: 'subject' | 'difficulty', value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next, { replace: true });
  }

  return { subject, difficulty, subjects: options('subject'), difficulties: options('difficulty'), apply, set, search: params.toString() ? `?${params}` : '' };
}
