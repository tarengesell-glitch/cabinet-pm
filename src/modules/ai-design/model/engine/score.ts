/**
 * An option's scorecard: for each confirmed design rule the builder can judge, whether the option
 * meets it, with the owner's own strength words (BUILD_PLAN 6, step 3). The AI designer (step 4)
 * reads these to compare options; ordinary code uses them only to shortlist and as the fallback.
 *
 * Where a rule needed reading to be scored, the reading is written next to it (PROPOSED in
 * DECISIONS "AI designer: layout builder").
 */
import { applianceEnd, formatInches, windowSpans, type Length, type Span } from '@/core/index';
import type { DesignRule, DesignRules } from '@/modules/shop-settings/contract';
import type { BuiltRoom, Slot } from './build';
import type { DraftConfig } from './config';
import type { ScoreLine } from './types';

const inches = (ws: readonly Length[]) => ws.map((w) => formatInches(w)).join(', ');

export function scoreOption(built: BuiltRoom, config: DraftConfig, rules: DesignRules, answers: ReadonlyMap<string, string>): ScoreLine[] {
  const lines: ScoreLine[] = [];
  const rule = (id: string): DesignRule | null => rules.rules.find((r) => r.id === id && r.status === 'confirmed') ?? null;
  const line = (id: string, result: ScoreLine['result'], detail: string) => {
    const r = rule(id);
    if (r) lines.push({ ruleId: id, title: r.title, strength: r.strength ?? 'default', result, detail });
  };
  const n = config.numbers;
  const divided = built.slots.filter((s) => s.role === 'divided');
  const widths = divided.map((s) => s.width);

  // Cabinet widths (PREF-001, PREF-002 with PREF-025, PREF-003).
  const outside = widths.filter((w) => w < n.idealMin || w > n.idealMax);
  line('PREF-001', outside.length ? 'broken' : 'met', outside.length ? `${outside.length} of ${widths.length} cabinets are outside ${formatInches(n.idealMin)}–${formatInches(n.idealMax)} (${inches(outside)}).` : `All ${widths.length} cabinets are ${formatInches(n.idealMin)}–${formatInches(n.idealMax)}.`);
  const over = widths.filter((w) => w > n.avoidOver && w > n.oneCabinetUpTo);
  line('PREF-002', over.length ? 'broken' : 'met', over.length ? `${over.length} cabinets are over ${formatInches(n.oneCabinetUpTo)} (${inches(over)}).` : `No cabinet is over ${formatInches(n.avoidOver)} beyond what PREF-025 allows.`);
  const under = widths.filter((w) => w < n.avoidUnder);
  line('PREF-003', under.length ? 'broken' : 'met', under.length ? `${under.length} cabinets are under ${formatInches(n.avoidUnder)} (${inches(under)}).` : `No cabinet is under ${formatInches(n.avoidUnder)}.`);

  // Rhythm (PREF-021). Reading: in each run and layer of three or more cabinets, more than one
  // width that appears only once is a "random one-off" set.
  const groups = new Map<string, number[]>();
  for (const s of divided) groups.set(`${s.runId}|${s.layer}`, [...(groups.get(`${s.runId}|${s.layer}`) ?? []), s.width]);
  const random = [...groups.values()].filter((ws) => ws.length >= 3 && ws.filter((w) => ws.indexOf(w) === ws.lastIndexOf(w)).length > 1);
  line('PREF-021', random.length ? 'broken' : 'met', random.length ? `${random.length} run(s) mix several one-off widths: ${random.map((ws) => inches(ws)).join(' | ')}.` : 'Each run repeats a small set of widths.');

  // Equal widths either side of a focal point (PREF-019): the sink base, and the cooking space (base and upper).
  const touching = (s: Slot, edge: Length, side: 'low' | 'high', layer: Slot['layer']) =>
    built.slots.find(
      (o) =>
        o !== s &&
        o.wallId === s.wallId &&
        o.layer === layer &&
        o.role !== 'filler' &&
        (side === 'low' ? edge - (o.start + o.width) >= 0 && edge - (o.start + o.width) <= n.endAllowance : o.start - edge >= 0 && o.start - edge <= n.endAllowance),
    ) ?? null;
  const unequal: string[] = [];
  const focal = (wallId: string, span: Span, layer: Slot['layer'], what: string) => {
    const probe = { wallId, layer } as Slot;
    const a = touching(probe, span.start, 'low', layer);
    const b = touching(probe, span.end, 'high', layer);
    if (a && b && a.role === 'divided' && b.role === 'divided' && a.width !== b.width) unequal.push(`${what}: ${formatInches(a.width)} | ${formatInches(b.width)}`);
  };
  for (const s of built.slots.filter((x) => x.role === 'sink_base')) focal(s.wallId, { start: s.start, end: s.start + s.width }, 'base', 'either side of the sink');
  for (const c of built.cooking) {
    focal(c.wallId, c.span, 'base', 'either side of the cooktop');
    focal(c.wallId, c.span, 'upper', 'either side of the hood');
  }
  line('PREF-019', unequal.length ? 'broken' : 'met', unequal.length ? `Unequal: ${unequal.join('; ')}.` : 'The cabinets either side of each focal point match (or one side is not a plain cabinet).');

  // The sink centred under its window (PREF-023).
  const sinkLines: string[] = [];
  let sinkUnder = 0;
  for (const w of built.room.walls)
    for (const a of w.appliances.filter((x) => x.kind === 'sink')) {
      const win = windowSpans(w).find((s) => Math.min(s.end, applianceEnd(a)) > Math.max(s.start, a.offset));
      if (!win) continue;
      sinkUnder++;
      const off = Math.abs(a.offset + a.width.value / 2 - (win.start + win.end) / 2);
      if (off > 0.5) sinkLines.push(`the sink is ${formatInches(Math.round(off))} off the window's centre`);
    }
  line('PREF-023', sinkUnder === 0 ? 'not_applicable' : sinkLines.length ? 'broken' : 'met', sinkUnder === 0 ? 'No sink stands in front of a window.' : sinkLines.length ? `${sinkLines.join('; ')}.` : 'The sink is centred under the window.');

  // Four-drawer banks beside the cooktop (PREF-007) and near the sink (PREF-006).
  const bank4 = built.slots.filter((s) => s.item === config.items.bank4);
  const near = (s: Slot, span: Span) => Math.max(span.start - (s.start + s.width), s.start - span.end) <= n.endAllowance;
  if (built.cooking.length === 0) line('PREF-007', 'not_applicable', 'No cooktop or range.');
  else {
    const without = built.cooking.filter((c) => !bank4.some((b) => b.wallId === c.wallId && near(b, c.span)));
    line('PREF-007', without.length ? 'broken' : 'met', without.length ? `${without.length} cooking appliance(s) have no four-drawer bank right beside them.` : 'A four-drawer bank stands right beside the cooktop.');
  }
  const sinkSide = built.slots.filter((s) => s.role === 'sink_base' || s.role === 'dishwasher');
  if (sinkSide.length === 0) line('PREF-006', 'not_applicable', 'No sink.');
  else {
    const ok = bank4.some((b) => sinkSide.some((s) => s.wallId === b.wallId && near(b, { start: s.start, end: s.start + s.width })));
    line('PREF-006', ok ? 'met' : 'broken', ok ? 'A four-drawer bank is beside the sink or dishwasher.' : 'No four-drawer bank is beside the sink or dishwasher.');
  }

  // The garbage pull-out (PREF-030), when the client asked for a dedicated cabinet.
  const asked = answers.get('garbage_recycling') === 'yes' && answers.get('garbage_location') === 'dedicated_cabinet';
  const placed = built.slots.some((s) => s.role === 'garbage');
  line('PREF-030', !asked ? 'not_applicable' : placed ? 'met' : 'broken', !asked ? 'The client didn\'t ask for a garbage cabinet.' : placed ? 'The garbage pull-out is beside the sink.' : 'The garbage pull-out couldn\'t be placed beside the sink.');

  // Talls share the uppers' top line (PREF-020).
  const talls = built.slots.filter((s) => s.layer === 'tall' && s.role !== 'filler');
  if (talls.length === 0 || built.upperTop === null || !built.slots.some((s) => s.layer === 'upper')) line('PREF-020', 'not_applicable', 'No tall cabinet beside uppers.');
  else {
    const off = talls.filter((t) => t.elevation + t.height !== built.upperTop);
    line('PREF-020', off.length ? 'broken' : 'met', off.length ? `${off.length} tall cabinet(s) stop at ${inches(off.map((t) => t.elevation + t.height))}, not the uppers' ${formatInches(built.upperTop)} top line (talls are made ${formatInches(off[0]!.height)} tall until the shop gives their limits, CAT-1).` : 'Talls and uppers share one top line.');
  }

  // The client's drawer level (a design choice: mandatory, owner 2026-11-09).
  if (built.level !== null) {
    const bases = built.slots.filter((s) => s.layer === 'base' && (s.role === 'divided' || s.role === 'under_cooktop'));
    const banks = bases.filter((s) => s.item === config.items.bank3 || s.item === config.items.bank4).length;
    const rule = config.drawerLevels[built.level];
    const wanted = rule.banksOf4 + (rule.banksOf3 ?? 0);
    lines.push({
      ruleId: 'client:drawer_level',
      title: `The client's drawer level: ${built.level}`,
      strength: 'the client\'s choice',
      result: banks >= wanted ? 'met' : 'broken',
      detail: `${banks} of ${bases.length} base cabinets are drawer banks (${bases.length ? Math.round((banks / bases.length) * 100) : 0}%).`,
    });
  }
  return lines;
}

