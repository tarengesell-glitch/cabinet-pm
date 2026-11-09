/**
 * The design brief: everything the AI designer reads to draft one room (OA-3; BUILD_SPEC 5.7).
 * It is built from the master copy (room, walls, openings, obstacles, cabinet runs, islands and
 * appliances), the confirmed design rules (shop-settings), the cabinet types available to the
 * shop (catalog) and the client's intake answers.
 *
 * Deterministic (P5): no clock, no randomness, no AI call. The same input gives the same bytes.
 * Every collection whose order carries no meaning is sorted; lists whose order means something
 * (walls in drawing order, which gives their letters; a cabinet's fronts from top to bottom;
 * a catalog item's notes) keep it.
 *
 * Fail closed (rule 7): anything missing or inconsistent refuses the brief with every reason.
 * The caller (the draft run) turns a refusal into an alert; this function only reports.
 */
import {
  describeDistance,
  formatInches,
  JobSchema,
  SCHEMA_VERSION,
  wallLetter,
  type AppliancePlacement,
  type Job,
  type Length,
  type Measured,
  type Obstacle,
  type Opening,
  type Point,
  type Run,
  type RunKind,
  type Wall,
} from '@/core/index';
import type { Catalog, CatalogItem, DimensionName, SourcedLength } from '@/modules/catalog/contract';
import type { IntakeDefinition } from '@/modules/intake/contract';
import type { DesignRule, DesignRules } from '@/modules/shop-settings/contract';
import { compare, readRoomIntake, type BriefAnswer } from './intake';
import { sha256Hex } from './sha256';

/** The shape of the brief itself. Raise it when the brief's fields change, so stored briefs stay readable. */
export const BRIEF_FORMAT = 2;

export interface DesignBriefInput {
  /** The master copy version the draft starts from. Checked again here. */
  readonly job: Job;
  readonly roomId: string;
  /** The catalog version to design with (catalog contract). */
  readonly catalog: Catalog;
  /** The shop's design rules as read by shop-settings. Only confirmed rules go into the brief. */
  readonly designRules: DesignRules;
  /** The intake's questions (intake contract `INTAKE_DEFINITION`), to read the answers by. */
  readonly intakeDefinition: IntakeDefinition;
  /** This room's design choices, as the intake hands them over (`intakeHandover`). Checked here. */
  readonly intake: unknown;
}

export type DesignBriefResult =
  | { readonly ok: true; readonly brief: DesignBrief; readonly text: string }
  | { readonly ok: false; readonly reason: string; readonly problems: readonly string[] };

const RUN_KIND_WORDS: Readonly<Record<RunKind, string>> = {
  base: 'base cabinets only',
  upper: 'upper cabinets only',
  base_upper: 'base and upper cabinets',
  base_upper_pantry: 'base, upper and pantry cabinets',
  pantry: 'all pantry (tall) cabinets',
};

const NOT_KNOWN = 'not known yet';

