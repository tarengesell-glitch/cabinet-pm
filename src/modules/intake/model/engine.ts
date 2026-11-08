/**
 * The intake's rules: which questions show, what each answer means, what is missing, and how
 * later rooms match, coordinate with or contrast an earlier room. Pure: no browser, clock or
 * randomness. Room IDs are passed in. An `Intake` works on the state it is given (the screen
 * passes a copy and keeps the result).
 *
 * Owner decisions (2026-11-07/08, prototype https://claude.ai/artifact/MW4uLq1CX3qvoejeeaPadW):
 * - the first room is the primary room (the kitchen); later rooms pick a type from the list;
 * - a later room matches an earlier room, coordinates with it, contrasts with it, or starts
 *   from scratch. Matching is the recommended path from the third room on;
 * - matched and suggested designs stay linked. A change that affects linked rooms forces a
 *   choice: "Match currently linked rooms" (they change too) or change only this room (the
 *   rooms following it keep their design and stop matching), or cancel.
 */
import { fromInches, ok, refuse, type Length, type Result } from '@/core/index';
import type { Cond, Definition, FieldDef, OptionDef, StepDef, TextVariants, ToneDef } from './definition';

/** An answer: an option ID, a set of option IDs, typed text, or a typed height. */
export type Answer = string | readonly string[] | { readonly ft: string; readonly in: string };

export interface RoomState {
  readonly id: string;
  answers: Record<string, Answer>;
  /** The step on screen in this room. */
  cur: string;
  /** The person pressed Finish (and nothing changed since). */
  done: boolean;
  /** The design answers were copied from the room it is based on. */
  copied: boolean;
  /** The room it stopped following, in words, after "change only this room". */
  unlinked: string | null;
  /** A design question opened from a matched room's summary, to change it. */
  peek: string | null;
}

/** A change waiting for the linked-rooms choice. */
export interface Pending {
  readonly key: string;
  readonly value: Answer;
  readonly mode: 'source' | 'follower' | 'suggested';
  /** follower: the room at the top of the chain the change goes to. */
  readonly root: number;
  /** The room this one follows (follower, suggested). */
  readonly from: number;
  /** Rooms that change too with "Match currently linked rooms". */
  readonly others: readonly number[];
  /** source: the rooms following this one directly, which stop matching with "change only". */
  readonly direct: readonly number[];
}

export interface IntakeState {
  readonly version: 1;
  rooms: RoomState[];
  /** The room on screen. */
  room: number;
  pending: Pending | null;
}

export interface Option {
  readonly id: string;
  readonly label: string;
  readonly desc?: string;
  readonly hex?: string;
  /** Recommended (matching an earlier room, from the third room on). */
  readonly rec?: boolean;
  /** For a suggested design: the design answers it stands for. */
  readonly answers?: Readonly<Record<string, Answer>>;
  readonly def?: OptionDef;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

export function newRoom(id: string, firstStep: string): RoomState {
  return { id, answers: {}, cur: firstStep, done: false, copied: false, unlinked: null, peek: null };
}

/** A fresh intake: just the primary room. */
export function startIntake(def: Definition, primaryRoomId: string): IntakeState {
  const first = def.steps.find((s) => s.rooms === 'primary' || s.rooms === 'all' || s.rooms === 'design');
  return { version: 1, rooms: [newRoom(primaryRoomId, first?.id ?? 'review')], room: 0, pending: null };
}

const DECIMAL = /^(\d+(\.\d*)?|\.\d+)$/;
/** "9.25" → [925, 100], exactly. */
function decimal(text: string): [number, number] | null {
  if (!DECIMAL.test(text)) return null;
  const [whole = '', frac = ''] = text.split('.');
  const num = Number(`${whole || '0'}${frac}`);
  const den = 10 ** frac.length;
  return Number.isSafeInteger(num) && Number.isSafeInteger(den) ? [num, den] : null;
}

/**
 * A typed height (feet and inches, decimals allowed, owner 2026-11-08) as an exact length in the
 * base unit. Refused when it isn't on a 1/64 inch mark (rule 11), with a plain reason.
 */
export function heightLength(v: { ft: string; in: string }): Result<Length> {
  const ft = decimal(v.ft.trim());
  const inchText = v.in.trim() === '' ? '0' : v.in.trim();
  const inch = decimal(inchText);
  if (!ft || !inch) return refuse('Enter feet, and inches under 12. Decimals are fine.');
  if (ft[0] === 0) return refuse('Enter the ceiling height in feet.');
  if (inch[0] / inch[1] >= 12) return refuse('Inches must be under 12.');
  // ft × 12 + in, over a common denominator.
  const den = ft[1] * inch[1];
  const num = ft[0] * 12 * inch[1] + inch[0] * ft[1];
  const length = fromInches(0, num, den);
  if (!length.ok) return refuse(`That height isn't on a 1/64 inch mark. Try a value like 9.5 ft, or 8 ft 6.25 in.`);
  return length;
}

export class Intake {
  /** The room being worked on (changed temporarily by `inRoom`). */
  private ri: number;

