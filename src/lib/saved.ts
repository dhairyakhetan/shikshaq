import { isSetId } from './cloud';

/** The sets this browser has saved online, newest first. Only ids and titles live here, never the questions. */
export interface SavedSet { id: string; title: string; at: number }

const KEY = 'game-maker:saved:v1';
export const MAX_SAVED = 20;

export function addSaved(list: SavedSet[], entry: SavedSet): SavedSet[] {
  return [entry, ...list.filter((s) => s.id !== entry.id)].slice(0, MAX_SAVED);
}

export function removeSaved(list: SavedSet[], id: string): SavedSet[] {
  return list.filter((s) => s.id !== id);
}

export function loadSaved(): SavedSet[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s): s is SavedSet => !!s && isSetId(s.id) && typeof s.title === 'string' && Number.isFinite(s.at))
      .slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

export function storeSaved(list: SavedSet[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: the list just won't persist */ }
}
