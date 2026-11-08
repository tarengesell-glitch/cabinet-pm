/**
 * Design-rule checks (BUILD_SPEC section 7, layer "design_rules"), for the confirmed rules that
 * can be checked against what the master copy holds today: walls, openings, cabinet runs,
 * islands and appliance placements. The rest wait for placed cabinets (step 1b-items) or other
 * data; the README lists them.
 *
 * What a broken rule does comes from its `design_tool` setting (owner, 2026-11-07/08):
 * `error` → severity block, `suggestion` → warn (the running list of design preferences that
 * could be improved). Every length comes from design-rules.json. Building the checks fails
 * loudly if a rule is missing, not confirmed, set to something else, or lacks a length.
 */
import { z } from 'zod';
import {
  formatInches,
  formatInchesApprox,
  wallLetter,
  type Check,
  type Issue,
  type Job,
  type Length,
  type Result,
  type Room,
  type Run,
  type Severity,
  type Wall,
} from '@/core/index';
import { DESIGN_RULES, type DesignRule, type DesignRules } from './design-rules';
import rawSettings from '../data/design-rule-checks.json';

/** The confirmed rules this file checks, by ID. */
export const CHECKED_RULE_IDS = ['HARD-014', 'PREF-011', 'PREF-023'] as const;
export type CheckedRuleId = (typeof CHECKED_RULE_IDS)[number];

/** The check ID for a rule: `design_rules.<rule ID>`, so the rule can always be traced. */
export const designRuleCheckId = (ruleId: string): string => `design_rules.${ruleId}`;

const SettingsSchema = z.strictObject({
  source: z.string().min(1),
  sink_kinds: z.strictObject({ value: z.array(z.string().min(1)).min(1), source: z.string().min(1) }),
});
export type DesignRuleCheckSettings = z.infer<typeof SettingsSchema>;

/** Reads and checks data/design-rule-checks.json. */
export function readCheckSettings(data: unknown): Result<DesignRuleCheckSettings> {
  const parsed = SettingsSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: `design-rule-checks.json is not in the right shape: ${parsed.error.message}` };
  return { ok: true, value: parsed.data };
}

const SEVERITY: Readonly<Record<'error' | 'suggestion', Severity>> = { error: 'block', suggestion: 'warn' };

// ---------- names, for messages ----------

const RUN_LABEL: Readonly<Record<Run['kind'], string>> = {
  base: 'base',
  upper: 'upper',
  base_upper: 'base + upper',
  base_upper_pantry: 'base, upper + pantry',
  pantry: 'all pantry',
};

const runName = (room: Room, w: number, i: number): string => {
  const wall = room.walls[w] as Wall;
  const run = wall.runs[i] as Run;
  const where = wall.kind === 'floating' ? `the island on wall ${wallLetter(w)}` : `wall ${wallLetter(w)}`;
  return `cabinet run ${i + 1} (${RUN_LABEL[run.kind]}) on ${where}`;
};

const lengthText = (v: number): string => (Number.isInteger(v) ? formatInches(v) : formatInchesApprox(Math.round(v)));

const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number): number => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

// ---------- HARD-014: known site conditions (pantry in front of a window) ----------

function pantryInFrontOfWindow(rule: DesignRule, severity: Severity): Check {
  return {
    id: designRuleCheckId(rule.id),
    layer: 'design_rules',
    description: `${rule.id}: ${rule.title} (no all-pantry run stands in front of a window)`,
    run(job: Job): readonly Issue[] {
      const issues: Issue[] = [];
      for (const room of job.rooms) {
        room.walls.forEach((wall, w) => {
          const windows = wall.openings.filter((o) => o.kind === 'window');
          wall.runs.forEach((run, i) => {
            if (run.kind !== 'pantry') return;
            for (const win of windows) {
              const by = overlap(run.offset, run.offset + run.length, win.offset.value, win.offset.value + win.width.value);
              if (by === 0) continue;
              issues.push({
                check_id: this.id,
                severity,
                message:
                  `${rule.id} (${rule.title}): ${runName(room, w, i)} in "${room.name}" stands ${formatInches(by)} in front of a window. ` +
                  'Tall pantry cabinets would cover the window. Make that stretch base cabinets, or move the pantry.',
                ref: { kind: 'run', id: run.run_id },
              });
            }
          });
        });
      }
      return issues;
    },
  };
}

