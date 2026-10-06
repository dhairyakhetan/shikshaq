const BOM = '﻿';

/**
 * Saves a file through a temporary link. Text CSV gets a byte-order mark so Excel reads accents and Hindi correctly;
 * bytes (a zip) are saved as they are.
 */
export function saveFile(name: string, data: string | Uint8Array<ArrayBuffer>, mime: string): void {
  const text = typeof data === 'string';
  const body = text && mime === 'text/csv' ? BOM + data : data;
  const url = URL.createObjectURL(new Blob([body], { type: text ? `${mime};charset=utf-8` : mime }));
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
