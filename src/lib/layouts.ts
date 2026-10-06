import type { Pair } from '../types';
import { rng } from './rng';
import { shuffle } from './shuffle';

export const PER_LAYOUT_CHOICES = [5, 8, 10, 12, 15, 20, 25, 30] as const;
export const LAYOUT_COUNT_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20] as const;
export const DEFAULT_PER_LAYOUT = 10;
export const MAX_LAYOUTS = 50;

export type Order = 'written' | 'shuffled';

export interface Plan {
  /** One list of questions per layout. Always at least one (it may be empty). */
  groups: Pair[][];
  /** How many layouts it takes to use every question once at this size. */
  auto: number;
}

/** `parts` sizes that add up to `total` and differ by at most one. */
function balanced(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Splits a game's questions into layouts of at most `perLayout`.
 *  - `wanted` 0 means "as many as it takes to use every question once". Those layouts are the same size
 *    give or take one, so there is never a tiny left-over layout.
 *  - Fewer layouts than that: each holds `perLayout` questions, taken in order.
 *  - More layouts than that: the extra ones are fresh random mixes of the questions (repeats are expected).
 * `order` 'shuffled' deals the questions out in a random order; `deal` picks which one.
 */
export function planLayouts(pool: Pair[], perLayout: number, wanted: number, order: Order, deal: number): Plan {
  const per = Math.max(1, Math.floor(perLayout));
  const items = order === 'shuffled' ? shuffle(pool, rng(deal)) : pool;
  const needed = Math.ceil(items.length / per);
  const auto = Math.max(1, Math.min(MAX_LAYOUTS, needed));
  const count = Math.max(1, Math.min(MAX_LAYOUTS, wanted > 0 ? Math.floor(wanted) : auto));
  const sizes = count >= auto && needed <= MAX_LAYOUTS ? balanced(items.length, auto) : Array<number>(count).fill(per);

  const groups: Pair[][] = [];
  let at = 0;
  for (let k = 0; k < count; k++) {
    if (k < auto && at < items.length) {
      groups.push(items.slice(at, at + sizes[k]));
      at += sizes[k];
    } else {
      groups.push(shuffle(items, rng(deal * 131 + k * 7919 + 17)).slice(0, Math.min(per, items.length)));
    }
  }
  return { groups, auto };
}

/** For each pair, the first layout (0-based) it appears in. */
export function firstLayouts(plan: Plan): Map<number, number> {
  const out = new Map<number, number>();
  plan.groups.forEach((g, k) => g.forEach((p) => { if (!out.has(p.n)) out.set(p.n, k); }));
  return out;
}

/** Seed for one layout's arrangement; `rolls` counts how often the user pressed "Rearrange" on it. */
export function layoutSeed(k: number, rolls: number): number {
  return 1 + k * 1009 + rolls * 7919;
}