  constructor(
    readonly def: Definition,
    readonly state: IntakeState,
  ) {
    this.ri = state.room;
  }

  // ───────────────────────── rooms ─────────────────────────

  get roomIndex(): number {
    return this.ri;
  }
  private get room(): RoomState {
    const r = this.state.rooms[this.ri];
    if (!r) throw new Error(`Room ${this.ri} doesn't exist.`);
    return r;
  }
  private get a(): Record<string, Answer> {
    return this.room.answers;
  }

  /** Runs `fn` as if room `i` were on screen. */
  inRoom<T>(i: number, fn: () => T): T {
    const before = this.ri;
    this.ri = i;
    try {
      return fn();
    } finally {
      this.ri = before;
    }
  }

  isPrimary(): boolean {
    return this.ri === 0;
  }

  roomName(i = this.ri): string {
    if (i === 0) return this.def.intake.primary_room.label;
    const type = this.state.rooms[i]?.answers['room_type'];
    const t = this.def.intake.room_types.types.find((x) => x.id === type);
    return t ? t.label : 'New room';
  }

  /** The room types this room may still be: each type once per job. */
  private roomTypes(): Option[] {
    return this.def.intake.room_types.types
      .filter((t) => !this.state.rooms.some((r, i) => i !== this.ri && r.answers['room_type'] === t.id))
      .map((t) => ({ id: t.id, label: t.label }));
  }

  roomComplete(i: number): boolean {
    return this.inRoom(i, () => {
      const c = this.carried();
      return this.steps().every((s) => s.review === true || this.missing(s) === null) && (c === null || c.fields.every((f) => this.label(f) !== null));
    });
  }

  // ───────────────────────── conditions ─────────────────────────

  private hasIsland(): boolean {
    if (!this.isPrimary()) return false;
    const shape = this.def.fields.get('shape');
    const v = shape ? this.eff(shape) : undefined;
    return !!shape?.options?.find((o) => o.id === v)?.island;
  }

  cond(c: Cond | undefined): boolean {
    if (!c) return true;
    if ('all' in c) return c.all.every((x) => this.cond(x));
    if ('any' in c) return c.any.some((x) => this.cond(x));
    if ('room' in c) {
      if (c.room === 'primary') return this.ri === 0;
      if (c.room === 'other') return this.ri > 0;
      if (c.room === 'second') return this.ri === 1;
      return this.ri >= 2;
    }
    if ('island' in c) return this.hasIsland();
    if ('copied' in c) return !this.isPrimary() && this.room.copied;
    if ('answered' in c) return this.effKey(c.answered) !== undefined;
    if ('primary_answered' in c) return this.inRoom(0, () => this.effKey(c.primary_answered) !== undefined);
    const v = this.effKey(c.key);
    if ('has' in c) return Array.isArray(v) && v.includes(c.has);
    if ('not_in' in c) return typeof v !== 'string' || !c.not_in.includes(v);
    return typeof v === 'string' && c.in.includes(v);
  }

  // ───────────────────────── text ─────────────────────────

  text(t: TextVariants | undefined): string {
    if (t === undefined) return '';
    const raw = typeof t === 'string' ? t : (t.find((v) => this.cond(v.when)) ?? t[t.length - 1])?.text ?? '';
    return this.fill(raw);
  }

