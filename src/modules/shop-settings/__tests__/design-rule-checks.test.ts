import { describe, expect, it } from 'vitest';
import { examples, fromInches, runChecks, type Check, type Job, type Run, type Wall } from '@/core/index';
import {
  DESIGN_RULES,
  DESIGN_RULE_CHECKS,
  DESIGN_RULE_CHECK_SETTINGS,
  buildDesignRuleChecks,
  designRuleCheckId,
  readCheckSettings,
  type DesignRules,
} from '../contract';

const inch = (whole: number, num = 0, den = 1): number => {
  const r = fromInches(whole, num, den);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const check = (ruleId: string): Check => {
  const found = DESIGN_RULE_CHECKS.find((c) => c.id === designRuleCheckId(ruleId));
  if (!found) throw new Error(`no check for ${ruleId}`);
  return found;
};
const issues = (ruleId: string, job: Job) => runChecks([check(ruleId)], job, {}).issues;

// The example kitchen: 12' x 10', drawn counter-clockwise, 4 1/2" walls. Wall A (along y = 0) has
// a 24"-deep base + upper run, so its front is at y = 26 1/4". Wall C (y = 10') has nothing.
const kitchen = (): Job => examples.kitchen();
const wallOf = (job: Job, w: number): Wall => job.rooms[0]!.walls[w]!;

/** Adds a base-only island along x, centred on y, of the given depth. */
function withIsland(job: Job, y: number, depth: number, from = inch(0), to = inch(144)): Job {
  const island: Wall = {
    wall_id: id(900),
    kind: 'floating',
    start_point: { x: from, y },
    end_point: { x: to, y },
    entered_length: null,
    length_source_mm: null,
    length_provenance: 'unmeasured',
    thickness: null,
    openings: [],
    obstacles: [],
    runs: [{ run_id: id(901), kind: 'base', offset: 0, length: to - from, depth }],
    appliances: [],
  };
  job.rooms[0]!.walls.push(island);
  return job;
}
/**
 * The example kitchen made 20' deep (walls B, C and D move), so an island has room behind it.
 * Wall C's inside face is then at y = 237 3/4".
 */
function deeper(job: Job = kitchen()): Job {
  const far = inch(240);
  const [b, c, d] = [wallOf(job, 1), wallOf(job, 2), wallOf(job, 3)];
  b.end_point = { ...b.end_point, y: far };
  c.start_point = { ...c.start_point, y: far };
  c.end_point = { ...c.end_point, y: far };
  d.start_point = { ...d.start_point, y: far };
  return job;
}
// Wall A's run is base + upper, so it has a countertop: its edge is 2 1/4" + 24" + 1" (PREF-008).
const COUNTER_A = inch(27, 1, 4);
/** A base island, `depth` deep (its countertop 1" past each side), `walkway` from wall A's countertop edge. */
const islandAt = (walkway: number, depth = inch(36), job: Job = deeper()): Job =>
  withIsland(job, COUNTER_A + walkway + inch(1) + depth / 2, depth);

describe('design-rule checks', () => {
  it('cover the rules the README lists as checkable now, each in the design_rules layer', () => {
    expect(DESIGN_RULE_CHECKS.map((c) => c.id)).toEqual(['HARD-014', 'PREF-011', 'PREF-012', 'PREF-013', 'PREF-023'].map(designRuleCheckId));
    for (const c of DESIGN_RULE_CHECKS) expect(c.layer).toBe('design_rules');
  });

  it('pass the example rooms', () => {
    for (const job of [examples.kitchen(), examples.lShapeWithAngledWall()]) {
      expect(runChecks(DESIGN_RULE_CHECKS, job, {}).issues).toEqual([]);
    }
  });
});

describe('HARD-014: an all-pantry run in front of a window (error → block)', () => {
  it('passes a pantry beside a window, touching its edge', () => {
    const job = kitchen();
    // The window on wall A runs from 48" to 84".
    wallOf(job, 0).runs = [
      { run_id: id(601), kind: 'base_upper', offset: 0, length: inch(84), depth: inch(24) },
      { run_id: id(611), kind: 'pantry', offset: inch(84), length: inch(30), depth: inch(24) },
    ];
    wallOf(job, 0).appliances = wallOf(job, 0).appliances.filter((a) => a.kind !== 'dishwasher');
    expect(issues('HARD-014', job)).toEqual([]);
  });

  it('blocks a pantry that reaches in front of a window, naming the rule', () => {
    const job = kitchen();
    (wallOf(job, 0).runs[0] as { kind: Run['kind'] }).kind = 'pantry';
    const found = issues('HARD-014', job);
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('block');
    expect(found[0]!.message).toContain('HARD-014');
    expect(found[0]!.message).toContain('36"');
    expect(found[0]!.ref).toEqual({ kind: 'run', id: id(601) });
  });
});

describe('PREF-023: a sink in front of a window is centred under it (suggestion → warn)', () => {
  it('passes a centred sink, and a sink not in front of a window', () => {
    expect(issues('PREF-023', kitchen())).toEqual([]);
    const job = kitchen();
    wallOf(job, 0).appliances[0] = { ...wallOf(job, 0).appliances[0]!, offset: inch(10) };
    expect(issues('PREF-023', job)).toEqual([]);
  });

  it('warns about a sink off centre under a window, saying by how much', () => {
    const job = kitchen();
    wallOf(job, 0).appliances[0] = { ...wallOf(job, 0).appliances[0]!, offset: inch(54, 1, 2) };
    const found = issues('PREF-023', job);
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('warn');
    expect(found[0]!.message).toContain('PREF-023');
    expect(found[0]!.message).toContain('4 1/2" off centre');
  });

  it('ignores a bar sink (not centred under windows in the rough layout)', () => {
    const job = kitchen();
    wallOf(job, 0).appliances[0] = { ...wallOf(job, 0).appliances[0]!, kind: 'bar_sink', offset: inch(54) };
    expect(issues('PREF-023', job)).toEqual([]);
  });
});

describe('PREF-011: walkways, from the countertop edge (suggestion → warn)', () => {
  it('passes a walkway in the preferred 42" to 48"', () => {
    expect(issues('PREF-011', islandAt(inch(42)))).toEqual([]);
    expect(issues('PREF-011', islandAt(inch(45)))).toEqual([]);
    expect(issues('PREF-011', islandAt(inch(48)))).toEqual([]);
  });

  it('warns under 36", from 36" to 42", and over 48", naming the rule', () => {
    for (const [width, says] of [
      [inch(30), 'under the 36" minimum'],
      [inch(36), 'narrower than preferred'],
      [inch(41, 63, 64), 'narrower than preferred'],
      [inch(48, 1, 64), 'over the 48" maximum'],
    ] as const) {
      const found = issues('PREF-011', islandAt(width));
      expect(found).toHaveLength(1);
      expect(found[0]!.severity).toBe('warn');
      expect(found[0]!.message).toContain('PREF-011');
      expect(found[0]!.message).toContain(says);
    }
  });

  it('measures from the countertop edge, and from the front of a run with no countertop', () => {
    const found = issues('PREF-011', islandAt(inch(30)));
    expect(found[0]!.message).toContain('is 30" wide');
    expect(found[0]!.message).toContain('countertop edge');
    // An all-pantry run has no countertop: the same island is 1" further from its front.
    const job = islandAt(inch(30));
    (wallOf(job, 0).runs[0] as { kind: Run['kind'] }).kind = 'pantry';
    expect(issues('PREF-011', job)[0]!.message).toContain('is 31" wide');
  });

  it('applies the minimums, but not the maximum, to a bare wall', () => {
    // In the 10' kitchen, an island 45" from wall A has 7 1/2" behind it to bare wall C.
    const near = issues('PREF-011', islandAt(inch(45), inch(36), kitchen()));
    expect(near).toHaveLength(1);
    expect(near[0]!.message).toContain('bare wall C');
    expect(near[0]!.message).toContain('is 7 1/2" wide, under the 36" minimum');
    // In the 20' kitchen it has over 10' behind it: not a problem.
    expect(issues('PREF-011', islandAt(inch(45)))).toEqual([]);
  });

  it('does not count an upper-only run as narrowing the floor', () => {
    const job = islandAt(inch(45), inch(36), kitchen());
    wallOf(job, 2).runs = [{ run_id: id(620), kind: 'upper', offset: 0, length: inch(144), depth: inch(12) }];
    expect(issues('PREF-011', job).map((i) => i.message.match(/is ([^,]+) wide/)?.[1])).toEqual(['7 1/2"']);
  });

  it('a nearer island hides the run behind it', () => {
    const job = kitchen();
    // A base run on wall C: its countertop edge is at 10' - 2 1/4" - 25" = 92 3/4", 65 1/2" from wall A's.
    wallOf(job, 2).runs = [{ run_id: id(620), kind: 'base', offset: 0, length: inch(144), depth: inch(24) }];
    const apart = issues('PREF-011', job);
    expect(apart).toHaveLength(1);
    expect(apart[0]!.message).toContain('65 1/2" wide, over the 48" maximum');
    // A 15" island: 30" to wall A's countertop, 18 1/2" to wall C's.
    const between = issues('PREF-011', withIsland(job, COUNTER_A + inch(30) + inch(8, 1, 2), inch(15)));
    expect(between.map((i) => i.message.match(/is ([^,]+) wide/)?.[1])).toEqual(['30"', '18 1/2"']);
  });

  it('a short island hides only the stretch it covers', () => {
    const job = kitchen();
    wallOf(job, 2).runs = [{ run_id: id(620), kind: 'base', offset: 0, length: inch(144), depth: inch(24) }];
    const found = issues('PREF-011', withIsland(job, COUNTER_A + inch(30) + inch(8, 1, 2), inch(15), inch(48), inch(96)));
    expect(found).toHaveLength(3);
    expect(found.some((i) => i.message.includes('65 1/2"'))).toBe(true);
  });
});

describe('PREF-012: an island end within 5" of a wall run end lines up with it (suggestion → warn)', () => {
  // Wall A's cabinets run from 0 to 12'.
  const island = (from: number, to: number) => withIsland(deeper(), inch(120), inch(36), from, to);

  it('passes an island lined up exactly, or well clear (more than 5")', () => {
    expect(issues('PREF-012', island(inch(0), inch(144)))).toEqual([]);
    expect(issues('PREF-012', island(inch(24), inch(120)))).toEqual([]);
    expect(issues('PREF-012', island(inch(5, 1, 64), inch(144)))).toEqual([]);
  });

  it('warns about each island end within 5" of lining up, naming the rule', () => {
    const found = issues('PREF-012', island(inch(3), inch(139)));
    expect(found).toHaveLength(2);
    expect(found[0]!.severity).toBe('warn');
    expect(found[0]!.message).toContain('PREF-012');
    expect(found.map((i) => i.message.match(/is ([^ ]+) from lining up/)?.[1])).toEqual(['3"', '5"']);
  });

  it('works whichever way the island was drawn', () => {
    expect(issues('PREF-012', island(inch(141), inch(0)))).toHaveLength(1);
  });
});

describe('PREF-013: an island sink and a back-wall range line up exactly (suggestion → warn)', () => {
  // A 30" range on wall C (drawn from x = 12' to 0) at 50": its centre is at x = 144 - 65 = 79".
  function withSinkAndRange(sinkOffset: number): Job {
    const job = withIsland(deeper(), inch(120), inch(36));
    wallOf(job, 2).appliances = [{ placement_id: id(720), kind: 'range', offset: inch(50), width: { value: inch(30), provenance: 'unmeasured', source_mm: null }, paired_with: null }];
    wallOf(job, 4).appliances = [{ placement_id: id(910), kind: 'sink', offset: sinkOffset, width: { value: inch(32), provenance: 'unmeasured', source_mm: null }, paired_with: null }];
    return job;
  }

  it('passes when their centres line up exactly, and when there is no back-wall range', () => {
    expect(issues('PREF-013', withSinkAndRange(inch(63)))).toEqual([]);
    const job = withSinkAndRange(inch(60));
    wallOf(job, 2).appliances = [];
    expect(issues('PREF-013', job)).toEqual([]);
  });

  it('warns when they are out of line by any amount, saying by how much', () => {
    const found = issues('PREF-013', withSinkAndRange(inch(60)));
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('warn');
    expect(found[0]!.message).toContain('PREF-013');
    expect(found[0]!.message).toContain('3" out of line');
    expect(issues('PREF-013', withSinkAndRange(inch(63, 1, 64)))).toHaveLength(1);
  });
});

describe('building the checks fails closed', () => {
  const rulesWith = (ruleId: string, change: Record<string, unknown>): DesignRules => ({
    ...DESIGN_RULES,
    rules: DESIGN_RULES.rules.map((r) => (r.id === ruleId ? { ...r, ...change } : r)),
  });

  it('builds from the real rules and settings', () => {
    expect(buildDesignRuleChecks(DESIGN_RULES, DESIGN_RULE_CHECK_SETTINGS).ok).toBe(true);
  });

  it('takes the severity from the rule data, not the code', () => {
    const r = buildDesignRuleChecks(rulesWith('HARD-014', { designTool: 'suggestion' }), DESIGN_RULE_CHECK_SETTINGS);
    if (!r.ok) throw new Error(r.reason);
    const job = kitchen();
    (wallOf(job, 0).runs[0] as { kind: Run['kind'] }).kind = 'pantry';
    expect(runChecks(r.value, job, {}).issues[0]!.severity).toBe('warn');
  });

  it('refuses a rule that is missing, not confirmed, or not a check', () => {
    const missing = buildDesignRuleChecks({ ...DESIGN_RULES, rules: DESIGN_RULES.rules.filter((r) => r.id !== 'PREF-023') }, DESIGN_RULE_CHECK_SETTINGS);
    expect(missing).toEqual({ ok: false, reason: expect.stringContaining('PREF-023 is not in the design rules') });
    const declined = buildDesignRuleChecks(rulesWith('PREF-011', { status: 'declined' }), DESIGN_RULE_CHECK_SETTINGS);
    expect(declined).toEqual({ ok: false, reason: expect.stringContaining('PREF-011 is "declined"') });
    const none = buildDesignRuleChecks(rulesWith('HARD-014', { designTool: 'none' }), DESIGN_RULE_CHECK_SETTINGS);
    expect(none).toEqual({ ok: false, reason: expect.stringContaining('HARD-014 is set to "none"') });
  });

  it('refuses walkways without the countertop overhang (PREF-008)', () => {
    const r = buildDesignRuleChecks(rulesWith('PREF-008', { lengths: {} }), DESIGN_RULE_CHECK_SETTINGS);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('PREF-008 has no single length "overhang"') });
  });

  it('refuses the island rule without its 5"', () => {
    const r = buildDesignRuleChecks(rulesWith('PREF-012', { lengths: {} }), DESIGN_RULE_CHECK_SETTINGS);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('PREF-012 has no single length "line_up_within"') });
  });

  it('refuses a walkway rule without its lengths', () => {
    const r = buildDesignRuleChecks(rulesWith('PREF-011', { lengths: {} }), DESIGN_RULE_CHECK_SETTINGS);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('no single length "strong_min"') });
  });

  it('refuses a settings file with no sink kinds', () => {
    const good = { source: 'x', sink_kinds: { value: ['sink'], source: 'x' }, back_wall_range_kinds: { value: ['range'], source: 'x' }, countertop_run_kinds: { value: ['base'], source: 'x' } };
    expect(readCheckSettings(good).ok).toBe(true);
    expect(readCheckSettings({ ...good, sink_kinds: { value: [], source: 'x' } }).ok).toBe(false);
    expect(readCheckSettings({ ...good, countertop_run_kinds: { value: ['shelf'], source: 'x' } }).ok).toBe(false);
  });
});
