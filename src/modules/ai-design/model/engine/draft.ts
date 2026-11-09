/**
 * The layout builder's entry point: every option for one room, each built, checked with the same
 * checks as a human design (BUILD_SPEC 5.7, section 7), scored against the design rules and
 * ranked. Ordinary code only (owner, 2026-11-09: "use ordinary code for as much as possible");
 * the AI designer (step 4) chooses between the shortlisted options and explains the choice.
 */
import {
  formatInches,
  ITEM_CHECKS,
  JobSchema,
  ok,
  refuse,
  RUN_CHECKS,
  runChecks,
  WALL_CHECKS,
  type Issue,
  type Job,
  type Length,
  type Result,
  type Room,
} from '@/core/index';
import { catalogItemCheck, type Catalog } from '@/modules/catalog/contract';
import { buildDesignRuleChecks, DESIGN_RULE_CHECK_SETTINGS, type DesignRules } from '@/modules/shop-settings/contract';
import type { BriefAnswer } from '../intake';
import { buildOption, toPlacedItems } from './build';
import { readDraftConfig } from './config';
import { compareOptions, scoreOption } from './score';
import { SPLIT_STRATEGIES, type SplitStrategy } from './split';
import type { LayoutNumbers, LayoutOption, OptionChoices, SinkPlacement, UpperSplit } from './types';

export interface DraftLayoutInput {
  readonly job: Job;
  readonly roomId: string;
  readonly catalog: Catalog;
  readonly designRules: DesignRules;
  /** The room drawing's layout numbers (the designer's data), handed in by the app. */
  readonly layout: LayoutNumbers;
  /** The client's design choices for this room, as the design brief reads them. */
  readonly answers: readonly BriefAnswer[];
  /** How tall the cabinets go, from the client's cabinet height (intake `roughCabinetTop`), or null. */
  readonly cabinetTop: Length | 'ceiling' | null;
}

export interface DraftLayoutResult {
  /** Best first, by the ranking ladder. Every option is kept, with its issues. */
  readonly options: readonly LayoutOption[];
  /** What the builder used that still waits for the owner's yes, in words. */
  readonly proposed: readonly string[];
}

const SPLIT_WORDS: Readonly<Record<SplitStrategy, string>> = {
  equal: 'equal widths',
  ideal_max_plus_one: 'full 32" cabinets plus one',
  even_wide_ends: 'even widths, wider at the ends',
  drawer_banks: 'as many 30" drawer banks as fit',
  one_cabinet: 'one cabinet where it fits',
};

