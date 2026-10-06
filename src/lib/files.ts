/** Saves text as a file through a temporary link. A CSV gets a byte-order mark so Excel reads accents and Hindi correctly. */
export function saveFile(name: string, text: string, mime: string): void {
  const body = mime === 'text/csv' ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens text in a new tab (used for the printable worksheet). */
export function openFile(text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