// ---------- PREF-023: a sink in front of a window is centred under it ----------

function sinkCentredUnderWindow(rule: DesignRule, severity: Severity, sinkKinds: readonly string[]): Check {
  return {
    id: designRuleCheckId(rule.id),
    layer: 'design_rules',
    description: `${rule.id}: ${rule.title} (a sink in front of a window is centred under it)`,
    run(job: Job): readonly Issue[] {
      const issues: Issue[] = [];
      for (const room of job.rooms) {
        room.walls.forEach((wall, w) => {
          const windows = wall.openings.filter((o) => o.kind === 'window');
          wall.appliances.forEach((a, i) => {
            if (!sinkKinds.includes(a.kind)) return;
            const end = a.offset + a.width.value;
            const inFront = windows.filter((o) => overlap(a.offset, end, o.offset.value, o.offset.value + o.width.value) > 0);
            if (inFront.length === 0) return;
            // Twice the distance between centres, so it stays a whole number of 1/64".
            const twiceOff = Math.min(...inFront.map((o) => Math.abs(a.offset + end - (2 * o.offset.value + o.width.value))));
            if (twiceOff === 0) return;
            issues.push({
              check_id: this.id,
              severity,
              message:
                `${rule.id} (${rule.title}): appliance ${i + 1} (${a.kind}) on wall ${wallLetter(w)} in "${room.name}" stands in front of a window ` +
                `but is ${lengthText(twiceOff / 2)} off centre. Centre it under the window if the plumbing and cabinets allow.`,
              ref: { kind: 'appliance', id: a.placement_id },
            });
          });
        });
      }
      return issues;
    },
  };
}

// ---------- PREF-011: walkways between facing cabinet runs ----------

/**
 * Which side of a room wall is inside: the same reading as the room drawing (the outline's
 * winding; floating walls are not part of it). Kept here because modules may not import the
 * designer; Core should own it one day.
 */
function insideIsLeft(room: Room): boolean {
  const outline = room.walls.filter((w) => w.kind !== 'floating');
  let twice = 0;
  for (const w of outline) twice += w.start_point.x * w.end_point.y - w.end_point.x * w.start_point.y;
  const first = outline[0];
  const last = outline[outline.length - 1];
  if (first && last) twice += last.end_point.x * first.start_point.y - first.start_point.x * last.end_point.y;
  return !(twice < 0);
}

/** A straight face that looks into the room: a run's front, or a bare room wall's inside face. */
interface Face {
  /** The run it is the front of, or null for a wall's face (which only hides what is behind it). */
  readonly run: { readonly id: string; readonly name: string } | null;
  readonly wall: Wall;
  /** A point on the face where the wall's offset 0 is. */
  readonly ox: number;
  readonly oy: number;
  /** Along the wall (unit), and out of the face into the room (unit). */
  readonly ux: number;
  readonly uy: number;
  readonly nx: number;
  readonly ny: number;
  /** The stretch along the wall the face covers. */
  readonly from: number;
  readonly to: number;
}

