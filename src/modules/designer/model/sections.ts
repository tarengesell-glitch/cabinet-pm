/**
 * Editing a cabinet's front and interior in Customize (owner, 2026-11-12), the way the common
 * cabinet design programs do it: pick a section of the cabinet's face, then split it vertically
 * or horizontally, add shelves, turn it into drawers and add drawers, add roll-outs, or make it
 * doors or open. Pure: every action returns a new tree, or the reason it can't be done.
 *
 * A section is found by its path: the part indexes from the cabinet's whole face down ([] is the
 * whole face). New parts share their space equally; a drawer bank keeps the standard top drawer.
 */
import type { FrontSection, Result } from '@/core/index';
import { partLengths } from './fronts';

export type SectionPath = readonly number[];

export type SectionAction =
  | 'split_vertical'
  | 'split_horizontal'
  | 'remove'
  | 'add_shelf'
  | 'remove_shelf'
  | 'drawers'
  | 'add_drawer'
  | 'remove_drawer'
  | 'add_rollout'
  | 'remove_rollout'
  | 'doors'
  | 'open';

/** The section at a path, or null when there is none. */
export function sectionAt(root: FrontSection, path: SectionPath): FrontSection | null {
  let at: FrontSection = root;
  for (const i of path) {
    if (at.kind !== 'split') return null;
    const next = at.parts[i];
    if (!next) return null;
    at = next;
  }
  return at;
}

function replaceAt(root: FrontSection, path: SectionPath, make: (s: FrontSection) => FrontSection): FrontSection {
  if (path.length === 0) return make(root);
  if (root.kind !== 'split') return root;
  const [i, ...rest] = path;
  return { ...root, parts: root.parts.map((p, k) => (k === i ? replaceAt(p, rest, make) : p)) };
}

const MAX_PARTS = 12;
const MAX_COUNT = 40;

/**
 * Does one action on the section at `path`. Splitting a part of a split that runs the same way
 * adds a part beside it; otherwise the section becomes two equal parts. Removing a part gives its
 * space to the rest; a split left with one part becomes that part.
 */
