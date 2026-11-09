'use client';
import { useEffect, useRef, useState } from 'react';
import {
  insideLength,
  formatInches,
  type Issue,
  type Measured,
  type Opening,
  type Result,
  type Room,
  type Wall,
  wallLetter,
} from '@/core/index';
import { doorHanding, type OpeningField, type TypedSize, type WallDefaults } from '../model/editor';
import { lengthText } from './format';
import { parseSize } from './parseSize';
import { ProvenanceChip, SizeField } from './SizeField';
import type { Selection } from './PlanCanvas';
import s from './RoomCapture.module.css';

export const KIND_LABEL: Record<Opening['kind'], string> = { window: 'Window', door: 'Door', passthrough: 'Passthrough' };

/** A typed size input for forms (not yet saved). */
function SizeInput({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string | null }) {
  return (
    <label>
      {label}
      <input className={error ? s.inputError : s.input} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <span className={s.error}>{error}</span>}
    </label>
  );
}

/** Reads several typed sizes; returns each one's error, or the values when all are fine. */
function readSizes<K extends string>(texts: Record<K, string>, required: readonly K[]): { values: Partial<Record<K, TypedSize>>; errors: Partial<Record<K, string>> } {
  const values: Partial<Record<K, TypedSize>> = {};
  const errors: Partial<Record<K, string>> = {};
  for (const key of Object.keys(texts) as K[]) {
    const text = texts[key].trim();
    if (text === '') {
      if (required.includes(key)) errors[key] = 'Required.';
      continue;
    }
    const r = parseSize(text);
    if (r.ok) values[key] = r.value;
    else errors[key] = r.reason;
  }
  return { values, errors };
}

function BackToRoom({ onSelect }: { onSelect: (sel: Selection) => void }) {
  return (
    <div className={s.row}>
      <button className={s.button} onClick={() => onSelect(null)}>
        ← Room
      </button>
    </div>
  );
}