  private fill(raw: string, extra: Readonly<Record<string, string>> = {}): string {
    return raw.replace(/\{([a-z_]+)(?::([a-z0-9_.]+))?\}/g, (whole, name: string, arg: string | undefined) => {
      if (name in extra) return extra[name] ?? whole;
      if (name === 'room') return lower(this.roomName());
      if (name === 'primary') return lower(this.roomName(0));
      if (name === 'basis_room') {
        const src = this.basisSource();
        return src === null ? 'earlier room' : lower(this.roomName(src));
      }
      if (name === 'material' || name === 'feel_door') {
        const key = name === 'material' ? 'material' : 'feel';
        const f = this.def.fields.get(key);
        const o = f ? this.options(f).find((x) => x.id === this.eff(f)) : undefined;
        return o ? (name === 'material' ? lower(o.label) : (o.def?.door_name ?? lower(o.label))) : '';
      }
      if (name === 'primary_answer' && arg) {
        const f = this.def.fields.get(arg);
        return (f && this.inRoom(0, () => this.label(f))) ?? '';
      }
      return whole;
    });
  }

  // ───────────────────────── options and answers ─────────────────────────

  private material(): 'painted' | 'wood' {
    return this.effKey('material') === 'wood' ? 'wood' : 'painted';
  }
  private doorTones(): readonly ToneDef[] {
    return this.def.colours.door_palettes[this.material()];
  }
  private toneParts(v: Answer | undefined): { d: ToneDef; c: ToneDef } | null {
    if (typeof v !== 'string') return null;
    const [d, c] = v.split('.');
    const dt = this.doorTones().find((t) => t.id === d);
    const ct = this.def.colours.counter_tones.find((t) => t.id === c);
    return dt && ct ? { d: dt, c: ct } : null;
  }
  private doorSubs(t: ToneDef): Option[] {
    return t.subs.map((hex, i) => ({ id: `${this.material()}.${t.id}.${i + 1}`, label: `${t.label} ${i + 1}`, hex }));
  }

  /** The colour a door or counter colour ID stands for, from any palette. */
  hexOf(id: Answer | undefined): string | null {
    if (typeof id !== 'string') return null;
    const [kind, tone, n] = id.split('.');
    const idx = Number(n) - 1;
    if (kind === 'counter') return this.def.colours.counter_tones.find((t) => t.id === tone)?.subs[idx] ?? null;
    const pal = kind === 'painted' || kind === 'wood' ? this.def.colours.door_palettes[kind] : null;
    return pal?.find((t) => t.id === tone)?.subs[idx] ?? this.def.colours.finishes.find((f) => f.id === id)?.hex ?? null;
  }

  options(f: FieldDef): Option[] {
    const fromDefs = (list: readonly OptionDef[]): Option[] =>
      list
        .filter((o) => this.cond(o.when))
        .map((o) => {
          const out: Option = { id: o.id, label: this.fill(o.label), def: o, ...(o.desc ? { desc: o.desc } : {}) };
          return out;
        });
    if (f.options) return fromDefs(f.options);
    switch (f.source) {
      case 'counts':
        return fromDefs(this.def.lists.counts);
      case 'trim_colours':
        return fromDefs(this.def.lists.trim_colours);
      case 'finishes':
        return this.def.colours.finishes.map((x) => ({ id: x.id, label: x.label, hex: x.hex }));
      case 'room_types':
        return this.roomTypes();
      case 'tones':
        return this.doorTones().flatMap((d) =>
          this.def.colours.counter_tones.map((c) => ({ id: `${d.id}.${c.id}`, label: `${d.label} doors`, desc: `${c.label} counters` })),
        );
      case 'all_doors':
        return this.doorTones().flatMap((t) => this.doorSubs(t));
      case 'tone_doors':
      case 'tone_counters': {
        const tp = this.toneParts(this.effKey('colour_tone'));
        if (!tp) return [];
        if (f.source === 'tone_doors') return this.doorSubs(tp.d);
        return tp.c.subs.map((hex, i) => ({ id: `counter.${tp.c.id}.${i + 1}`, label: `${tp.c.label} ${i + 1}`, hex }));
      }
      case 'earlier_rooms':
        return this.state.rooms
          .slice(0, this.ri)
          .map((r, i) => ({ id: r.id, label: this.roomName(i), i }))
          .filter((o) => this.roomComplete(o.i))
          .map(({ id, label }) => ({ id, label }));
      case 'presets': {
        const kind = this.effKey('design_basis');
        return kind === 'coordinate' || kind === 'contrast' ? this.suggestions(kind) : [];
      }
      case 'basis':
        return this.basisOptions();
      case undefined:
        return [];
    }
  }