/** Builds the design brief for one room of a job, or refuses with every reason. */
export function buildDesignBrief(input: DesignBriefInput): DesignBriefResult {
  const problems: string[] = [];
  const refused = (): DesignBriefResult => ({
    ok: false,
    reason: `The design brief can't be made yet. ${problems.join(' ')}`,
    problems,
  });

  const parsed = JobSchema.safeParse(input.job);
  if (!parsed.success) {
    problems.push(`The job's master copy is not valid: ${parsed.error.issues.map((i) => i.message).join('; ')}.`);
    return refused();
  }
  const job = parsed.data;
  const room = job.rooms.find((r) => r.room_id === input.roomId);
  if (!room) {
    problems.push(`The job has no room with the ID ${input.roomId}.`);
    return refused();
  }

  const { catalog, designRules } = input;
  if (catalog.shop.id !== job.shop_id) {
    problems.push(
      `The catalog is for ${catalog.shop.name} (${catalog.shop.id}), but this job belongs to shop ${job.shop_id}. Use that shop's catalog.`,
    );
  }

  // The room.
  const lettered = room.walls.map((wall, index) => ({ wall, letter: wallLetter(index) }));
  const placements = new Map(room.walls.flatMap((w) => w.appliances.map((a) => [a.placement_id, a] as const)));
  for (const { wall, letter } of lettered) {
    for (const a of wall.appliances) {
      if (a.paired_with !== null && placements.get(a.paired_with) === undefined) {
        problems.push(`The ${a.kind} on wall ${letter} is paired with an appliance that is not in this room.`);
      }
    }
  }
  if (room.walls.every((w) => w.runs.length === 0)) {
    problems.push(`"${room.name}" has no cabinet runs. Mark where the cabinets go before asking for a draft.`);
  }
  const roomHasIsland = room.walls.some((w) => w.kind === 'floating' && w.runs.length > 0);

  // The client's answers.
  const intake = readRoomIntake(input.intake, input.intakeDefinition, roomHasIsland);
  if (!intake.ok) problems.push(...intake.problems);

  // The confirmed design rules.
  const rules = designRules.rules.filter((r) => r.status === 'confirmed');
  if (rules.length === 0) problems.push('There are no confirmed design rules for the AI designer to follow.');

  // The cabinet types this shop can use.
  const items = catalog.items.filter((i) => i.availability === 'available');
  if (items.length === 0) problems.push(`The catalog for ${catalog.shop.name} has no cabinet types available.`);
  for (const item of items) {
    for (const code of item.options) {
      if (!catalog.options.some((o) => o.code === code)) {
        problems.push(`The cabinet type "${item.name}" offers the option "${code}", which the catalog does not list.`);
      }
    }
  }

  if (problems.length > 0 || !intake.ok) return refused();

  const brief: DesignBrief = {
    brief_format: BRIEF_FORMAT,
    job_id: job.job_id,
    made_from: {
      master_copy_schema_version: SCHEMA_VERSION,
      catalog: { version: catalog.version, shop_id: catalog.shop.id, shop_name: catalog.shop.name },
      design_rules: {
        imported_from: designRules.importedFrom,
        imported_on: designRules.importedOn,
        fingerprint_sha256: rulesFingerprint(designRules),
        rules_in_file: designRules.rules.length,
        confirmed_rules_used: rules.length,
      },
    },
    lengths:
      'Every length is in inches and fractions of an inch. Positions along a wall are measured from the wall\'s start corner. "about" marks a length that is rounded for reading.',
    room: {
      room_id: room.room_id,
      name: room.name,
      ceiling_height: measured(room.ceiling_height),
      walls: lettered.filter(({ wall }) => wall.kind === 'room').map(({ wall, letter }) => roomWall(wall, letter)),
      islands: lettered.filter(({ wall }) => wall.kind === 'floating').map(({ wall, letter }) => island(wall, letter)),
    },
    intake: intake.value,
    design_rules: [...rules].sort((a, b) => compare(a.id, b.id)).map(briefRule),
    cabinet_types: [...items].sort((a, b) => compare(a.code, b.code)).map((i) => cabinetType(i, catalog)),
  };
  return { ok: true, brief, text: `${JSON.stringify(brief, null, 2)}\n` };
}

// ---- The brief's shape -------------------------------------------------------------------

export interface DesignBrief {
  readonly brief_format: number;
  readonly job_id: string;
  /** Which inputs it was made from, so a draft can be traced and repeated. */
  readonly made_from: {
    readonly master_copy_schema_version: number;
    readonly catalog: { readonly version: number; readonly shop_id: string; readonly shop_name: string };
    readonly design_rules: {
      readonly imported_from: string;
      readonly imported_on: string;
      /** SHA-256 of every rule in the file (sorted by ID), so a changed file is noticed. */
      readonly fingerprint_sha256: string;
      readonly rules_in_file: number;
      readonly confirmed_rules_used: number;
    };
  };
  readonly lengths: string;
  readonly room: BriefRoom;
  readonly intake: readonly BriefAnswer[];
  readonly design_rules: readonly BriefRule[];
  readonly cabinet_types: readonly BriefCabinetType[];
}

export interface BriefRoom {
  readonly room_id: string;
  readonly name: string;
  readonly ceiling_height: string;
  /** The room's walls, in drawing order. Each keeps the letter it has on the plan. */
  readonly walls: readonly BriefWall[];
  /** Islands and peninsulas: floating walls with cabinets on both faces. */
  readonly islands: readonly BriefIsland[];
}

interface BriefPoint {
  readonly x: string;
  readonly y: string;
}

