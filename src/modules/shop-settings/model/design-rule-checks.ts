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
  RunKindSchema,
} from '@/core/index';
import { DESIGN_RULES, type DesignRule, type DesignRules } from './design-rules';
import rawSettings from '../data/design-rule-checks.json';

/** The confirmed rules this file checks, by ID. */
export const CHECKED_RULE_IDS = ['HARD-014', 'PREF-011', 'PREF-012', 'PREF-013', 'PREF-023'] as const;
export type CheckedRuleId = (typeof CHECKED_RULE_IDS)[number];

/** The check ID for a rule: `design_rules.<rule ID>`, so the rule can always be traced. */
export const designRuleCheckId = (ruleId: string): string => `design_rules.${ruleId}`;

const Codes = z.strictObject({ value: z.array(z.string().min(1)).min(1), source: z.string().min(1) });
const SettingsSchema = z.strictObject({
  source: z.string().min(1),
  sink_kinds: Codes,
  back_wall_range_kinds: Codes,
  countertop_run_kinds: z.strictObject({ value: z.array(RunKindSchema).min(1), source: z.string().min(1) }),
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

/** What a face belongs to: a cabinet run's front, or a bare stretch of a room wall. */
interface FaceOwner {
  readonly kind: 'run' | 'wall';
  readonly id: string;
  readonly name: string;
}

/** A straight face that looks into the room: a run's front (countertop edge) or a room wall's inside face. */
interface Face {
  readonly owner: FaceOwner;
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

/** A wall's start point and unit direction; null for a zero-length wall (Core's layout.wall-zero-length block). */
function axis(wall: Wall): { readonly x: number; readonly y: number; readonly ux: number; readonly uy: number; readonly len: number } | null {
  const dx = wall.end_point.x - wall.start_point.x;
  const dy = wall.end_point.y - wall.start_point.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? null : { x: wall.start_point.x, y: wall.start_point.y, ux: dx / len, uy: dy / len, len };
}

/**
 * Every face in the room. A run's face is its front plus the countertop overhang when the run
 * has a countertop (owner, 2026-11-09: walkways are measured from the countertop edge).
 */
function facesOf(room: Room, overhang: Length, countertopKinds: readonly string[]): Face[] {
  const left = insideIsLeft(room);
  const faces: Face[] = [];
  room.walls.forEach((wall, w) => {
    const a = axis(wall);
    if (!a) return;
    const face = (owner: FaceOwner, out: 1 | -1, distance: number, from: number, to: number): Face => {
      const nx = -a.uy * out;
      const ny = a.ux * out;
      return { owner, wall, ox: a.x + nx * distance, oy: a.y + ny * distance, ux: a.ux, uy: a.uy, nx, ny, from, to };
    };
    const edge = (run: Run): number => (countertopKinds.includes(run.kind) ? overhang : 0);
    if (wall.kind === 'room') {
      const out = left ? 1 : -1;
      const half = (wall.thickness?.value ?? 0) / 2;
      faces.push(face({ kind: 'wall', id: wall.wall_id, name: `wall ${wallLetter(w)}` }, out, half, 0, a.len));
      wall.runs.forEach((run, i) => {
        if (run.kind === 'upper') return; // Uppers hang over the floor; they don't narrow a walkway.
        faces.push(face({ kind: 'run', id: run.run_id, name: runName(room, w, i) }, out, half + run.depth + edge(run), run.offset, run.offset + run.length));
      });
    } else {
      wall.runs.forEach((run, i) => {
        if (run.kind === 'upper') return;
        const owner: FaceOwner = { kind: 'run', id: run.run_id, name: runName(room, w, i) };
        for (const out of [1, -1] as const) faces.push(face(owner, out, run.depth / 2 + edge(run), run.offset, run.offset + run.length));
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
  readonly a: FaceOwner;
  /** A run, or a bare room wall (only the minimums apply to a bare wall, owner 2026-11-09). */
  readonly b: FaceOwner;
  readonly width: number;
}

/**
 * The clear floor in front of each run, to the nearest face straight across (another run's
 * countertop edge or front, or a bare wall). A nearer face hides what is behind it, along the
 * stretch it covers. Only faces that are exactly parallel count.
 */
function walkways(room: Room, overhang: Length, countertopKinds: readonly string[]): Walkway[] {
  const faces = facesOf(room, overhang, countertopKinds);
  const found = new Map<string, Walkway>();
  for (const a of faces) {
    if (a.owner.kind !== 'run') continue;
    const own = a.owner;
    const across = faces
      .filter((f) => f !== a && f.owner.id !== own.id && parallel(a.wall, f.wall) && a.nx * f.nx + a.ny * f.ny < 0)
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
      open = open
        .flatMap((s) => [
          ...(c.from > s.from ? [{ from: s.from, to: Math.min(s.to, c.from) }] : []),
          ...(c.to < s.to ? [{ from: Math.max(s.from, c.to), to: s.to }] : []),
        ])
        .filter((s) => s.to > s.from);
      if (!seen) continue;
      const key = [own.id, c.f.owner.id].sort().join('|');
      const earlier = found.get(key);
      if (!earlier || c.width < earlier.width) found.set(key, { a: own, b: c.f.owner, width: c.width });
    }
  }
  return [...found.values()];
}

interface WalkwayLimits {
  readonly strongMin: Length;
  readonly preferredMin: Length;
  readonly preferredMax: Length;
  readonly overhang: Length;
  readonly overhangRule: string;
  readonly countertopKinds: readonly string[];
}

function walkwayWidths(rule: DesignRule, severity: Severity, limits: WalkwayLimits): Check {
  const band = `${formatInches(limits.preferredMin)} to ${formatInches(limits.preferredMax)} is preferred`;
  return {
    id: designRuleCheckId(rule.id),
    layer: 'design_rules',
    description: `${rule.id}: ${rule.title} (from the countertop edge, to facing cabinets or a bare wall)`,
    run(job: Job): readonly Issue[] {
      const issues: Issue[] = [];
      for (const room of job.rooms) {
        for (const way of walkways(room, limits.overhang, limits.countertopKinds)) {
          let why: string | null = null;
          if (way.width < limits.strongMin) why = `under the ${formatInches(limits.strongMin)} minimum`;
          else if (way.width < limits.preferredMin) why = `narrower than preferred`;
          else if (way.b.kind === 'run' && way.width > limits.preferredMax) why = `over the ${formatInches(limits.preferredMax)} maximum`;
          if (!why) continue;
          const other = way.b.kind === 'run' ? way.b.name : `bare ${way.b.name}`;
          issues.push({
            check_id: this.id,
            severity,
            message:
              `${rule.id} (${rule.title}): the walkway between ${way.a.name} and ${other} in "${room.name}" is ` +
              `${lengthText(way.width)} wide, ${why}; ${band}. Measured from the countertop edge ` +
              `(${formatInches(limits.overhang)} past the cabinet fronts, ${limits.overhangRule}).`,
            ref: { kind: 'run', id: way.a.id },
          });
        }
      }
      return issues;
    },
  };
}

// ---------- PREF-012: an island's end close to a wall run's end lines up with it ----------

/** Runs on a wall that touch count as one stretch of cabinetry: its ends are the ones that show. */
function stretchEnds(wall: Wall): number[] {
  const spans = wall.runs.map((r) => [r.offset, r.offset + r.length] as [number, number]).sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged.flat();
}

/** Where a point on `wall` (at `along` from its start) lands along `island`'s line, from the island's start. */
function along(island: NonNullable<ReturnType<typeof axis>>, wall: NonNullable<ReturnType<typeof axis>>, at: number): number {
  return (wall.x + wall.ux * at - island.x) * island.ux + (wall.y + wall.uy * at - island.y) * island.uy;
}

function islandsLineUp(rule: DesignRule, severity: Severity, within: Length): Check {
  return {
    id: designRuleCheckId(rule.id),
    layer: 'design_rules',
    description: `${rule.id}: ${rule.title} (an island end within ${formatInches(within)} of a wall run's end lines up with it)`,
    run(job: Job): readonly Issue[] {
      const issues: Issue[] = [];
      for (const room of job.rooms) {
        room.walls.forEach((island, k) => {
          const ia = axis(island);
          if (island.kind !== 'floating' || island.runs.length === 0 || !ia) return;
          const islandEnds = stretchEnds(island);
          room.walls.forEach((wall, w) => {
            const wa = axis(wall);
            if (wall.kind !== 'room' || !wa || !parallel(island, wall)) return;
            const runEnds = stretchEnds(wall).map((t) => along(ia, wa, t));
            for (const end of islandEnds) {
              const misses = runEnds.map((r) => Math.abs(r - end)).filter((d) => d > 0 && d <= within);
              if (misses.length === 0 || runEnds.some((r) => r === end)) continue;
              issues.push({
                check_id: this.id,
                severity,
                message:
                  `${rule.id} (${rule.title}): an end of the island on wall ${wallLetter(k)} in "${room.name}" is ${lengthText(Math.min(...misses))} ` +
                  `from lining up with the end of the cabinets on wall ${wallLetter(w)}. Within ${formatInches(within)}, line them up exactly.`,
                ref: { kind: 'run', id: (island.runs[0] as Run).run_id },
              });
            }
          });
        });
      }
      return issues;
    },
  };
}

// ---------- PREF-013: an island sink and a back-wall range line up exactly ----------

function islandSinkLinesUpWithRange(rule: DesignRule, severity: Severity, sinkKinds: readonly string[], rangeKinds: readonly string[]): Check {
  return {
    id: designRuleCheckId(rule.id),
    layer: 'design_rules',
    description: `${rule.id}: ${rule.title}`,
    run(job: Job): readonly Issue[] {
      const issues: Issue[] = [];
      for (const room of job.rooms) {
        room.walls.forEach((island, k) => {
          const ia = axis(island);
          if (island.kind !== 'floating' || !ia) return;
          // Centres along the island's line of every range on a wall parallel to it.
          const ranges = room.walls.flatMap((wall) => {
            const wa = axis(wall);
            if (wall.kind !== 'room' || !wa || !parallel(island, wall)) return [];
            return wall.appliances.filter((a) => rangeKinds.includes(a.kind)).map((a) => along(ia, wa, a.offset + a.width.value / 2));
          });
          if (ranges.length === 0) return;
          island.appliances.forEach((a, i) => {
            if (!sinkKinds.includes(a.kind)) return;
            const centre = a.offset + a.width.value / 2;
            const off = Math.min(...ranges.map((r) => Math.abs(r - centre)));
            if (off === 0) return;
            issues.push({
              check_id: this.id,
              severity,
              message:
                `${rule.id} (${rule.title}): appliance ${i + 1} (${a.kind}) on the island on wall ${wallLetter(k)} in "${room.name}" is ` +
                `${lengthText(off)} out of line with the range on the back wall. Line their centres up exactly.`,
              ref: { kind: 'appliance', id: a.placement_id },
            });
          });
        });
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
    // Walkways are measured from the countertop edge (owner, 2026-11-09): PREF-008's overhang.
    const counter = rules.rules.find((r) => r.id === 'PREF-008');
    if (!counter || counter.status !== 'confirmed') problems.push('rule PREF-008 (the countertop overhang the walkways are measured from) is missing or not confirmed');
    const overhang = counter && counter.status === 'confirmed' ? single(counter, 'overhang') : null;
    if (strongMin !== null && preferredMin !== null && preferredMax !== null && overhang !== null) {
      if (!(strongMin <= preferredMin && preferredMin <= preferredMax)) problems.push(`rule ${walk.rule.id}'s walkway lengths are out of order`);
      else
        checks.push(
          walkwayWidths(walk.rule, walk.severity, {
            strongMin,
            preferredMin,
            preferredMax,
            overhang,
            overhangRule: 'PREF-008',
            countertopKinds: settings.countertop_run_kinds.value,
          }),
        );
    }
  }
  const lineUp = pick('PREF-012');
  if (lineUp) {
    const within = single(lineUp.rule, 'line_up_within');
    if (within !== null) checks.push(islandsLineUp(lineUp.rule, lineUp.severity, within));
  }
  const inLine = pick('PREF-013');
  if (inLine) checks.push(islandSinkLinesUpWithRange(inLine.rule, inLine.severity, settings.sink_kinds.value, settings.back_wall_range_kinds.value));
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
