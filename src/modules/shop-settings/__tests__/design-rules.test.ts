import { describe, expect, it } from 'vitest';
import { parseImperial } from '@/core/index';
import { DESIGN_RULES, readDesignRules } from '../contract';
import raw from '../data/design-rules.json';

const copy = () => JSON.parse(JSON.stringify(raw)) as typeof raw;
const rule = (id: string) => {
  const found = DESIGN_RULES.rules.find((r) => r.id === id);
  if (!found) throw new Error(`no rule ${id}`);
  return found;
};
const inches = (text: string) => {
  const r = parseImperial(text);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe('design rules from closet-builder', () => {
  it('loads, with a source on every rule', () => {
    expect(DESIGN_RULES.rules.length).toBeGreaterThan(70);
    for (const r of DESIGN_RULES.rules) expect(r.source.trim()).not.toBe('');
  });

  it('turns lengths into the base unit', () => {
    expect(rule('HARD-015').lengths.min_drawer_cabinet).toBe(inches('12'));
    expect(rule('CB-FACT-16').lengths.edge_gap).toBe(inches('1/16'));
    expect(rule('CB-FACT-48').lengths.crown_sizes).toEqual(['2', '3', '4', '5', '6'].map(inches));
  });

  it('holds the owner review answers (2026-11-07/08)', () => {
    expect(rule('HARD-015').status).toBe('confirmed');
    expect(rule('PREF-019').status).toBe('confirmed');
    expect(rule('CB-FACT-31').status).toBe('confirmed');
    expect(rule('PREF-010').status).toBe('declined');
    expect(rule('CB-A-05').status).toBe('declined');
    expect(rule('DOC-001').status).toBe('confirmed');
    expect(DESIGN_RULES.rules.some((r) => r.status === 'candidate')).toBe(false);
    expect(DESIGN_RULES.rules.some((r) => r.id === 'HARD-003')).toBe(false);
  });

  it('says what the design tool does when a designer breaks a confirmed rule', () => {
    expect(rule('HARD-002').designTool).toBe('not_drawable');
    expect(rule('HARD-006').designTool).toBe('not_drawable');
    expect(rule('CB-FACT-48').designTool).toBe('error');
    expect(rule('HARD-016').designTool).toBe('suggestion');
    expect(rule('PREF-019').designTool).toBe('suggestion');
    expect(rule('PREF-010').designTool).toBeNull();
  });

  it('refuses a confirmed preference that is not on the suggestion list', () => {
    const d = copy();
    const r0 = d.rules.find((r) => r.id === 'PREF-019') as { design_tool?: string };
    r0.design_tool = 'error';
    const r = readDesignRules(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('PREF-019 is a confirmed preference');
  });

  it('refuses a design tool setting on a rule that is not confirmed', () => {
    const d = copy();
    const r0 = d.rules.find((r) => r.id === 'PREF-010') as { design_tool?: string };
    r0.design_tool = 'suggestion';
    const r = readDesignRules(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('PREF-010 has a design tool setting');
  });

  it('refuses a rule listed twice', () => {
    const d = copy();
    d.rules.push(d.rules[0] as (typeof d.rules)[number]);
    const r = readDesignRules(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('listed twice');
  });

  it('refuses a rule with no source', () => {
    const d = copy();
    (d.rules[0] as { source: string }).source = '';
    expect(readDesignRules(d).ok).toBe(false);
  });

  it('refuses a length that is not a length', () => {
    const d = copy();
    const r0 = d.rules.find((r) => r.id === 'HARD-015') as { lengths: Record<string, string> };
    r0.lengths.min_upper = 'eight';
    const r = readDesignRules(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('HARD-015 min_upper');
  });

  it('refuses a link to a rule that does not exist', () => {
    const d = copy();
    (d.rules[0] as { related?: string[] }).related = ['PREF-999'];
    const r = readDesignRules(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('PREF-999');
  });

  it('refuses a confirmed or conflicting rule that does not say why', () => {
    const d = copy();
    const r0 = d.rules.find((r) => r.id === 'CB-FACT-31') as { here: { note: string } };
    r0.here.note = '';
    const r = readDesignRules(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('does not say why');
  });
});