/** Which tier a strength falls in: the client's choices first, then the owner's words in order. */
function tier(strength: string, order: readonly string[]): number {
  if (strength === 'the client\'s choice') return 0;
  const i = order.findIndex((t) => strength.toLowerCase().startsWith(t));
  return 1 + (i < 0 ? order.length : i);
}

/**
 * The ranking ladder (PROPOSED, data/draft-rules.json): fewest blocking issues; then the client's
 * choices; then the fewest broken preferences of the strongest wording, tier by tier; then fewest
 * broken overall; then the option's key, so the order is always the same.
 */
export function compareOptions(
  a: { key: string; blocks: number; scorecard: readonly ScoreLine[] },
  b: { key: string; blocks: number; scorecard: readonly ScoreLine[] },
  order: readonly string[],
): number {
  if (a.blocks !== b.blocks) return a.blocks - b.blocks;
  const broken = (o: typeof a, t: number) => o.scorecard.filter((l) => l.result === 'broken' && tier(l.strength, order) === t).length;
  for (let t = 0; t <= order.length + 1; t++) {
    const d = broken(a, t) - broken(b, t);
    if (d !== 0) return d;
  }
  const all = (o: typeof a) => o.scorecard.filter((l) => l.result === 'broken').length;
  return all(a) - all(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
