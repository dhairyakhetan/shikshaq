import { describe, expect, it } from 'vitest';
import { firstLayouts, layoutSeed, MAX_LAYOUTS, planLayouts } from '../src/lib/layouts';
import { crc32, makeZip } from '../src/lib/zip';
import type { Pair } from '../src/types';

const make = (n: number): Pair[] => Array.from({ length: n }, (_, i) => ({ n: i + 1, q: `Q${i + 1}`, a: `A${i + 1}`, clean: `A${i + 1}` }));
const sizes = (g: Pair[][]) => g.map((x) => x.length);
const nums = (g: Pair[][]) => g.flat().map((p) => p.n);

describe('planLayouts', () => {
  it('uses as many layouts as it takes, evenly sized, every question once and in order', () => {
    const { groups, auto } = planLayouts(make(37), 10, 0, 'written', 1);
    expect(auto).toBe(4);
    expect(sizes(groups)).toEqual([10, 9, 9, 9]);
    expect(nums(groups)).toEqual(make(37).map((p) => p.n));
  });

  it('never leaves a tiny last layout', () => {
    for (let total = 11; total <= 60; total++) {
      const s = sizes(planLayouts(make(total), 10, 0, 'written', 1).groups);
      expect(Math.max(...s), `${total}`).toBeLessThanOrEqual(10);
      expect(Math.max(...s) - Math.min(...s), `${total}`).toBeLessThanOrEqual(1);
    }
  });

  it('keeps everything in one layout when it fits', () => {
    expect(sizes(planLayouts(make(7), 10, 0, 'written', 1).groups)).toEqual([7]);
    expect(sizes(planLayouts(make(10), 10, 0, 'written', 1).groups)).toEqual([10]);
  });

  it('always returns at least one layout, even for no questions', () => {
    const p = planLayouts([], 10, 0, 'written', 1);
    expect(p.groups).toEqual([[]]);
    expect(p.auto).toBe(1);
  });

  it('fewer layouts than needed: full layouts from the start of the list', () => {
    const { groups, auto } = planLayouts(make(37), 10, 2, 'written', 1);
    expect(auto).toBe(4);
    expect(sizes(groups)).toEqual([10, 10]);
    expect(nums(groups)).toEqual(make(20).map((p) => p.n));
  });

  it('more layouts than needed: the extra ones are new random mixes, with no repeats inside a layout', () => {
    const { groups, auto } = planLayouts(make(25), 10, 6, 'written', 3);
    expect(auto).toBe(3);
    expect(groups).toHaveLength(6);
    expect(nums(groups.slice(0, 3))).toEqual(make(25).map((p) => p.n)); // the first three cover everything once
    for (const g of groups.slice(3)) {
      expect(g).toHaveLength(10);
      expect(new Set(g.map((p) => p.n)).size).toBe(10);
    }
    expect(nums(groups.slice(3, 4))).not.toEqual(nums(groups.slice(4, 5))); // and they differ from each other
  });

  it('shuffled order deals every question once, repeatably, and differently per deal', () => {
    const a = planLayouts(make(30), 10, 0, 'shuffled', 1);
    expect([...nums(a.groups)].sort((x, y) => x - y)).toEqual(make(30).map((p) => p.n));
    expect(nums(a.groups)).not.toEqual(make(30).map((p) => p.n));
    expect(nums(planLayouts(make(30), 10, 0, 'shuffled', 1).groups)).toEqual(nums(a.groups));
    expect(nums(planLayouts(make(30), 10, 0, 'shuffled', 2).groups)).not.toEqual(nums(a.groups));
  });

  it('caps the number of layouts', () => {
    const big = planLayouts(make(900), 10, 0, 'written', 1);
    expect(big.groups).toHaveLength(MAX_LAYOUTS);
    expect(sizes(big.groups).every((s) => s === 10)).toBe(true);
    expect(planLayouts(make(30), 10, 999, 'written', 1).groups).toHaveLength(MAX_LAYOUTS);
  });

  it('copes with silly sizes', () => {
    expect(sizes(planLayouts(make(5), 0, 0, 'written', 1).groups)).toEqual([1, 1, 1, 1, 1]);
    expect(sizes(planLayouts(make(5), 2.9, 0, 'written', 1).groups)).toEqual([2, 2, 1]);
  });

  it('firstLayouts says which layout each question first lands in', () => {
    const plan = planLayouts(make(25), 10, 5, 'written', 1);
    const map = firstLayouts(plan);
    expect(map.get(1)).toBe(0);
    expect(map.get(25)).toBe(2);
    expect(map.size).toBe(25);
  });

  it('gives every layout its own seed, changing when "Rearrange" is pressed', () => {
    const seeds = new Set([0, 1, 2, 3].flatMap((k) => [0, 1, 2].map((r) => layoutSeed(k, r))));
    expect(seeds.size).toBe(12);
  });
});

