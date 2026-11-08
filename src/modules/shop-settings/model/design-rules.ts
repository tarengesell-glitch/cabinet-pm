/**
 * Design rules carried over from closet-builder (owner, 2026-11-07): data with a recorded
 * source (rule 6), in data/design-rules.json. A bad data file fails loudly; nothing is
 * filled in. The owner reviewed them on 2026-11-07/08: each says whether it is confirmed for
 * this platform, declined, or still a candidate, and (when confirmed) what the design tool
 * does when a designer's own change breaks it. The AI designer reads every confirmed rule.
 * No rule is applied by the software yet.
 */
import { z } from 'zod';
import { parseImperial, type Length } from '@/core/index';
import raw from '../data/design-rules.json';

export const RULE_KINDS = ['hard', 'preference', 'principle', 'front_rule', 'documentation', 'optional', 'rejected'] as const;
export const RULE_STATUSES = ['confirmed', 'candidate', 'conflicts', 'declined'] as const;
/** What the design tool does when a designer's own change breaks a confirmed rule. */
export const DESIGN_TOOL_ACTIONS = ['not_drawable', 'error', 'suggestion', 'none'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
export type RuleStatus = (typeof RULE_STATUSES)[number];
export type DesignToolAction = (typeof DESIGN_TOOL_ACTIONS)[number];

const Text = z.string().min(1);
const RuleSchema = z.strictObject({
  id: z.string().regex(/^[A-Z]+(-[A-Z]+)?-\d{2,3}$/),
  kind: z.enum(RULE_KINDS),
  topic: Text,
  title: Text,
  says: Text,
  strength: Text.optional(),
  lengths: z.record(z.string(), z.union([Text, z.array(Text).min(1)])).optional(),
  applies_when: Text.optional(),
  source: Text,
  closet_builder_status: Text,
  here: z.strictObject({ status: z.enum(RULE_STATUSES), note: z.string() }),
  design_tool: z.enum(DESIGN_TOOL_ACTIONS).optional(),
  related: z.array(Text).optional(),
  open: z.array(Text).optional(),
});
const FileSchema = z.strictObject({
  imported_from: Text,
  imported_on: Text,
  requested_by: Text,
  caution: Text,
  statuses: z.strictObject({ confirmed: Text, candidate: Text, conflicts: Text, declined: Text }),
  design_tool: z.strictObject({ how_used: Text, not_drawable: Text, error: Text, suggestion: Text, none: Text, unset: Text }),
  kinds: z.strictObject(Object.fromEntries(RULE_KINDS.map((k) => [k, Text])) as Record<RuleKind, typeof Text>),
  rules: z.array(RuleSchema).min(1),
  not_imported: z.array(z.strictObject({ what: Text, why: Text })),
});

export interface DesignRule {
  readonly id: string;
  readonly kind: RuleKind;
  readonly topic: string;
  readonly title: string;
  /** The rule in plain language, for designers and for the AI draft. */
  readonly says: string;
  readonly strength: string | null;
  /** Named lengths the rule uses, already converted to the base unit. */
  readonly lengths: Readonly<Record<string, Length | readonly Length[]>>;
  readonly appliesWhen: string | null;
  /** Where it came from: the owner's words and the date. */
  readonly source: string;
  /** Its status in closet-builder's own knowledge base. */
  readonly closetBuilderStatus: string;
  /** Its status on this platform. Only "confirmed" rules may be used without asking the owner. */
  readonly status: RuleStatus;
  readonly note: string;
  /**
   * What the design tool does when a designer's own change breaks it; null when not set.
   * Only confirmed rules have one: every confirmed preference is a suggestion (owner, 2026-11-07).
   */
  readonly designTool: DesignToolAction | null;
  readonly related: readonly string[];
  readonly open: readonly string[];
}

export interface DesignRules {
  readonly importedFrom: string;
  readonly importedOn: string;
  readonly caution: string;
  readonly rules: readonly DesignRule[];
}

/** Reads and checks the design rules. Returns every problem, not just the first. */
export function readDesignRules(data: unknown): { ok: true; value: DesignRules } | { ok: false; reason: string } {
  const parsed = FileSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: `design-rules.json is not in the right shape: ${parsed.error.message}` };
  const d = parsed.data;
  const problems: string[] = [];
  const length = (where: string, text: string): Length => {
    const r = parseImperial(text);
    if (!r.ok) problems.push(`${where}: ${r.reason}`);
    else if (r.value <= 0) problems.push(`${where}: must be more than zero`);
    return r.ok ? r.value : 0;
  };
  const ids = new Set<string>();
  for (const r of d.rules) {
    if (ids.has(r.id)) problems.push(`rule ${r.id} is listed twice`);
    ids.add(r.id);
  }
  const rules = d.rules.map((r): DesignRule => {
    for (const other of r.related ?? []) {
      if (!ids.has(other)) problems.push(`${r.id} is related to ${other}, which is not on the list`);
    }
    if (r.here.status !== 'candidate' && r.here.note.trim() === '') {
      problems.push(`${r.id} is "${r.here.status}" but does not say why`);
    }
    if (r.design_tool !== undefined && r.here.status !== 'confirmed') {
      problems.push(`${r.id} has a design tool setting but is not confirmed`);
    }
    if (r.here.status === 'confirmed' && r.kind === 'preference' && r.design_tool !== 'suggestion') {
      problems.push(`${r.id} is a confirmed preference, so the design tool shows it as a suggestion`);
    }
    const lengths = Object.fromEntries(
      Object.entries(r.lengths ?? {}).map(([name, v]) => [
        name,
        Array.isArray(v) ? v.map((t) => length(`${r.id} ${name}`, t)) : length(`${r.id} ${name}`, v as string),
      ]),
    );
    return {
      id: r.id,
      kind: r.kind,
      topic: r.topic,
      title: r.title,
      says: r.says,
      strength: r.strength ?? null,
      lengths,
      appliesWhen: r.applies_when ?? null,
      source: r.source,
      closetBuilderStatus: r.closet_builder_status,
      status: r.here.status,
      note: r.here.note,
      designTool: r.design_tool ?? null,
      related: r.related ?? [],
      open: r.open ?? [],
    };
  });
  if (problems.length > 0) return { ok: false, reason: `design-rules.json has bad values: ${problems.join('; ')}` };
  return { ok: true, value: { importedFrom: d.imported_from, importedOn: d.imported_on, caution: d.caution, rules } };
}

function load(): DesignRules {
  const r = readDesignRules(raw);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

/** The design rules, checked when the module loads. */
export const DESIGN_RULES: DesignRules = load();