export function draftLayout(input: DraftLayoutInput): Result<DraftLayoutResult> {
  const parsed = JobSchema.safeParse(input.job);
  if (!parsed.success) return refuse(`The job's master copy is not valid: ${parsed.error.issues.map((i) => i.message).join('; ')}.`);
  const job = parsed.data;
  const room = job.rooms.find((r) => r.room_id === input.roomId);
  if (!room) return refuse(`The job has no room with the ID ${input.roomId}.`);
  if (room.walls.every((w) => w.runs.length === 0)) return refuse(`"${room.name}" has no cabinet runs to fill.`);
  const config = readDraftConfig(input.catalog, input.designRules);
  if (!config.ok) return config;
  const ruleChecks = buildDesignRuleChecks(input.designRules, DESIGN_RULE_CHECK_SETTINGS);
  if (!ruleChecks.ok) return refuse(`The design-rule checks can't be set up: ${ruleChecks.reason}`);
  const checks = [...WALL_CHECKS, ...RUN_CHECKS, ...ITEM_CHECKS, catalogItemCheck(input.catalog), ...ruleChecks.value];
  const answers = new Map(input.answers.filter((a) => a.option_ids.length > 0).map((a) => [a.question, a.option_ids[0]!] as const));

  // The choices that make the options. Moving the sink is offered only where it would change something.
  const sinkChoices: SinkPlacement[] = ['as_drawn', ...(sinkCouldCentre(room) ? (['under_window'] as const) : [])];
  const hasUppers = room.walls.some((w) => w.runs.some((r) => r.kind !== 'base' && r.kind !== 'pantry'));
  const upperChoices = hasUppers ? config.value.items.uppers.map((u) => u.code) : [config.value.items.uppers[0]!.code];
  const upperSplits: UpperSplit[] = hasUppers ? ['match_bases', 'own'] : ['own'];

  const built: (LayoutOption & { blocks: number; signature: string })[] = [];
  const seen = new Set<string>();
  for (const sink of sinkChoices)
    for (const split of SPLIT_STRATEGIES)
      for (const upper of upperChoices)
        for (const upperSplit of upperSplits) {
          const choices: OptionChoices = { sink, split, upper, upperSplit };
          const key = `${sink}/${split}/${upper}/${upperSplit}`;
          const seed = `${job.job_id}|${room.room_id}|${key}`;
          const b = buildOption({ room, config: config.value, layout: input.layout, answers, cabinetTop: input.cabinetTop, seed }, choices);
          const items = toPlacedItems(b, config.value, seed);
          // Options that come out the same are one option: the first one is kept.
          const signature = JSON.stringify([b.moves.map((m) => [m.placementId, m.to]), items.map((i) => [i.catalog_item_id, i.position, i.width, i.height, i.depth, i.item_selections])]);
          if (seen.has(signature)) continue;
          seen.add(signature);
          const drafted: Room = { ...b.room, items };
          const drafted_job: Job = { ...job, rooms: job.rooms.map((r) => (r.room_id === room.room_id ? drafted : r)) };
          const issues = [...b.issues, ...inRoom(runChecks(checks, drafted_job, {}).issues, drafted)];
          const upperName = config.value.items.uppers.find((u) => u.code === upper)?.name ?? upper;
          built.push({
            key,
            label: [
              sink === 'under_window' ? 'sink centred under the window' : 'sink where it was drawn',
              b.moves.length ? `moved: ${b.moves.map((m) => `${m.kind.replace(/_/g, ' ')} ${formatInches(Math.abs(m.to - m.from))}`).join(', ')}` : 'no appliance moved',
              SPLIT_WORDS[split],
              ...(hasUppers ? [upperName, upperSplit === 'match_bases' ? 'uppers lined up with the bases' : 'uppers divided on their own'] : []),
            ].join(' · '),
            choices,
            room: drafted,
            moves: b.moves,
            issues,
            scorecard: scoreOption(b, config.value, input.designRules, answers),
            blocks: issues.filter((i) => i.severity === 'block').length,
            signature,
          });
        }

  built.sort((a, b) => compareOptions(a, b, config.value.strengthOrder));
  const options: LayoutOption[] = built.map((o) => ({ key: o.key, label: o.label, choices: o.choices, room: o.room, moves: o.moves, issues: o.issues, scorecard: o.scorecard }));
  return ok({ options, proposed: config.value.proposed });
}

/** A sink in front of a window but not centred on it. */
function sinkCouldCentre(room: Room): boolean {
  return room.walls.some((w) =>
    w.appliances.some(
      (a) =>
        a.kind === 'sink' &&
        w.openings.some((o) => o.kind === 'window' && Math.min(o.offset.value + o.width.value, a.offset + a.width.value) > Math.max(o.offset.value, a.offset) && o.offset.value * 2 + o.width.value !== a.offset * 2 + a.width.value),
    ),
  );
}

/** The checks run over the whole job; keep what is about this room. */
function inRoom(issues: readonly Issue[], room: Room): Issue[] {
  const ids = new Set<string>([
    room.room_id,
    ...room.items.map((i) => i.item_instance_id),
    ...room.walls.flatMap((w) => [w.wall_id, ...w.openings.map((o) => o.opening_id), ...w.obstacles.map((o) => o.obstacle_id), ...w.runs.map((r) => r.run_id), ...w.appliances.map((a) => a.placement_id)]),
  ]);
  return issues.filter((i) => i.ref.kind === 'job' || ids.has(i.ref.id));
}