  private basisOptions(): Option[] {
    const b = this.def.intake.basis_options;
    const primary = lower(this.roomName(0));
    const scratch: Option = { id: 'scratch', label: b.scratch.label, desc: b.scratch.desc };
    const own: Option[] = this.room.unlinked
      ? [{ id: 'own', label: b.own.label, desc: this.fill(b.own.desc, { unlinked: this.room.unlinked }) }]
      : [];
    if (this.ri === 1) {
      const first = this.state.rooms[0];
      if (!first) return [scratch];
      return [
        { id: `match.${first.id}`, label: this.fill(b.match.label, { target: primary }), desc: b.match.desc },
        { id: 'coordinate', label: this.fill(b.coordinate_primary.label), desc: b.coordinate_primary.desc },
        { id: 'contrast', label: this.fill(b.contrast_primary.label), desc: b.contrast_primary.desc },
        ...own,
        scratch,
      ];
    }
    const matches: Option[] = this.state.rooms
      .slice(0, this.ri)
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => this.roomComplete(i))
      .map(({ r, i }) => ({ id: `match.${r.id}`, label: this.fill(b.match.label, { target: lower(this.roomName(i)) }), desc: b.match.desc, rec: true }));
    return [
      ...matches,
      { id: 'coordinate', label: b.coordinate_other.label, desc: b.coordinate_other.desc },
      { id: 'contrast', label: b.contrast_other.label, desc: b.contrast_other.desc },
      ...own,
      scratch,
    ];
  }

  isValid(f: FieldDef, v: Answer | undefined): boolean {
    if (v === undefined) return false;
    if (f.type === 'text') return typeof v === 'string' && v.trim().length > 0;
    if (f.type === 'height') return typeof v === 'object' && !Array.isArray(v) && heightLength(v as { ft: string; in: string }).ok;
    const os = this.options(f);
    if (f.type === 'multi') return Array.isArray(v) && v.length > 0 && v.every((x) => os.some((o) => o.id === x));
    return typeof v === 'string' && os.some((o) => o.id === v);
  }

  /**
   * The answer in force: the client's pick if it is still a valid choice, else the owner's
   * stated default, else nothing. No other defaults (rule 7).
   */
  eff(f: FieldDef): Answer | undefined {
    const v = this.a[f.key];
    if (this.isValid(f, v)) return v;
    const d = f.default;
    const value = typeof d === 'string' ? d : d?.find((x) => this.cond(x.when))?.value;
    return value !== undefined && this.isValid(f, value) ? value : undefined;
  }
  effKey(key: string): Answer | undefined {
    const f = this.def.fields.get(key);
    return f ? this.eff(f) : this.a[key];
  }

  /** The answer in words, or null when there is none. */
  label(f: FieldDef): string | null {
    const v = this.eff(f);
    if (v === undefined) return null;
    if (f.type === 'text') return typeof v === 'string' ? v.trim() : null;
    if (f.type === 'height') {
      if (typeof v !== 'object' || Array.isArray(v)) return null;
      const h = v as { ft: string; in: string };
      return h.in.trim() === '' ? `${h.ft.trim()}′` : `${h.ft.trim()}′ ${h.in.trim()}″`;
    }
    const os = this.options(f);
    if (Array.isArray(v)) return os.filter((o) => v.includes(o.id)).map((o) => o.label).join(', ');
    if (f.key === 'ceiling_height' && v === 'other') {
      const entered = this.def.fields.get('ceiling_height_entered');
      const l = entered ? this.label(entered) : null;
      if (l) return l;
    }
    const o = os.find((x) => x.id === v);
    if (!o) return null;
    return f.source === 'tones' && o.desc ? `${o.label}, ${lower(o.desc)}` : o.label;
  }