function facesOf(room: Room): Face[] {
  const left = insideIsLeft(room);
  const faces: Face[] = [];
  room.walls.forEach((wall, w) => {
    const dx = wall.end_point.x - wall.start_point.x;
    const dy = wall.end_point.y - wall.start_point.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return; // A zero-length wall is Core's layout.wall-zero-length block.
    const ux = dx / len;
    const uy = dy / len;
    const face = (run: Face['run'], out: 1 | -1, distance: number, from: number, to: number): Face => {
      const nx = -uy * out;
      const ny = ux * out;
      return { run, wall, ox: wall.start_point.x + nx * distance, oy: wall.start_point.y + ny * distance, ux, uy, nx, ny, from, to };
    };
    if (wall.kind === 'room') {
      const out = left ? 1 : -1;
      const half = (wall.thickness?.value ?? 0) / 2;
      faces.push(face(null, out, half, 0, len));
      wall.runs.forEach((run, i) => {
        if (run.kind === 'upper') return; // Uppers hang over the floor; they don't narrow a walkway.
        faces.push(face({ id: run.run_id, name: runName(room, w, i) }, out, half + run.depth, run.offset, run.offset + run.length));
      });
    } else {
      wall.runs.forEach((run, i) => {
        if (run.kind === 'upper') return;
        const name = runName(room, w, i);
        for (const out of [1, -1] as const) faces.push(face({ id: run.run_id, name }, out, run.depth / 2, run.offset, run.offset + run.length));
      });
    }
  });
  return faces;
}

/** True when two walls run exactly parallel (compared in whole numbers). */
const parallel = (a: Wall, b: Wall): boolean =>
  BigInt(a.end_point.x - a.start_point.x) * BigInt(b.end_point.y - b.start_point.y) -
    BigInt(a.end_point.y - a.start_point.y) * BigInt(b.end_point.x - b.start_point.x) ===
  0n;

interface Walkway {
  readonly a: NonNullable<Face['run']>;
  readonly b: NonNullable<Face['run']>;
  readonly width: number;
}

/**
 * The clear floor between run fronts that face each other squarely: from each run front, the
 * nearest face straight across. A nearer run or wall hides what is behind it, along the stretch
 * it covers. Measured from run fronts (countertops are not in the master copy yet).
 */
function walkways(room: Room): Walkway[] {
  const faces = facesOf(room);
  const found = new Map<string, Walkway>();
  for (const a of faces) {
    const own = a.run;
    if (!own) continue;
    const across = faces
      .filter((f) => f !== a && f.run?.id !== own.id && parallel(a.wall, f.wall) && a.nx * f.nx + a.ny * f.ny < 0)
      .map((f) => {
        const width = (f.ox - a.ox) * a.nx + (f.oy - a.oy) * a.ny;
        // Where f's stretch lands along a's wall.
        const shift = (f.ox - a.ox) * a.ux + (f.oy - a.oy) * a.uy;
        const dir = f.ux * a.ux + f.uy * a.uy;
        const p = shift + f.from * dir;
        const q = shift + f.to * dir;
        return { f, width, from: Math.max(a.from, Math.min(p, q)), to: Math.min(a.to, Math.max(p, q)) };
      })
      .filter((c) => c.width > 0 && c.to > c.from)
      .sort((x, y) => x.width - y.width);
    let open: { from: number; to: number }[] = [{ from: a.from, to: a.to }];
    for (const c of across) {
      const seen = open.some((s) => overlap(s.from, s.to, c.from, c.to) > 0);
      open = open.flatMap((s) => [
        ...(c.from > s.from ? [{ from: s.from, to: Math.min(s.to, c.from) }] : []),
        ...(c.to < s.to ? [{ from: Math.max(s.from, c.to), to: s.to }] : []),
      ]).filter((s) => s.to > s.from);
      if (!seen || !c.f.run) continue;
      const key = [own.id, c.f.run.id].sort().join('|');
      const earlier = found.get(key);
      if (!earlier || c.width < earlier.width) found.set(key, { a: own, b: c.f.run, width: c.width });
    }
  }
  return [...found.values()];
}