export interface BriefWall {
  readonly wall: string;
  readonly wall_id: string;
  readonly from: BriefPoint;
  readonly to: BriefPoint;
  readonly length: string;
  /** The length as typed, when the corners had to be rounded to 1/64". */
  readonly typed_length: string | null;
  readonly length_status: string;
  readonly thickness: string;
  readonly openings: readonly BriefOpening[];
  readonly obstacles: readonly BriefObstacle[];
  readonly runs: readonly BriefRun[];
  readonly appliances: readonly BriefAppliance[];
}

export interface BriefIsland {
  readonly wall: string;
  readonly wall_id: string;
  readonly from: BriefPoint;
  readonly to: BriefPoint;
  readonly length: string;
  readonly runs: readonly BriefRun[];
  readonly appliances: readonly BriefAppliance[];
}

export interface BriefOpening {
  readonly opening_id: string;
  readonly kind: string;
  readonly from_wall_start: string;
  readonly width: string;
  readonly height: string;
  readonly sill_height: string;
  /** A door's hinge end and the side of the wall it opens to (looking from the wall's start); null otherwise. */
  readonly swing: { readonly hinge: string; readonly opens: string } | null;
}

export interface BriefObstacle {
  readonly obstacle_id: string;
  readonly kind: string;
  readonly from_wall_start: string;
  readonly elevation: string;
  readonly width: string;
  readonly height: string;
}

export interface BriefRun {
  readonly run_id: string;
  readonly kind: RunKind;
  readonly holds: string;
  readonly from_wall_start: string;
  readonly length: string;
  readonly depth: string;
}

export interface BriefAppliance {
  readonly placement_id: string;
  readonly kind: string;
  readonly from_wall_start: string;
  readonly width: string;
  /** For a dishwasher: the sink it sits beside. */
  readonly beside: string | null;
}

export interface BriefRule {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly says: string;
  /** How strongly the owner holds it, in their words; null when they didn't say. */
  readonly strength: string | null;
  readonly applies_when: string | null;
  readonly lengths: Readonly<Record<string, string | readonly string[]>>;
}

export interface BriefSize {
  readonly standard: string;
  readonly smallest: string;
  readonly largest: string;
  readonly step: string;
}

export interface BriefCabinetType {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: string;
  readonly description: string | null;
  readonly resizable: boolean;
  readonly size: Readonly<Record<DimensionName, BriefSize>>;
  /** From top to bottom. A count of null means the door or drawer rules set it from the size. */
  readonly fronts: readonly { readonly kind: string; readonly count: number | null }[];
  readonly inside: Readonly<Record<string, number>>;
  readonly toe_kick: boolean;
  readonly options: readonly BriefOption[];
  readonly notes: readonly string[];
}

export interface BriefOption {
  readonly code: string;
  readonly name: string;
  readonly required: boolean;
  readonly default: string | null;
  readonly choices: readonly { readonly code: string; readonly name: string }[];
}

// ---- Helpers ------------------------------------------------------------------------------