  // ───────────────────────── steps ─────────────────────────

  private stepInRoom(s: StepDef): boolean {
    if (s.rooms === 'all') return true;
    if (this.isPrimary()) return s.rooms !== 'other';
    if (s.rooms === 'primary') return false;
    if (s.rooms === 'design') {
      const b = this.effKey('design_basis');
      return b === 'scratch' || b === 'own' || this.room.peek === s.id;
    }
    return true;
  }

  steps(): StepDef[] {
    return this.def.steps.filter((s) => this.stepInRoom(s) && this.cond(s.when));
  }
  fields(s: StepDef): FieldDef[] {
    return s.fields.filter((f) => this.cond(f.when));
  }

  /** The first thing still missing on a step, in words, or null. */
  missing(s: StepDef): string | null {
    for (const f of this.fields(s)) {
      if (this.eff(f) !== undefined) continue;
      if (f.type === 'height') {
        const v = this.a[f.key];
        if (typeof v === 'object' && !Array.isArray(v)) {
          const h = v as { ft: string; in: string };
          if (h.ft.trim() !== '' || h.in.trim() !== '') {
            const r = heightLength(h);
            if (!r.ok) return r.reason;
          }
        }
        return 'Enter the ceiling height to continue';
      }
      if (f.type === 'text') return `Say ${f.ask ?? lower(f.label ?? 'this')} to continue`;
      return `Choose ${f.ask ?? lower(f.label ?? f.short ?? 'an option')} to continue`;
    }
    return null;
  }

  current(): { steps: StepDef[]; index: number; step: StepDef } {
    const steps = this.steps();
    let index = steps.findIndex((s) => s.id === this.room.cur);
    if (index < 0) {
      // The step is no longer shown (an answer changed): go to the nearest one before it.
      const order = this.def.steps.findIndex((s) => s.id === this.room.cur);
      const after = steps.findIndex((s) => this.def.steps.indexOf(s) > order);
      index = after < 0 ? steps.length - 1 : Math.max(0, after - 1);
      const step = steps[index];
      if (step) this.room.cur = step.id;
    }
    const step = steps[index];
    if (!step) throw new Error('The intake has no steps to show.');
    return { steps, index, step };
  }

  go(stepId: string): void {
    const designStep = this.def.steps.find((s) => s.id === stepId)?.rooms === 'design';
    const b = this.effKey('design_basis');
    this.room.peek = !this.isPrimary() && designStep && b !== 'scratch' && b !== 'own' ? stepId : null;
    this.room.cur = stepId;
  }
  next(): boolean {
    const { steps, index, step } = this.current();
    const after = steps[index + 1];
    if (this.missing(step) !== null || !after) return false;
    this.go(after.id);
    return true;
  }
  back(): boolean {
    const { steps, index } = this.current();
    const before = steps[index - 1];
    if (!before) return false;
    this.go(before.id);
    return true;
  }

  /** Finish the room. Refused (with the reason) while anything is missing. */
  finish(): Result<true> {
    if (!this.roomComplete(this.ri)) return refuse(`The ${lower(this.roomName())} still has choices missing.`);
    this.room.done = true;
    return ok(true);
  }

  addRoom(id: string): void {
    const first = this.def.steps.find((s) => s.rooms === 'other');
    this.state.rooms.push(newRoom(id, first?.id ?? 'review'));
    this.switchRoom(this.state.rooms.length - 1);
  }

  switchRoom(i: number): void {
    if (!this.state.rooms[i]) return;
    this.state.room = i;
    this.ri = i;
    this.room.peek = null;
    this.applyBasis();
  }

  // ───────────────────────── basing a room on another ─────────────────────────

  /** The room a coordinate or contrast suggestion is based on (the primary room for the second room). */
  basisSource(): number | null {
    if (this.ri === 1) return 0;
    const id = this.effKey('basis_room');
    const i = this.state.rooms.findIndex((r) => r.id === id);
    return i >= 0 && i < this.ri ? i : null;
  }

  /** The design answers of the room on screen (with defaults in force). */
  private design(): Record<string, Answer> {
    const out: Record<string, Answer> = {};
    for (const k of this.def.designKeys) {
      const v = this.effKey(k);
      if (v !== undefined) out[k] = clone(v);
    }
    return out;
  }

