import type { FormatId, GameId, Pair } from '../types';
import { build } from './build';
import { layoutSeed } from './layouts';
import { FORMATS, fileName, makeOutput } from './output';
import type { ZipFile } from './zip';

/** One file per layout, in the chosen file type, ready to zip. Layouts that can't be built are listed, not hidden. */
export function layoutFiles(game: GameId, anchor: string, groups: Pair[][], rolls: number[], fmt: FormatId, title: string) {
  const format = FORMATS.find((f) => f.id === fmt)!;
  const files: ZipFile[] = [];
  const failed: number[] = [];
  groups.forEach((group, k) => {
    const b = build(game, group, layoutSeed(k, rolls[k] ?? 0));
    if (!b.ok) { failed.push(k + 1); return; }
    const info = { n: k + 1, of: groups.length };
    const text = makeOutput(b, fmt, title, info);
    files.push({ name: fileName(title, anchor, format.ext, info), data: fmt === 'csv' ? `﻿${text}` : text }); // BOM: Excel reads accents correctly
  });
  return { files, failed };
}