/** For values checked earlier: reaching the throw is a bug, so it fails loudly instead of guessing. */
function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Design brief: ${what} is missing, though it was checked.`);
  return value;
}

const point = (p: Point): BriefPoint => ({ x: formatInches(p.x), y: formatInches(p.y) });

function measured(m: Measured): string {
  return `${formatInches(m.value)} (${m.provenance === 'confirmed' ? 'confirmed' : 'rough, not yet confirmed'})`;
}

/** Along-the-wall order, then ID, so equal offsets still sort the same way every time. */
function byOffset<T>(list: readonly T[], offset: (t: T) => Length, idOf: (t: T) => string): T[] {
  return [...list].sort((a, b) => offset(a) - offset(b) || compare(idOf(a), idOf(b)));
}

function runs(wall: Wall): BriefRun[] {
  return byOffset(wall.runs, (r) => r.offset, (r) => r.run_id).map((r: Run) => ({
    run_id: r.run_id,
    kind: r.kind,
    holds: RUN_KIND_WORDS[r.kind],
    from_wall_start: formatInches(r.offset),
    length: formatInches(r.length),
    depth: formatInches(r.depth),
  }));
}

function appliances(wall: Wall): BriefAppliance[] {
  return byOffset(wall.appliances, (a) => a.offset, (a) => a.placement_id).map((a: AppliancePlacement) => ({
    placement_id: a.placement_id,
    kind: a.kind,
    from_wall_start: formatInches(a.offset),
    width: measured(a.width),
    beside: a.paired_with,
  }));
}

function roomWall(wall: Wall, letter: string): BriefWall {
  return {
    wall: letter,
    wall_id: wall.wall_id,
    from: point(wall.start_point),
    to: point(wall.end_point),
    length: describeDistance(wall.start_point, wall.end_point),
    typed_length: wall.entered_length === null ? null : formatInches(wall.entered_length),
    length_status: wall.length_provenance === 'confirmed' ? 'confirmed' : 'rough, not yet confirmed',
    thickness: measured(required(wall.thickness, `wall ${letter}'s thickness`)),
    openings: byOffset(wall.openings, (o) => o.offset.value, (o) => o.opening_id).map((o: Opening) => ({
      opening_id: o.opening_id,
      kind: o.kind,
      from_wall_start: measured(o.offset),
      width: measured(o.width),
      height: measured(o.height),
      sill_height: measured(o.sill_height),
      swing: o.swing === null ? null : { hinge: o.swing.hinge, opens: o.swing.opens },
    })),
    obstacles: byOffset(wall.obstacles, (o) => o.offset.value, (o) => o.obstacle_id).map((o: Obstacle) => ({
      obstacle_id: o.obstacle_id,
      kind: o.kind,
      from_wall_start: measured(o.offset),
      elevation: measured(o.elevation),
      width: measured(o.width),
      height: measured(o.height),
    })),
    runs: runs(wall),
    appliances: appliances(wall),
  };
}

function island(wall: Wall, letter: string): BriefIsland {
  return {
    wall: letter,
    wall_id: wall.wall_id,
    from: point(wall.start_point),
    to: point(wall.end_point),
    length: describeDistance(wall.start_point, wall.end_point),
    runs: runs(wall),
    appliances: appliances(wall),
  };
}

function briefRule(r: DesignRule): BriefRule {
  const lengths = Object.keys(r.lengths)
    .sort(compare)
    .map((name) => {
      const v = r.lengths[name] as Length | readonly Length[];
      return [name, typeof v === 'number' ? formatInches(v) : v.map(formatInches)] as const;
    });
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    says: r.says,
    strength: r.strength,
    applies_when: r.appliesWhen,
    lengths: Object.fromEntries(lengths),
  };
}

const size = (s: SourcedLength): string => (s.value === null ? NOT_KNOWN : formatInches(s.value));

function cabinetType(item: CatalogItem, catalog: Catalog): BriefCabinetType {
  const dims = (['width', 'height', 'depth'] as const).map((d) => {
    const dim = item.size[d];
    return [d, { standard: size(dim.default), smallest: size(dim.min), largest: size(dim.max), step: size(dim.step) }] as const;
  });
  const options = [...item.options].sort(compare).map((code): BriefOption => {
    // Checked before the brief is built: every option an item offers is in the catalog.
    const option = required(catalog.options.find((o) => o.code === code), `the catalog option "${code}"`);
    return {
      code,
      name: option.name,
      required: item.required.includes(code),
      default: item.defaults[code]?.value ?? null,
      choices: [...option.values].sort((a, b) => compare(a.code, b.code)).map((v) => ({ code: v.code, name: v.name })),
    };
  });
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    type: item.type,
    description: item.description,
    resizable: item.resizable,
    size: Object.fromEntries(dims) as Record<DimensionName, BriefSize>,
    fronts: item.front.map((f) => ({ kind: f.kind, count: f.count })),
    inside: Object.fromEntries(Object.keys(item.inside).sort(compare).map((k) => [k, item.inside[k] as number])),
    toe_kick: item.toeKick,
    options,
    notes: item.notes.map((n) => n.text),
  };
}

/** Identifies the design rules file by its content, independent of the order rules are listed in. */
function rulesFingerprint(rules: DesignRules): string {
  const sorted = {
    importedFrom: rules.importedFrom,
    importedOn: rules.importedOn,
    caution: rules.caution,
    rules: [...rules.rules].sort((a, b) => compare(a.id, b.id)),
  };
  return sha256Hex(JSON.stringify(sorted));
}