  /** Coordinate or contrast suggestions, worked out from the room they are based on (stand-in, IK-13). */
  suggestions(kind: 'coordinate' | 'contrast', src = this.basisSource()): Option[] {
    if (src === null || !this.state.rooms[src]) return [];
    const d = this.inRoom(src, () => this.design());
    const tone = typeof d['colour_tone'] === 'string' ? d['colour_tone'].split('.') : null;
    const cab = typeof d['cabinet_colour'] === 'string' ? d['cabinet_colour'].split('.') : null;
    if (!tone || !cab || tone.length !== 2 || cab.length !== 3) return [];
    const [doorTone = '', counterTone = ''] = tone;
    const mat: 'painted' | 'wood' = d['material'] === 'wood' ? 'wood' : 'painted';
    const P = this.def.presets;
    const order = P.tone_order;
    const ti = order.indexOf(doorTone);
    const style = typeof d['door_style'] === 'string' ? d['door_style'] : typeof d['feel'] === 'string' ? d['feel'] : null;
    if (ti < 0 || !style) return [];
    const n = Number(cab[2]);

    const withTone = (from: Record<string, Answer>, t: string, shift = 0, m: 'painted' | 'wood' = mat): Record<string, Answer> | null => {
      const subs = this.def.colours.door_palettes[m].find((x) => x.id === t)?.subs.length;
      if (!subs) return null;
      const o = clone(from);
      o['colour_tone'] = `${t}.${counterTone}`;
      o['cabinet_colour'] = `${m}.${t}.${((n - 1 + shift) % subs) + 1}`;
      o['base_colour_mode'] = 'match';
      delete o['base_colour'];
      return o;
    };
    const otherMaterial = (from: Record<string, Answer>): Record<string, Answer> => {
      const m = mat === 'wood' ? 'painted' : 'wood';
      const o = clone(from);
      o['material'] = m;
      for (const [k, v] of Object.entries(o)) {
        const f = this.def.fields.get(k);
        if ((f?.source === 'all_doors' || f?.source === 'tone_doors') && typeof v === 'string') {
          const parts = v.split('.');
          if (parts.length === 3) o[k] = `${m}.${parts[1]}.${parts[2]}`;
        }
      }
      return o;
    };
    const opposite = order[order.length - 1 - ti];
    const neighbour = order[ti < order.length - 1 ? ti + 1 : ti - 1];

    const make = (change: string): Record<string, Answer> | null => {
      switch (change) {
        case 'next_colour':
          return withTone(d, doorTone, 1);
        case 'sister_style': {
          const s = P.sister_style[style];
          return s ? { ...clone(d), door_style: s } : null;
        }
        case 'neighbour_tone':
          return neighbour ? withTone(d, neighbour) : null;
        case 'opposite_tone':
          return opposite ? withTone(d, opposite) : null;
        case 'other_material':
          return otherMaterial(d);
        case 'opposite_style': {
          const s = P.contrast_style[style];
          const o = opposite ? withTone(d, opposite) : null;
          return s && o ? { ...o, door_style: s } : null;
        }
        default:
          return null;
      }
    };
    const list = kind === 'coordinate' ? P.coordinate : P.contrast;
    return list.flatMap((p) => {
      const answers = make(p.change);
      return answers ? [{ id: p.id, label: p.label, desc: p.desc, answers }] : [];
    });
  }

  /** The room this one follows, if any. */
  sourceOf(i: number): { kind: 'match' | 'suggested'; from: number } | null {
    const r = this.state.rooms[i];
    if (!r || i === 0) return null;
    const b = this.inRoom(i, () => this.effKey('design_basis'));
    if (typeof b !== 'string') return null;
    if (b.startsWith('match.')) {
      const from = this.state.rooms.findIndex((x) => x.id === b.slice(6));
      return from >= 0 && from < i ? { kind: 'match', from } : null;
    }
    if (b === 'coordinate' || b === 'contrast') {
      const from = this.inRoom(i, () => this.basisSource());
      return from === null ? null : { kind: 'suggested', from };
    }
    return null;
  }

