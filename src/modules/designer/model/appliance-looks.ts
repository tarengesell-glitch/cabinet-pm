/**
 * How a sink, dishwasher or fridge can look (owner, 2026-11-12), read from
 * `data/appliance-looks.json`. A choice is saved on the appliance in the master copy
 * (`AppliancePlacement.selections`); the 3D view draws it. A bad file fails loudly at start-up.
 */
import { z } from 'zod';
import type { AppliancePlacement, Result } from '@/core/index';
import data from '../data/appliance-looks.json';

const Value = z.strictObject({
  code: z.string().min(1),
  name: z.string().min(1),
  hex: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  split: z.array(z.number().int().positive()).min(1).optional(),
});
const Option = z.strictObject({ code: z.string().min(1), name: z.string().min(1), values: z.array(Value).min(2) });
const File = z.strictObject({ source: z.string().min(1), visual_note: z.string().min(1), kinds: z.record(z.string(), z.array(Option).min(1)) });

export type LookValue = z.infer<typeof Value>;
export type LookOption = z.infer<typeof Option>;

function read(): Result<Readonly<Record<string, readonly LookOption[]>>> {
  const r = File.safeParse(data);
  if (!r.success) return { ok: false, reason: `appliance-looks.json can't be used: ${r.error.issues[0]?.message ?? 'bad file'}` };
  for (const [kind, options] of Object.entries(r.data.kinds)) {
    const codes = new Set(options.map((o) => o.code));
    if (codes.size !== options.length) return { ok: false, reason: `appliance-looks.json: an option for ${kind} is listed twice.` };
    for (const o of options) if (new Set(o.values.map((v) => v.code)).size !== o.values.length) return { ok: false, reason: `appliance-looks.json: ${kind} ${o.name} lists a value twice.` };
  }
  return { ok: true, value: r.data.kinds };
}

const LOOKS = read();
if (!LOOKS.ok) throw new Error(LOOKS.reason);
const KINDS = LOOKS.value;

/** The look options for an appliance kind; empty when it has none. */
export const lookOptions = (kind: string): readonly LookOption[] => KINDS[kind] ?? [];

/** The chosen value of one look option on an appliance, or null when not chosen (or no longer offered). */
export function chosenLook(a: Pick<AppliancePlacement, 'kind' | 'selections'>, option: string): LookValue | null {
  const code = a.selections?.[option];
  if (!code) return null;
  return lookOptions(a.kind).find((o) => o.code === option)?.values.find((v) => v.code === code) ?? null;
}

/** Checks a choice against the list: the reason when it isn't one of the options, else null. */
export function lookProblem(kind: string, option: string, value: string): string | null {
  const o = lookOptions(kind).find((x) => x.code === option);
  if (!o) return `A ${kind.replace(/_/g, ' ')} has no "${option}" choice.`;
  return o.values.some((v) => v.code === value) ? null : `"${value}" isn't one of the ${o.name.toLowerCase()} choices.`;
}
