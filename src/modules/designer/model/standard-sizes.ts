/**
 * Standard sizes for new walls and openings: data with a recorded source (rule 6),
 * in data/standard-sizes.json. Every value starts as "rough" when used.
 * A bad data file fails loudly when the app starts; it is never filled in.
 */
import { z } from 'zod';
import { parseImperial, type Length } from '@/core/index';
import raw from '../data/standard-sizes.json';

const Size = z.string().min(1);
const OpeningSizes = z.strictObject({ width: Size, height: Size, sill_height: Size });
const FileSchema = z.strictObject({
  source: z.string().min(1),
  wall_thickness: Size,
  openings: z.strictObject({ door: OpeningSizes, window: OpeningSizes, passthrough: OpeningSizes }),
  door_swing: z.strictObject({ hinge: z.enum(['start', 'end']), opens: z.enum(['inside', 'outside']), source: z.string().min(1) }),
});

export interface OpeningStandard {
  readonly width: Length;
  readonly height: Length;
  readonly sill_height: Length;
}

export interface StandardSizes {
  readonly source: string;
  /** How a new door hangs: hinge end, and whether it swings into or out of the room. */
  readonly door_swing: { readonly hinge: 'start' | 'end'; readonly opens: 'inside' | 'outside' };
  readonly wall_thickness: Length;
  readonly openings: Readonly<Record<'door' | 'window' | 'passthrough', OpeningStandard>>;
}

/** Reads and checks the standard sizes. Returns every problem, not just the first. */
export function readStandardSizes(data: unknown): { ok: true; value: StandardSizes } | { ok: false; reason: string } {
  const parsed = FileSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: `standard-sizes.json is not in the right shape: ${parsed.error.message}` };
  const problems: string[] = [];
  const length = (where: string, text: string): Length => {
    const r = parseImperial(text);
    if (!r.ok) problems.push(`${where}: ${r.reason}`);
    return r.ok ? r.value : 0;
  };
  const opening = (kind: string, o: z.infer<typeof OpeningSizes>): OpeningStandard => ({
    width: length(`${kind} width`, o.width),
    height: length(`${kind} height`, o.height),
    sill_height: length(`${kind} sill height`, o.sill_height),
  });
  const value: StandardSizes = {
    source: parsed.data.source,
    door_swing: { hinge: parsed.data.door_swing.hinge, opens: parsed.data.door_swing.opens },
    wall_thickness: length('wall thickness', parsed.data.wall_thickness),
    openings: {
      door: opening('door', parsed.data.openings.door),
      window: opening('window', parsed.data.openings.window),
      passthrough: opening('passthrough', parsed.data.openings.passthrough),
    },
  };
  if (problems.length > 0) return { ok: false, reason: `standard-sizes.json has bad sizes: ${problems.join('; ')}` };
  return { ok: true, value };
}

const read = readStandardSizes(raw);
if (!read.ok) throw new Error(read.reason);

export const STANDARD_SIZES: StandardSizes = read.value;
