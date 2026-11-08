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
/** An island whose near front is `walkway` from wall A's run front. */
const islandAt = (walkway: number, depth = inch(36)): Job => withIsland(kitchen(), inch(26, 1, 4) + walkway + depth / 2, depth);

describe('design-rule checks', () => {
  it('cover the rules the README lists as checkable now, each in the design_rules layer', () => {
    expect(DESIGN_RULE_CHECKS.map((c) => c.id)).toEqual(['HARD-014', 'PREF-011', 'PREF-023'].map(designRuleCheckId));
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

describe('PREF-011: walkways between facing cabinet runs (suggestion → warn)', () => {
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

  it('measures run fronts, not the walls behind them', () => {
    const found = issues('PREF-011', islandAt(inch(30)));
    expect(found[0]!.message).toContain('is 30" wide');
  });

  it('does not count an island facing a bare wall or an upper-only run', () => {
    const job = islandAt(inch(45));
    // The island's back faces bare wall C, about 10" away: not a walkway between cabinets.
    expect(issues('PREF-011', job)).toEqual([]);
    wallOf(job, 2).runs = [{ run_id: id(620), kind: 'upper', offset: 0, length: inch(144), depth: inch(12) }];
    expect(issues('PREF-011', job)).toEqual([]);
  });

  it('a nearer island hides the run behind it', () => {
    const job = kitchen();
    // A base run on wall C: its front is at 10' - 2 1/4" - 24" = 93 3/4", 67 1/2" from wall A's.
    wallOf(job, 2).runs = [{ run_id: id(620), kind: 'base', offset: 0, length: inch(144), depth: inch(24) }];
    const apart = issues('PREF-011', job);
    expect(apart).toHaveLength(1);
    expect(apart[0]!.message).toContain('67 1/2" wide, over the 48" maximum');
    // A 15" island across the whole gap: 30" to wall A's run, 22 1/2" to wall C's.
    const between = issues('PREF-011', withIsland(job, inch(63, 3, 4), inch(15)));
    expect(between.map((i) => i.message.match(/is ([^,]+) wide/)?.[1])).toEqual(['30"', '22 1/2"']);
  });

  it('a short island hides only the stretch it covers', () => {
    const job = kitchen();
    wallOf(job, 2).runs = [{ run_id: id(620), kind: 'base', offset: 0, length: inch(144), depth: inch(24) }];
    const found = issues('PREF-011', withIsland(job, inch(63, 3, 4), inch(15), inch(48), inch(96)));
    expect(found).toHaveLength(3);
    expect(found.some((i) => i.message.includes('67 1/2"'))).toBe(true);
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

  it('refuses a walkway rule without its lengths', () => {
    const r = buildDesignRuleChecks(rulesWith('PREF-011', { lengths: {} }), DESIGN_RULE_CHECK_SETTINGS);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('no single length "strong_min"') });
  });

  it('refuses a settings file with no sink kinds', () => {
    expect(readCheckSettings({ source: 'x', sink_kinds: { value: [], source: 'x' } }).ok).toBe(false);
  });
});
