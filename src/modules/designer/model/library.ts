/**
 * The library choices Customize offers for a cabinet (owner, 2026-11-13: the twelve base options,
 * each a catalog cabinet with its front and interior set) and the drawer inserts, read from
 * `data/library-presets.json` and `data/drawer-inserts.json`. A bad file fails loudly at start-up.
 */
import { z } from 'zod';
import { FrontSectionSchema, parseImperial, type FrontSection, type Result } from '@/core/index';
import { CURRENT_CATALOG } from '@/modules/catalog/contract';
import presets from '../data/library-presets.json';
import inserts from '../data/drawer-inserts.json';

export interface LibraryPreset {
  readonly id: string;
  readonly name: string;
  readonly note: string | null;
  /** The catalog cabinet. */
  readonly code: string;
  /** Its front and interior; null: as the catalog cabinet shows it. */
  readonly sections: FrontSection | null;
}

export interface DrawerInsert {
  readonly code: string;
  readonly name: string;
  /** The letter shown on the drawer in the face picture. */
  readonly mark: string;
}

const Preset = z.strictObject({ id: z.string().min(1), name: z.string().min(1), note: z.string().min(1).optional(), code: z.string().min(1), sections: z.unknown() });
const PresetFile = z.strictObject({ source: z.string().min(1), mapping_note: z.string().min(1), kinds: z.record(z.string(), z.array(Preset).min(1)) });
const InsertFile = z.strictObject({ source: z.string().min(1), note: z.string().min(1), inserts: z.array(z.strictObject({ code: z.string().min(1), name: z.string().min(1), mark: z.string().min(1).max(2) })).min(1) });

/** Sizes in the data are written as inches ("6 13/16"); the master copy keeps 1/64". */
function withSizes(v: unknown, where: string): unknown {
  if (Array.isArray(v)) return v.map((x) => withSizes(x, where));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === 'size' && typeof x === 'string') {
        const r = parseImperial(x);
        if (!r.ok) throw new Error(`${where}: ${r.reason}`);
        out[k] = r.value;
      } else out[k] = withSizes(x, where);
    }
    return out;
  }
  return v;
}

function read(): Result<{ presets: Readonly<Record<string, readonly LibraryPreset[]>>; inserts: readonly DrawerInsert[] }> {
  const p = PresetFile.safeParse(presets);
  if (!p.success) return { ok: false, reason: `library-presets.json can't be used: ${p.error.issues[0]?.message ?? 'bad file'}` };
  const out: Record<string, LibraryPreset[]> = {};
  for (const [kind, list] of Object.entries(p.data.kinds)) {
    out[kind] = [];
    for (const x of list) {
      const item = CURRENT_CATALOG.items.find((i) => i.code === x.code);
      if (!item) return { ok: false, reason: `library-presets.json: "${x.name}" names a cabinet the catalog doesn't have (${x.code}).` };
      if (item.type !== kind) return { ok: false, reason: `library-presets.json: "${x.name}" is listed under ${kind} but ${x.code} is a ${item.type}.` };
      let sections: FrontSection | null = null;
      if (x.sections !== null) {
        const s = FrontSectionSchema.safeParse(withSizes(x.sections, `library-presets.json "${x.name}"`));
        if (!s.success) return { ok: false, reason: `library-presets.json: "${x.name}" has sections that aren't valid: ${s.error.issues[0]?.message ?? ''}` };
        sections = s.data;
      }
      out[kind].push({ id: x.id, name: x.name, note: x.note ?? null, code: x.code, sections });
    }
    if (new Set(out[kind].map((x) => x.id)).size !== out[kind].length) return { ok: false, reason: `library-presets.json: an option under ${kind} is listed twice.` };
  }
  const i = InsertFile.safeParse(inserts);
  if (!i.success) return { ok: false, reason: `drawer-inserts.json can't be used: ${i.error.issues[0]?.message ?? 'bad file'}` };
  return { ok: true, value: { presets: out, inserts: i.data.inserts } };
}

const READ = read();
if (!READ.ok) throw new Error(READ.reason);
const LIBRARY = READ.value;

/** The library choices for a catalog type (base…); empty when the catalog's own list is offered. */
export const presetsFor = (type: string): readonly LibraryPreset[] => LIBRARY.presets[type] ?? [];
export const DRAWER_INSERTS: readonly DrawerInsert[] = LIBRARY.inserts;

/** True when a cabinet is as this preset sets it: the same catalog cabinet and the same front and interior. */
export function isPreset(p: LibraryPreset, code: string | null, sections: FrontSection | null): boolean {
  return p.code === code && JSON.stringify(p.sections) === JSON.stringify(sections);
}
