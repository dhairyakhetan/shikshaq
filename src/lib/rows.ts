import { COLUMNS, type Row } from './format';

type Record_ = Record<(typeof COLUMNS)[number], string | number | null>;

/** A row as the database sees it: the columns only, with an empty value as null. */
export function toRecord(r: Row): Record_ {
  const out = {} as Record_;
  for (const c of COLUMNS) out[c] = r[c] === '' ? null : r[c];
  return out;
}

const cell = (v: string | number | null) => (v === null ? '' : String(v));

/** CSV with a header row (RFC 4180 quoting, no byte-order mark), ready to import into a table. */
export function toCSV(rows: Row[]): string {
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => q(cell(toRecord(r)[c]))).join(','))].join('\n') + '\n';
}

export function toJSON(rows: Row[]): string {
  return JSON.stringify(rows.map(toRecord), null, 2) + '\n';
}

/** Tab-separated with a header row, for pasting into Google Sheets or Excel. */
export function toTSV(rows: Row[]): string {
  return [COLUMNS.join('\t'), ...rows.map((r) => COLUMNS.map((c) => cell(toRecord(r)[c]).replace(/\t/g, ' ')).join('\t'))].join('\n');
}

export function baseName(rows: Row[]): string {
  const first = rows[0];
  const name = first ? [first.subject, first.chapter_no !== null ? `ch${first.chapter_no}` : '', first.chapter].filter(Boolean).join(' ') : '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'questions';
}

export function download(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