  /**
   * Copies the design into a room that matches another room or follows a suggestion. Runs
   * whenever the room is opened, so a matched room follows its source. Inserts and heights are
   * the room's own and are never copied.
   */
  applyBasis(): void {
    if (this.isPrimary()) return;
    const b = this.effKey('design_basis');
    if (b === 'own') return;
    if (b === 'scratch') {
      if (this.room.copied) {
        for (const k of this.def.designKeys) delete this.a[k];
        this.room.copied = false;
      }
      return;
    }
    let d: Record<string, Answer> | null = null;
    const src = this.sourceOf(this.ri);
    if (src?.kind === 'match') d = this.inRoom(src.from, () => this.design());
    else if (src?.kind === 'suggested' && (b === 'coordinate' || b === 'contrast')) {
      const p = this.suggestions(b).find((x) => x.id === this.effKey('design_preset'));
      d = p?.answers ? clone(p.answers) : null;
    }
    for (const k of this.def.designKeys) delete this.a[k];
    this.room.copied = false;
    if (d) {
      Object.assign(this.a, d);
      this.room.copied = true;
    }
  }

  private reapplyAll(): void {
    for (let i = 1; i < this.state.rooms.length; i++) this.inRoom(i, () => this.applyBasis());
  }

  /** What a matched or suggested room copied, and from where; null for a room with its own design. */
  carried(): { from: string; fields: FieldDef[] } | null {
    if (this.isPrimary()) return null;
    const src = this.sourceOf(this.ri);
    if (!src) return null;
    let from = this.roomName(src.from);
    if (src.kind === 'suggested') {
      const b = this.effKey('design_basis');
      const p = b === 'coordinate' || b === 'contrast' ? this.suggestions(b).find((x) => x.id === this.effKey('design_preset')) : undefined;
      if (!p) return null;
      from = `${from}, ${lower(p.label)}`;
    }
    const fields = this.def.steps
      .filter((s) => s.rooms === 'design' && this.cond(s.when))
      .flatMap((s) => this.fields(s));
    return { from, fields };
  }

  // ───────────────────────── changing answers ─────────────────────────

  private dependents(i: number): number[] {
    return this.state.rooms.flatMap((_, j) => (this.sourceOf(j)?.from === i ? [j] : []));
  }
  private allDependents(i: number): number[] {
    const out: number[] = [];
    const queue = [i];
    while (queue.length) {
      const x = queue.shift() as number;
      for (const d of this.dependents(x)) {
        if (out.includes(d)) continue;
        out.push(d);
        queue.push(d);
      }
    }
    return out;
  }
  private rootOf(i: number): number {
    let s = this.sourceOf(i);
    while (s?.kind === 'match') {
      i = s.from;
      s = this.sourceOf(i);
    }
    return i;
  }

  /** Whether changing a design answer here affects other rooms, and how. */
  private links(key: string, value: Answer): Pending | null {
    const i = this.ri;
    const s = this.sourceOf(i);
    if (s) {
      const root = this.rootOf(i);
      if (s.kind === 'suggested' || this.sourceOf(root) !== null) {
        return { key, value, mode: 'suggested', root: i, from: s.from, others: [], direct: [] };
      }
      return { key, value, mode: 'follower', root, from: s.from, others: [root, ...this.allDependents(root)].filter((x) => x !== i), direct: [] };
    }
    const all = this.allDependents(i);
    return all.length ? { key, value, mode: 'source', root: i, from: i, others: all, direct: this.dependents(i) } : null;
  }

  /**
   * Sets an answer. A design answer that other rooms are linked to is held back as `pending`
   * until the person chooses what happens to the linked rooms (`resolve`).
   */
  pick(key: string, value: Answer): void {
    const f = this.def.fields.get(key);
    if (!f) return;
    let v = value;
    if (f.type === 'multi' && typeof value === 'string') {
      const cur = Array.isArray(this.a[key]) ? [...(this.a[key] as readonly string[])] : [];
      const j = cur.indexOf(value);
      if (j >= 0) cur.splice(j, 1);
      else cur.push(value);
      v = cur;
    }
    if (this.def.designKeys.includes(key) && !same(this.eff(f), v)) {
      const p = this.links(key, v);
      if (p) {
        this.state.pending = p;
        return;
      }
    }
    this.set(key, v);
  }