export function StartRoomForm({ canEdit, onStart, onExample, initialName = '' }: {
  canEdit: boolean;
  onStart: (input: { name: string; ceiling: TypedSize }) => Result<unknown>;
  onExample: (which: 'kitchen' | 'lshape') => void;
  /** The room's name from the design choices, inside the design studio. */
  initialName?: string;
}) {
  const [name, setName] = useState(initialName);
  const [texts, setTexts] = useState({ ceiling: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof texts | 'name' | 'form', string>>>({});
  const submit = () => {
    const { values, errors: e } = readSizes(texts, ['ceiling']);
    const nameError = name.trim() === '' ? 'Required.' : undefined;
    if (Object.keys(e).length > 0 || nameError) return setErrors({ ...e, ...(nameError ? { name: nameError } : {}) });
    const r = onStart({ name, ceiling: values.ceiling! });
    setErrors(r.ok ? {} : { form: r.reason });
  };
  return (
    <>
      <section className={s.card}>
        <h2 className={s.cardTitle}>Start a room</h2>
        <p className={s.muted}>Use feet and inches (8&apos;, 10&apos; 2 1/4&quot;, 122.25) or millimetres (2440 mm). Walls start at the standard thickness; change it any time.</p>
        <div className={s.formGrid}>
          <label>
            Room name
            <input className={errors.name ? s.inputError : s.input} aria-label="Room name" value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <span className={s.error}>{errors.name}</span>}
          </label>
          <SizeInput label="Ceiling height" value={texts.ceiling} onChange={(v) => setTexts({ ...texts, ceiling: v })} error={errors.ceiling ?? null} />
        </div>
        {errors.form && <p className={s.error} role="alert">{errors.form}</p>}
        <div className={s.row}>
          <button className={s.buttonPrimary} disabled={!canEdit} onClick={submit}>
            Start room
          </button>
        </div>
      </section>
      <section className={s.card}>
        <h2 className={s.cardTitle}>Or try an example</h2>
        <div className={s.row}>
          <button className={s.button} disabled={!canEdit} onClick={() => onExample('kitchen')}>
            Example kitchen (12&apos; × 10&apos;)
          </button>
          <button className={s.button} disabled={!canEdit} onClick={() => onExample('lshape')}>
            Example L-shaped room (45° wall)
          </button>
        </div>
      </section>
    </>
  );
}

export function RoomPanel({ room, wallDefaults, canEdit, onRename, onCeiling, onDefaults, onSelect, onNewRoom }: {
  room: Room;
  wallDefaults: WallDefaults;
  canEdit: boolean;
  onRename: (name: string) => Result<unknown>;
  onCeiling: { set: (v: TypedSize) => Result<unknown>; provenance: (p: Measured['provenance']) => Result<unknown> };
  onDefaults: (field: 'thickness', v: TypedSize) => Result<unknown>;
  onSelect: (sel: Selection) => void;
  onNewRoom: () => void;
}) {
  const [name, setName] = useState(room.name);
  const [nameError, setNameError] = useState<string | null>(null);
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>Room</h2>
      <div className={s.row}>
        <input className={s.input} style={{ flex: 1 }} aria-label="Room name" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
        <button className={s.button} disabled={!canEdit || name === room.name} onClick={() => { const r = onRename(name); setNameError(r.ok ? null : r.reason); }}>
          Rename
        </button>
      </div>
      {nameError && <p className={s.error}>{nameError}</p>}
      <SizeField label="Ceiling height" measured={room.ceiling_height} canEdit={canEdit} onSet={onCeiling.set} onProvenance={onCeiling.provenance} />
      <SizeField label="New walls: thickness" measured={wallDefaults.thickness} canEdit={canEdit} onSet={(v) => onDefaults('thickness', v)} />
      <div>
        <p className={s.muted}>Walls ({room.walls.length})</p>
        <ul className={s.list}>
          {room.walls.map((w, i) => {
            const d = insideLength(room, w);
            return (
              <li key={w.wall_id}>
                <button className={s.listButton} onClick={() => onSelect({ kind: 'wall', id: w.wall_id })}>
                  <span>
                    Wall {wallLetter(i)}: {lengthText(d)}
                    {w.openings.length > 0 && ` · ${w.openings.map((o) => KIND_LABEL[o.kind].toLowerCase()).join(', ')}`}
                  </span>
                  {w.kind === 'floating' ? <span className={s.muted}>Floating</span> : <ProvenanceChip provenance={w.length_provenance} />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className={s.row}>
        <button className={s.buttonDanger} disabled={!canEdit} onClick={onNewRoom}>
          Start a new room…
        </button>
      </div>
    </section>
  );
}

export function WallPanel({ room, wall, canEdit, onSize, onProvenance, onDelete, onSelect, onAddOpening, onKind }: {
  room: Room;
  wall: Wall;
  canEdit: boolean;
  onSize: (field: 'length' | 'thickness', v: TypedSize) => Result<unknown>;
  onProvenance: (field: 'length' | 'thickness', p: Measured['provenance']) => Result<unknown>;
  onDelete: () => void;
  onSelect: (sel: Selection) => void;
  onAddOpening: (kind: Opening['kind']) => void;
  /** Room wall or floating wall (island / peninsula). */
  onKind: (kind: Wall['kind']) => Result<unknown>;
}) {
  const index = room.walls.findIndex((w) => w.wall_id === wall.wall_id);
  const floating = wall.kind === 'floating';
  const [kindError, setKindError] = useState<string | null>(null);
  // Inside length, face to face, as measured on site (owner, 2026-11-09); typing one sets it.
  const d = insideLength(room, wall);
  const lengthMeasured: Measured = { value: d.value, provenance: wall.length_provenance, source_mm: wall.length_source_mm };
  const detail =
    wall.entered_length !== null
      ? `Typed as ${formatInches(wall.entered_length)}${wall.length_source_mm ? ` (${wall.length_source_mm} mm)` : ''}. The corners are rounded to the nearest 1/64".`
      : undefined;
  return (
    <section className={s.card}>
      <BackToRoom onSelect={onSelect} />
      <h2 className={s.cardTitle}>
        Wall {wallLetter(index)} {!floating && <ProvenanceChip provenance={wall.length_provenance} />}
      </h2>
      <div className={s.row} role="group" aria-label="Wall kind">
        {(['room', 'floating'] as const).map((k) => (
          <button
            key={k}
            className={k === wall.kind ? s.buttonActive : s.button}
            aria-pressed={k === wall.kind}
            disabled={!canEdit}
            onClick={() => {
              if (k === wall.kind) return;
              const r = onKind(k);
              setKindError(r.ok ? null : r.reason);
            }}
          >
            {k === 'room' ? 'Room wall' : 'Floating wall'}
          </button>
        ))}
      </div>
      {kindError && <p className={s.error} role="alert">{kindError}</p>}
      <SizeField
        label="Length"
        measured={lengthMeasured}
        display={lengthText(d)}
        {...(detail ? { detail } : {})}
        canEdit={canEdit}
        onSet={(v) => onSize('length', v)}
        // A floating wall's length is where the island or peninsula goes, not a site measurement.
        {...(floating ? {} : { onProvenance: (p: Measured['provenance']) => onProvenance('length', p) })}
      />
      {wall.thickness && (
        <SizeField label="Thickness" measured={wall.thickness} canEdit={canEdit} onSet={(v) => onSize('thickness', v)} onProvenance={(p) => onProvenance('thickness', p)} />
      )}
      {!floating && (
      <div>
        <p className={s.muted}>Doors and windows on this wall</p>
        <ul className={s.list}>
          {wall.openings.map((o, i) => (
            <li key={o.opening_id}>
              <button className={s.listButton} onClick={() => onSelect({ kind: 'opening', id: o.opening_id })}>
                <span>
                  {KIND_LABEL[o.kind]} {i + 1}: {formatInches(o.width.value)} wide
                </span>
              </button>
            </li>
          ))}
          {wall.openings.length === 0 && <li className={s.muted}>None yet.</li>}
        </ul>
        {wall.obstacles.length > 0 && (
          <p className={s.muted}>Also on this wall: {wall.obstacles.map((o) => o.kind).join(', ')} (shown on the plan; editing comes later).</p>
        )}
      </div>
      )}
      {!floating && (
        <div className={s.row}>
          {(['door', 'window', 'passthrough'] as const).map((k) => (
            <button key={k} className={s.button} disabled={!canEdit} onClick={() => onAddOpening(k)}>
              + {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <div className={s.row}>
        <button className={s.buttonDanger} disabled={!canEdit} onClick={onDelete}>
          Delete wall
        </button>
      </div>
    </section>
  );
}

/** Several walls selected at once. */
export function WallsPanel({ room, walls, canEdit, onSelect, onThickness, onDelete }: {
  room: Room;
  walls: readonly Wall[];
  canEdit: boolean;
  onSelect: (sel: Selection) => void;
  onThickness: (v: TypedSize) => Result<unknown>;
  onDelete: () => void;
}) {
  const numbers = walls.map((w) => room.walls.findIndex((x) => x.wall_id === w.wall_id) + 1);
  const roomWalls = walls.filter((w) => w.thickness !== null);
  const thicknesses = new Set(roomWalls.map((w) => w.thickness?.value));
  const first = roomWalls[0] ?? null;
  const doorsAndWindows = walls.reduce((n, w) => n + w.openings.length, 0);
  return (
    <section className={s.card}>
      <BackToRoom onSelect={onSelect} />
      <h2 className={s.cardTitle}>{walls.length} walls selected</h2>
      <p className={s.muted}>Walls {numbers.map((n) => wallLetter(n - 1)).join(', ')}. Shift-click a wall on the plan to add or remove it.</p>
      <ul className={s.list}>
        {walls.map((w, i) => {
          const d = insideLength(room, w);
          return (
            <li key={w.wall_id}>
              <button className={s.listButton} onClick={() => onSelect({ kind: 'wall', id: w.wall_id })}>
                <span>
                  Wall {wallLetter((numbers[i] as number) - 1)}: {lengthText(d)}
                </span>
                {w.kind === 'floating' ? <span className={s.muted}>Floating</span> : <ProvenanceChip provenance={w.length_provenance} />}
              </button>
            </li>
          );
        })}
      </ul>
      {first && (
        <SizeField
          label="Thickness (all selected)"
          measured={thicknesses.size === 1 ? first.thickness : null}
          {...(thicknesses.size === 1 ? {} : { display: 'Mixed' })}
          canEdit={canEdit}
          onSet={onThickness}
        />
      )}
      <div className={s.row}>
        <button className={s.buttonDanger} disabled={!canEdit} onClick={onDelete}>
          Delete {walls.length} walls{doorsAndWindows > 0 ? ` (and ${doorsAndWindows} door${doorsAndWindows === 1 ? '' : 's'}/window${doorsAndWindows === 1 ? '' : 's'} on them)` : ''}
        </button>
      </div>
      <p className={s.muted}>Or press Delete on your keyboard.</p>
    </section>
  );
}

/**
 * The sizes shown for a selected opening (owner, 2026-11-06): no distance from the wall's start
 * (where it sits is set by dragging it, and shown in the measurement chain on the plan), and no
 * sill height for a door, which always starts at the floor.
 */
const openingFields = (kind: Opening['kind']): { field: OpeningField; label: string }[] => [
  { field: 'width', label: 'Width' },
  { field: 'height', label: 'Height' },
  ...(kind === 'door' ? [] : [{ field: 'sill_height' as const, label: 'Sill height' }]),
];

export function OpeningPanel({ room, wall, opening, canEdit, onKind, onSize, onProvenance, onDelete, onSelect, onHanding }: {
  room: Room;
  wall: Wall;
  opening: Opening;
  canEdit: boolean;
  onKind: (k: Opening['kind']) => Result<unknown>;
  onSize: (field: OpeningField, v: TypedSize) => Result<unknown>;
  onProvenance: (field: OpeningField, p: Measured['provenance']) => Result<unknown>;
  onDelete: () => void;
  onSelect: (sel: Selection) => void;
  /** Doors only: set left/right hand and in/out (judged from outside the door). */
  onHanding: (hand: 'left' | 'right', swings: 'in' | 'out') => Result<unknown>;
}) {
  const wallIndex = room.walls.findIndex((w) => w.wall_id === wall.wall_id);
  const handing = opening.swing ? doorHanding(room, opening.swing) : null;
  return (
    <section className={s.card}>
      <BackToRoom onSelect={onSelect} />
      <h2 className={s.cardTitle}>
        {KIND_LABEL[opening.kind]} on{' '}
        <button className={s.button} onClick={() => onSelect({ kind: 'wall', id: wall.wall_id })}>
          wall {wallLetter(wallIndex)}
        </button>
      </h2>
      <div className={s.row}>
        {(['door', 'window', 'passthrough'] as const).map((k) => (
          <button key={k} className={k === opening.kind ? s.buttonActive : s.button} disabled={!canEdit} aria-pressed={k === opening.kind} onClick={() => k !== opening.kind && onKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {handing && (
        <>
          <div className={s.row} role="group" aria-label="Hinge side">
            {(['left', 'right'] as const).map((hand) => (
              <button
                key={hand}
                className={hand === handing.hand ? s.buttonActive : s.button}
                aria-pressed={hand === handing.hand}
                disabled={!canEdit}
                title="As seen from outside the door"
                onClick={() => hand !== handing.hand && onHanding(hand, handing.swings)}
              >
                {hand === 'left' ? 'Left hand' : 'Right hand'}
              </button>
            ))}
          </div>
          <div className={s.row} role="group" aria-label="Swing">
            {(['in', 'out'] as const).map((swings) => (
              <button
                key={swings}
                className={swings === handing.swings ? s.buttonActive : s.button}
                aria-pressed={swings === handing.swings}
                disabled={!canEdit}
                onClick={() => swings !== handing.swings && onHanding(handing.hand, swings)}
              >
                Swings {swings}
              </button>
            ))}
          </div>
        </>
      )}
      {openingFields(opening.kind).map(({ field, label }) => (
        <SizeField key={field} label={label} measured={opening[field]} canEdit={canEdit} onSet={(v) => onSize(field, v)} onProvenance={(p) => onProvenance(field, p)} />
      ))}
      <div className={s.row}>
        <button className={s.buttonDanger} disabled={!canEdit} onClick={onDelete}>
          Delete {KIND_LABEL[opening.kind].toLowerCase()}
        </button>
      </div>
    </section>
  );
}

/**
 * The checks, up in the header (owner, 2026-11-06): one line that says all is well or how many
 * problems there are. The list drops down from it, and opens by itself when a new problem appears.
 * Tapping a problem selects the thing it is about.
 */
export function ChecksMenu({ formatErrors, issues, onSelect }: { formatErrors: readonly string[]; issues: readonly Issue[]; onSelect: (sel: Selection) => void }) {
  const total = formatErrors.length + issues.length;
  const [open, setOpen] = useState(false);
  const before = useRef(total);
  useEffect(() => {
    if (total > before.current) setOpen(true);
    if (total === 0) setOpen(false);
    before.current = total;
  }, [total]);
  return (
    <div className={s.checksMenu} role="region" aria-label="Checks">
      <button className={total === 0 ? s.checksOk : s.checksBad} aria-expanded={open} onClick={() => total > 0 && setOpen((o) => !o)}>
        {total === 0 ? '✓ No problems found' : `⚠ ${total} problem${total > 1 ? 's' : ''} ${open ? '▴' : '▾'}`}
      </button>
      {open && total > 0 && (
        <div className={s.checksDrop}>
          <ul className={s.list}>
            {formatErrors.map((m, i) => (
              <li key={`f${i}`} className={s.error}>
                Format: {m}
              </li>
            ))}
            {issues.map((issue, i) => (
              <li key={i}>
                <button
                  className={s.issue}
                  onClick={() => {
                    const sel: Selection =
                      issue.ref.kind === 'wall' || issue.ref.kind === 'opening' || issue.ref.kind === 'appliance'
                        ? { kind: issue.ref.kind, id: issue.ref.id }
                        : issue.ref.kind === 'run'
                          ? { kind: 'runs', ids: [issue.ref.id] }
                          : null;
                    if (sel) onSelect(sel);
                  }}
                >
                  <span>
                    {issue.severity === 'block' ? '⛔ ' : '⚠ '}
                    {issue.message}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