function walkwayWidths(rule: DesignRule, severity: Severity, limits: { strongMin: Length; preferredMin: Length; preferredMax: Length }): Check {
  const band = `${formatInches(limits.preferredMin)} to ${formatInches(limits.preferredMax)} is preferred`;
  return {
    id: designRuleCheckId(rule.id),
    layer: 'design_rules',
    description: `${rule.id}: ${rule.title} (between cabinet runs that face each other)`,
    run(job: Job): readonly Issue[] {
      const issues: Issue[] = [];
      for (const room of job.rooms) {
        for (const way of walkways(room)) {
          let why: string | null = null;
          if (way.width < limits.strongMin) why = `under the ${formatInches(limits.strongMin)} minimum`;
          else if (way.width < limits.preferredMin) why = `narrower than preferred`;
          else if (way.width > limits.preferredMax) why = `over the ${formatInches(limits.preferredMax)} maximum`;
          if (!why) continue;
          issues.push({
            check_id: this.id,
            severity,
            message:
              `${rule.id} (${rule.title}): the walkway between ${way.a.name} and ${way.b.name} in "${room.name}" is ` +
              `${lengthText(way.width)} wide, ${why}; ${band}.`,
            ref: { kind: 'run', id: way.a.id },
          });
        }
      }
      return issues;
    },
  };
}

// ---------- building the checks from the rules ----------

/**
 * Builds the design-rule checks from the rules and settings. Refuses (with every reason) if a
 * checked rule is missing, not confirmed, not an error or suggestion, or lacks a length.
 */
export function buildDesignRuleChecks(rules: DesignRules, settings: DesignRuleCheckSettings): Result<readonly Check[]> {
  const problems: string[] = [];
  const pick = (id: CheckedRuleId): { rule: DesignRule; severity: Severity } | null => {
    const rule = rules.rules.find((r) => r.id === id);
    if (!rule) {
      problems.push(`rule ${id} is not in the design rules`);
      return null;
    }
    if (rule.status !== 'confirmed') {
      problems.push(`rule ${id} is "${rule.status}", not confirmed`);
      return null;
    }
    if (rule.designTool !== 'error' && rule.designTool !== 'suggestion') {
      problems.push(`rule ${id} is set to "${rule.designTool ?? 'nothing'}" in the design tool, so it is not a check`);
      return null;
    }
    return { rule, severity: SEVERITY[rule.designTool] };
  };
  const single = (rule: DesignRule, name: string): Length | null => {
    const v = rule.lengths[name];
    if (typeof v !== 'number') {
      problems.push(`rule ${rule.id} has no single length "${name}"`);
      return null;
    }
    return v;
  };

  const checks: Check[] = [];
  const site = pick('HARD-014');
  if (site) checks.push(pantryInFrontOfWindow(site.rule, site.severity));
  const walk = pick('PREF-011');
  if (walk) {
    const strongMin = single(walk.rule, 'strong_min');
    const preferredMin = single(walk.rule, 'preferred_min');
    const preferredMax = single(walk.rule, 'preferred_max');
    if (strongMin !== null && preferredMin !== null && preferredMax !== null) {
      if (!(strongMin <= preferredMin && preferredMin <= preferredMax)) problems.push(`rule ${walk.rule.id}'s walkway lengths are out of order`);
      else checks.push(walkwayWidths(walk.rule, walk.severity, { strongMin, preferredMin, preferredMax }));
    }
  }
  const sink = pick('PREF-023');
  if (sink) checks.push(sinkCentredUnderWindow(sink.rule, sink.severity, settings.sink_kinds.value));

  if (problems.length > 0) return { ok: false, reason: `The design-rule checks can't be built: ${problems.join('; ')}.` };
  return { ok: true, value: checks };
}

/** The settings file, checked when the module loads. */
export const DESIGN_RULE_CHECK_SETTINGS: DesignRuleCheckSettings = (() => {
  const r = readCheckSettings(rawSettings);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
})();

/**
 * The design-rule checks for the rules confirmed today, built when the module loads. A bad rule
 * or settings file stops the app with the reason (as DESIGN_RULES does).
 */
export const DESIGN_RULE_CHECKS: readonly Check[] = (() => {
  const r = buildDesignRuleChecks(DESIGN_RULES, DESIGN_RULE_CHECK_SETTINGS);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
})();
