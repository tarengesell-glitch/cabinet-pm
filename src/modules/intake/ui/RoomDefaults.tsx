'use client';
/**
 * A room's design choices as a compact list of editable defaults, for the design studio's
 * customize screen (owner, 2026-11-13: "Put all the Room defaults and make them editable").
 *
 * Every change goes through the intake's own rules (`Intake.pick` / `Intake.type`), so linked
 * rooms ask the same "Match currently linked rooms / change only this room" question as the
 * design choices screen. The room's identity questions (its type, and which room it is based on)
 * stay on the design choices screen. A room that was finished stays finished while every choice
 * is still answered.
 */
import { useState, type ReactNode } from 'react';
import { can, type User } from '@/platform/index';
import { DEFINITION, type Definition, type FieldDef } from '../model/definition';
import { Intake, type IntakeState } from '../model/engine';
import { LinkedRooms } from './IntakeScreen';
import { saveState } from './storage';
import s from './RoomDefaults.module.css';

export interface RoomDefaultsProps {
  readonly user: User;
  /** The job whose answers these are; each job keeps its own. */
  readonly job: string | null;
  readonly roomId: string;
  /** The whole intake state, as the studio holds it. */
  readonly state: IntakeState;
  /** Called with the changed state after it is saved. */
  readonly onChange: (state: IntakeState) => void;
  /** Opens the full design choices screen. */
  readonly onOpenChoices: () => void;
}

/** Choice types answered with one option. */
const SINGLE = new Set(['image', 'cards', 'chips', 'swatch', 'count']);

export function RoomDefaults(props: RoomDefaultsProps) {
  const [problem, setProblem] = useState<string | null>(null);
  if (!DEFINITION.ok) return <p className={s.error}>The design choices can’t be read: {DEFINITION.reason}</p>;
  return <Defaults {...props} def={DEFINITION.value} problem={problem} setProblem={setProblem} />;
}

function Defaults({ user, job, roomId, state, onChange, onOpenChoices, def, problem, setProblem }: RoomDefaultsProps & { def: Definition; problem: string | null; setProblem: (p: string | null) => void }) {
  const canEdit = can(user, 'room.edit');
  const i = state.rooms.findIndex((r) => r.id === roomId);
  if (i < 0) return <p className={s.error}>This room is not in the design choices.</p>;

  /** Every change: on a copy, in this room; a finished room stays finished while nothing is missing. */
  const act = (fn: (x: Intake) => void) => {
    if (!canEdit) return;
    const copy = JSON.parse(JSON.stringify(state)) as IntakeState;
    const x = new Intake(def, copy);
    if (copy.room !== i) x.switchRoom(i);
    const wasDone = copy.rooms[i]?.done === true;
    fn(x);
    if (wasDone && !copy.pending && x.roomComplete(i)) x.finish();
    const failed = saveState(copy, job);
    setProblem(failed);
    if (!failed) onChange(copy);
  };

  // Read in this room (the rows read it as they draw, so the room is the reader's own).
  const x = new Intake(def, { ...state, room: i });
  const rows: { section: string; f: FieldDef }[] = [];
  for (const st of x.steps()) {
    // The room's type and what it is based on stay on the design choices screen.
    if (st.review || st.rooms === 'other') continue;
    for (const f of x.fields(st)) if (f.in_summary !== false || f.type === 'height') rows.push({ section: st.section, f });
  }
  const c = x.carried();
  if (c) for (const f of c.fields) rows.push({ section: `Design from ${c.from}`, f });

  const groups: { section: string; rows: ReactNode[] }[] = [];
  for (const { section, f } of rows) {
    let g = groups[groups.length - 1];
    if (!g || g.section !== section) groups.push((g = { section, rows: [] }));
    g.rows.push(<Row key={f.key} x={x} f={f} canEdit={canEdit} act={act} />);
  }

  return (
    <div className={s.defaults} data-testid="room-defaults">
      <p className={s.hint}>Colours, door style and hardware show in the 3D view at once. Cabinets already placed don’t move: a change to the layout choices is used the next time the AI design step lays out the room.</p>
      {problem && (
        <p className={s.error} role="alert">
          {problem}
        </p>
      )}
      {!canEdit && <p className={s.hint}>You can look but not change these: this needs the “room.edit” permission.</p>}
      {groups.map((g) => (
        <div key={g.section} className={s.group}>
          {g.rows.length > 1 && <div className={s.section}>{g.section}</div>}
          {g.rows}
        </div>
      ))}
      <div>
        <button className={s.link} onClick={onOpenChoices}>
          Open the design choices
        </button>
      </div>
      {state.pending && state.room === i && <LinkedRooms x={x} onChoose={(c) => act((y) => y.resolve(c))} />}
    </div>
  );
}

function Row({ x, f, canEdit, act }: { x: Intake; f: FieldDef; canEdit: boolean; act: (fn: (x: Intake) => void) => void }) {
  const name = f.short ?? f.label ?? f.key;
  const v = x.eff(f);
  const os = x.options(f);
  let control: ReactNode;
  if (SINGLE.has(f.type)) {
    const current = typeof v === 'string' ? v : '';
    const hex = f.type === 'swatch' ? os.find((o) => o.id === current)?.hex : undefined;
    control = (
      <span className={s.pick}>
        {hex && <i className={s.dot} style={{ background: hex }} aria-hidden="true" />}
        <select className={s.select} aria-label={name} value={current} disabled={!canEdit || os.length === 0} onChange={(e) => act((y) => y.pick(f.key, e.target.value))}>
          {current === '' && <option value="">{os.length === 0 ? 'Answer the choice above first' : 'Not answered'}</option>}
          {os.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    );
  } else if (f.type === 'multi') {
    control = (
      <span className={s.chips} role="group" aria-label={name}>
        {os.map((o) => (
          <button key={o.id} className={s.chip} aria-pressed={Array.isArray(v) && v.includes(o.id)} disabled={!canEdit} onClick={() => act((y) => y.pick(f.key, o.id))}>
            {o.label}
          </button>
        ))}
      </span>
    );
  } else if (f.type === 'text') {
    const raw = x.state.rooms[x.roomIndex]?.answers[f.key];
    control = <input className={s.input} aria-label={name} placeholder={f.placeholder} value={typeof raw === 'string' ? raw : ''} disabled={!canEdit} onChange={(e) => act((y) => y.type(f.key, e.target.value))} />;
  } else if (f.type === 'height') {
    const raw = x.state.rooms[x.roomIndex]?.answers[f.key];
    const h = typeof raw === 'object' && !Array.isArray(raw) ? (raw as { ft: string; in: string }) : { ft: '', in: '' };
    control = (
      <span className={s.height}>
        <input className={s.input} inputMode="decimal" aria-label={`${name}, feet`} value={h.ft} disabled={!canEdit} onChange={(e) => act((y) => y.type(f.key, e.target.value, 'ft'))} />
        ft
        <input className={s.input} inputMode="decimal" aria-label={`${name}, inches`} value={h.in} disabled={!canEdit} onChange={(e) => act((y) => y.type(f.key, e.target.value, 'in'))} />
        in
      </span>
    );
  } else return null;
  return (
    <div className={s.row}>
      <span className={s.name}>{name}</span>
      {control}
    </div>
  );
}
