const KEY = 'shikshaq:input:v1';

/** Questions the user pasted into the site. Kept in this browser only; never sent anywhere. */
export function readPasted(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Returns false when the browser refuses to store it (private mode, storage full). */
export function savePasted(csv: string): boolean {
  try {
    localStorage.setItem(KEY, csv);
    return true;
  } catch {
    return false;
  }
}

export function clearPasted() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}