  private set(key: string, v: Answer): void {
    this.a[key] = v;
    this.room.done = false;
    if (key === 'design_basis' || key === 'design_preset' || key === 'basis_room') this.applyBasis();
    if (this.def.designKeys.includes(key)) this.reapplyAll();
  }

  /** Typing: a text answer or one part of a height. Linked rooms follow a source room's typing. */
  type(key: string, text: string, part?: 'ft' | 'in'): void {
    if (part) {
      const cur = this.a[key];
      const h = typeof cur === 'object' && !Array.isArray(cur) ? (cur as { ft: string; in: string }) : { ft: '', in: '' };
      this.a[key] = { ...h, [part]: text };
    } else this.a[key] = text;
    this.room.done = false;
    if (this.def.designKeys.includes(key) && this.sourceOf(this.ri) === null) this.reapplyAll();
  }

  private unlink(j: number, from: number): void {
    this.inRoom(j, () => {
      this.a['design_basis'] = 'own';
      delete this.a['design_preset'];
      this.room.copied = false;
      this.room.peek = null;
      this.room.unlinked = lower(this.roomName(from));
    });
  }

  /** The linked-rooms choice: change them all, change only this room, or cancel. */
  resolve(choice: 'all' | 'one' | 'cancel'): void {
    const p = this.state.pending;
    this.state.pending = null;
    if (!p || choice === 'cancel') return;
    if (p.mode === 'source') {
      if (choice === 'one') for (const d of p.direct) this.unlink(d, this.ri);
      this.a[p.key] = p.value;
    } else if (p.mode === 'follower' && choice === 'all') {
      this.inRoom(p.root, () => {
        this.a[p.key] = p.value;
        this.room.done = false;
      });
    } else {
      this.unlink(this.ri, p.from);
      this.a[p.key] = p.value;
    }
    this.room.done = false;
    this.reapplyAll();
  }

  /** The words for a pending change: "Changing cabinets to White 4." */
  pendingText(): { change: string; intro: string; all: string | null; one: string; oneDetail: string } | null {
    const p = this.state.pending;
    if (!p) return null;
    const f = this.def.fields.get(p.key);
    if (!f) return null;
    const os = this.options(f);
    const pv = p.value;
    const valueLabel = Array.isArray(pv)
      ? os.filter((o) => (pv as readonly string[]).includes(o.id)).map((o) => o.label).join(', ')
      : ((o) => (o ? (f.source === 'tones' && o.desc ? `${o.label}, ${lower(o.desc)}` : o.label) : String(p.value)))(os.find((o) => o.id === p.value));
    const names = (ix: readonly number[]): string => {
      const n = ix.map((i) => this.roomName(i));
      return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
    };
    const verb = (ix: readonly number[], one: string, many: string): string => (ix.length > 1 ? many : one);
    const rn = lower(this.roomName());
    const change = `Changing ${lower(f.short ?? f.label ?? f.key)} to ${valueLabel}.`;
    if (p.mode === 'source') {
      return {
        change,
        intro: `${names(p.others)} ${verb(p.others, 'is', 'are')} linked to this ${rn}.`,
        all: `${names(p.others)} ${verb(p.others, 'changes', 'change')} too.`,
        one: `Change only the ${rn}`,
        oneDetail: `${names(p.direct)} ${verb(p.direct, 'keeps its', 'keep their')} current design and ${verb(p.direct, 'stops', 'stop')} matching.`,
      };
    }
    if (p.mode === 'follower') {
      return {
        change,
        intro: `This ${rn} matches the ${lower(this.roomName(p.from))}.`,
        all: `${names(p.others)} ${verb(p.others, 'changes', 'change')} too.`,
        one: `Change only the ${rn}`,
        oneDetail: `It keeps its other choices and stops matching the ${lower(this.roomName(p.from))}.`,
      };
    }
    return {
      change,
      intro: `This ${rn} is based on a suggested design from the ${lower(this.roomName(p.from))}, so the change can’t be sent back to it.`,
      all: null,
      one: `Change only the ${rn}`,
      oneDetail: 'It keeps its other choices and stops following the suggested design.',
    };
  }
}