/** Reads a ZIP back the way unzip tools do: end record, central directory, local entries. */
function readZip(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const dec = new TextDecoder();
  const eocd = zip.length - 22;
  expect(v.getUint32(eocd, true)).toBe(0x06054b50);
  const count = v.getUint16(eocd + 10, true);
  let at = v.getUint32(eocd + 16, true);
  const out: { name: string; data: string; crcOk: boolean; utf8: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const flags = v.getUint16(at + 8, true);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = dec.decode(zip.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = zip.subarray(start, start + size);
    out.push({ name, data: dec.decode(data), crcOk: crc32(data) === crc, utf8: (flags & 0x0800) !== 0 });
    at += 46 + nameLen;
  }
  return out;
}

describe('makeZip', () => {
  it('stores several files that read back exactly, with correct checksums', () => {
    const files = [
      { name: 'a-layout-1.json', data: '{"x":1}' },
      { name: 'b-layout-2.csv', data: '"q","a"\r\n"नई दिल्ली","é"' },
      { name: 'empty.txt', data: '' },
    ];
    const back = readZip(makeZip(files, new Date(2026, 9, 7, 10, 30, 0)));
    expect(back.map((f) => f.name)).toEqual(files.map((f) => f.name));
    expect(back.map((f) => f.data)).toEqual(files.map((f) => f.data));
    expect(back.every((f) => f.crcOk && f.utf8)).toBe(true);
  });

  it('has the standard CRC-32 of "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('handles an empty archive', () => {
    expect(readZip(makeZip([]))).toEqual([]);
  });
});

describe('layoutFiles', () => {
  const pairs = Array.from({ length: 25 }, (_, i) => ({ n: i + 1, q: `Question ${i + 1}`, a: `Answer${'abcdefghijklmnopqrstuvwxyz'[i]}`, clean: '' }));

  it('makes one correctly named file per layout, in the chosen type', async () => {
    const { layoutFiles } = await import('../src/lib/bundle');
    const plan = planLayouts(pairs, 10, 0, 'written', 1);
    const { files, failed } = layoutFiles('matching', 'matching', plan.groups, [], 'json', 'Unit Test');
    expect(failed).toEqual([]);
    expect(files.map((f) => f.name)).toEqual(['unit-test-matching-layout-1.json', 'unit-test-matching-layout-2.json', 'unit-test-matching-layout-3.json']);
    const parsed = files.map((f) => JSON.parse(f.data as string));
    expect(parsed.map((p) => [p.layout, p.layouts])).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(parsed.map((p) => p.pairs.length)).toEqual([9, 8, 8]);
    expect(parsed.flatMap((p) => p.pairs.map((x: { question: string }) => x.question))).toHaveLength(25);
  });

  it('adds a BOM to CSV files only, and skips (but reports) a layout that cannot be built', async () => {
    const { layoutFiles } = await import('../src/lib/bundle');
    const csv = layoutFiles('matching', 'matching', [pairs.slice(0, 3), pairs.slice(3, 4)], [], 'csv', 'T');
    expect(csv.files).toHaveLength(1);
    expect((csv.files[0].data as string).startsWith('﻿"number"')).toBe(true);
    expect(csv.failed).toEqual([2]); // matching needs two pairs
    const txt = layoutFiles('matching', 'matching', [pairs.slice(0, 3)], [], 'txt', 'T');
    expect((txt.files[0].data as string).startsWith('T\n')).toBe(true);
  });

  it('"Rearrange" counts change the arrangement of that layout only', async () => {
    const { layoutFiles } = await import('../src/lib/bundle');
    const groups = planLayouts(pairs, 10, 0, 'written', 1).groups;
    const a = layoutFiles('matching', 'matching', groups, [0, 0, 0], 'json', 'T').files.map((f) => f.data);
    const b = layoutFiles('matching', 'matching', groups, [0, 1, 0], 'json', 'T').files.map((f) => f.data);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).not.toBe(a[1]);
    expect(b[2]).toBe(a[2]);
  });
});