export function editSection(root: FrontSection, path: SectionPath, action: SectionAction): Result<FrontSection> {
  const sec = sectionAt(root, path);
  if (!sec) return { ok: false, reason: 'That section is no longer there. Pick it again.' };
  const leaf = (fn: (s: Exclude<FrontSection, { kind: 'split' }>) => Result<FrontSection>): Result<FrontSection> =>
    sec.kind === 'split' ? { ok: false, reason: 'Pick one part of the cabinet first.' } : fn(sec);
  const done = (next: FrontSection): Result<FrontSection> => ({ ok: true, value: replaceAt(root, path, () => next) });
  switch (action) {
    case 'split_vertical':
    case 'split_horizontal': {
      const direction = action === 'split_vertical' ? 'vertical' : 'horizontal';
      const parentPath = path.slice(0, -1);
      const parent = path.length ? sectionAt(root, parentPath) : null;
      if (parent?.kind === 'split' && parent.direction === direction) {
        if (parent.parts.length >= MAX_PARTS) return { ok: false, reason: `A section can be split into ${MAX_PARTS} parts at most.` };
        const i = path[path.length - 1]!;
        const copy = { ...sec, size: null } as FrontSection;
        const parts = [...parent.parts.slice(0, i + 1).map((p, k) => (k === i ? ({ ...p, size: null } as FrontSection) : p)), copy, ...parent.parts.slice(i + 1)];
        return { ok: true, value: replaceAt(root, parentPath, () => ({ ...parent, parts })) };
      }
      const half = { ...sec, size: null } as FrontSection;
      return done({ kind: 'split', direction, size: sec.size, parts: [half, half] });
    }
    case 'remove': {
      if (path.length === 0) return { ok: false, reason: 'The whole cabinet can’t be removed here. Pick a part of it.' };
      const parentPath = path.slice(0, -1);
      const parent = sectionAt(root, parentPath);
      if (parent?.kind !== 'split') return { ok: false, reason: 'That section is no longer there. Pick it again.' };
      const parts = parent.parts.filter((_, k) => k !== path[path.length - 1]).map((p) => ({ ...p, size: null }) as FrontSection);
      const next: FrontSection = parts.length === 1 ? ({ ...parts[0]!, size: parent.size } as FrontSection) : { ...parent, parts };
      return { ok: true, value: replaceAt(root, parentPath, () => next) };
    }
    case 'add_shelf':
    case 'remove_shelf':
      return leaf((s) => {
        if (s.kind === 'drawers') return { ok: false, reason: 'Drawers have no shelves. Make this part doors or open first.' };
        const shelves = s.shelves + (action === 'add_shelf' ? 1 : -1);
        if (shelves < 0) return { ok: false, reason: 'There are no shelves to take out.' };
        if (shelves > MAX_COUNT) return { ok: false, reason: 'That is as many shelves as a section can have.' };
        return done({ ...s, shelves });
      });
    case 'drawers':
      return leaf((s) => (s.kind === 'drawers' ? { ok: true, value: root } : done({ kind: 'drawers', count: 3, size: s.size })));
    case 'add_drawer':
    case 'remove_drawer':
      return leaf((s) => {
        if (s.kind !== 'drawers') return { ok: false, reason: 'Make this part drawers first.' };
        const count = s.count + (action === 'add_drawer' ? 1 : -1);
        if (count < 1) return { ok: false, reason: 'A drawer section has at least one drawer. Make it doors or open instead.' };
        if (count > MAX_COUNT) return { ok: false, reason: 'That is as many drawers as a section can have.' };
        return done({ ...s, count });
      });
    case 'add_rollout':
    case 'remove_rollout':
      return leaf((s) => {
        if (s.kind !== 'doors') return { ok: false, reason: 'Roll-outs go behind doors. Make this part doors first.' };
        const rollouts = s.rollouts + (action === 'add_rollout' ? 1 : -1);
        if (rollouts < 0) return { ok: false, reason: 'There are no roll-outs to take out.' };
        if (rollouts > MAX_COUNT) return { ok: false, reason: 'That is as many roll-outs as a section can have.' };
        return done({ ...s, rollouts });
      });
    case 'doors':
      return leaf((s) => (s.kind === 'doors' ? { ok: true, value: root } : done({ kind: 'doors', shelves: s.kind === 'open' ? s.shelves : 0, rollouts: 0, size: s.size })));
    case 'open':
      return leaf((s) => (s.kind === 'open' ? { ok: true, value: root } : done({ kind: 'open', shelves: s.kind === 'doors' ? s.shelves : 0, size: s.size })));
  }
}

/** Each section's box on the face (x0..x1, y0..y1 in the face's own units, y up), for drawing and picking. */
export function sectionBoxes(root: FrontSection, x0: number, x1: number, y0: number, y1: number): { path: number[]; section: FrontSection; x0: number; x1: number; y0: number; y1: number }[] {
  const out: { path: number[]; section: FrontSection; x0: number; x1: number; y0: number; y1: number }[] = [];
  const walk = (s: FrontSection, path: number[], a: number, b: number, c: number, d: number) => {
    out.push({ path, section: s, x0: a, x1: b, y0: c, y1: d });
    if (s.kind !== 'split') return;
    const lengths = partLengths(s.parts, s.direction === 'vertical' ? b - a : d - c);
    let at = s.direction === 'vertical' ? a : d;
    s.parts.forEach((p, k) => {
      const len = lengths[k]!;
      if (s.direction === 'vertical') walk(p, [...path, k], at, at + len, c, d);
      else walk(p, [...path, k], a, b, at - len, at);
      at += s.direction === 'vertical' ? len : -len;
    });
  };
  walk(root, [], x0, x1, y0, y1);
  return out;
}
