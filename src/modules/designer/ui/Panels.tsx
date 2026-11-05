'use client';
import { useState } from 'react';
import {
  angleFromDegrees,
  distanceForDisplay,
  formatInches,
  type Issue,
  type Job,
  type Measured,
  type Opening,
  type Result,
  type Room,
  type Wall,
} from '@/core/index';
import type { OpeningField, TypedSize, WallDefaults } from '../model/editor';
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

export function StartRoomForm({ canEdit, onStart, onExample }: {
  canEdit: boolean;
  onStart: (input: { name: string; ceiling: TypedSize }) => Result<unknown>;
  onExample: (which: 'kitchen' | 'lshape') => void;
}) {
  const [name, setName] = useState('');
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

const DIRECTIONS: { label: string; name: string; angle: number }[] = [
  { label: '→', name: 'right', angle: 0 },
  { label: '↑', name: 'up', angle: 9000 },
  { label: '←', name: 'left', angle: 18000 },
  { label: '↓', name: 'down', angle: 27000 },
  { label: '↗', name: 'up-right', angle: 4500 },
  { label: '↖', name: 'up-left', angle: 13500 },
  { label: '↙', name: 'down-left', angle: 22500 },
  { label: '↘', name: 'down-right', angle: 31500 },
];

/** Type the next wall: its length and which way it goes from the last corner. */
export function AddWallForm({ canEdit, hasWalls, onAdd, onClose }: {
  canEdit: boolean;
  hasWalls: boolean;
  onAdd: (length: TypedSize, angle: number) => Result<unknown>;
  onClose: () => Result<unknown>;
}) {
  const [length, setLength] = useState('');
  const [degrees, setDegrees] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = (angle: number | null) => {
    const l = parseSize(length);
    if (!l.ok) return setError(length.trim() === '' ? 'Type the wall length first.' : l.reason);
    let a = angle;
    if (a === null) {
      const parsed = angleFromDegrees(degrees);
      if (!parsed.ok) return setError(parsed.reason);
      a = parsed.value;
    }
    const r = onAdd(l.value, a);
    if (!r.ok) return setError(r.reason);
    setError(null);
    setLength('');
  };
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>Type the next wall</h2>
      <p className={s.muted}>
        {hasWalls ? 'Starts at the end of the last wall.' : 'The first wall starts at the origin.'} Or draw walls on the plan with “Draw walls”.
      </p>
      <label className={s.muted}>
        Length
        <input className={error ? s.inputError : s.input} aria-label="Next wall length" value={length} onChange={(e) => setLength(e.target.value)} placeholder={`e.g. 12' or 3660 mm`} />
      </label>
      <div className={s.directionGrid}>
        {DIRECTIONS.map((d) => (
          <button key={d.name} className={s.button} disabled={!canEdit} aria-label={`Add wall going ${d.name}`} onClick={() => add(d.angle)}>
            {d.label}
          </button>
        ))}
      </div>
      <div className={s.row}>
        <input className={s.input} style={{ width: 110 }} aria-label="Wall angle in degrees" value={degrees} onChange={(e) => setDegrees(e.target.value)} placeholder="Angle °" />
        <button className={s.button} disabled={!canEdit} onClick={() => add(null)}>
          Add at angle
        </button>
        <button className={s.button} disabled={!canEdit} onClick={() => { const r = onClose(); setError(r.ok ? null : r.reason); }}>
          Close the room
        </button>
      </div>
      <p className={s.muted}>Angles go counter-clockwise from → (so ↑ is 90°).</p>
      {error && <p className={s.error} role="alert">{error}</p>}
    </section>
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
            const d = distanceForDisplay(w.start_point, w.end_point);
            return (
              <li key={w.wall_id}>
                <button className={s.listButton} onClick={() => onSelect({ kind: 'wall', id: w.wall_id })}>
                  <span>
                    Wall {i + 1}: {d.exact ? '' : '≈ '}
                    {formatInches(d.value)}
                    {w.openings.length > 0 && ` · ${w.openings.map((o) => KIND_LABEL[o.kind].toLowerCase()).join(', ')}`}
                  </span>
                  <ProvenanceChip provenance={w.length_provenance} />
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

export function WallPanel({ room, wall, canEdit, onSize, onProvenance, onDelete, onSelect, onAddOpening }: {
  room: Room;
  wall: Wall;
  canEdit: boolean;
  onSize: (field: 'length' | 'thickness', v: TypedSize) => Result<unknown>;
  onProvenance: (field: 'length' | 'thickness', p: Measured['provenance']) => Result<unknown>;
  onDelete: () => void;
  onSelect: (sel: Selection) => void;
  onAddOpening: (kind: Opening['kind']) => void;
}) {
  const index = room.walls.findIndex((w) => w.wall_id === wall.wall_id);
  const d = distanceForDisplay(wall.start_point, wall.end_point);
  const lengthMeasured: Measured = { value: d.value, provenance: wall.length_provenance, source_mm: wall.length_source_mm };
  const detail =
    wall.entered_length !== null
      ? `Typed as ${formatInches(wall.entered_length)}${wall.length_source_mm ? ` (${wall.length_source_mm} mm)` : ''}. The corners are rounded to the nearest 1/64".`
      : undefined;
  return (
    <section className={s.card}>
      <BackToRoom onSelect={onSelect} />
      <h2 className={s.cardTitle}>
        Wall {index + 1} <ProvenanceChip provenance={wall.length_provenance} />
      </h2>
      <SizeField
        label="Length"
        measured={lengthMeasured}
        display={`${d.exact ? '' : 'about '}${formatInches(d.value)}`}
        {...(detail ? { detail } : {})}
        canEdit={canEdit}
        onSet={(v) => onSize('length', v)}
        onProvenance={(p) => onProvenance('length', p)}
      />
      <p className={s.muted}>Typing a length moves this wall&apos;s far corner, and the wall joined to it. Walls are as high as the ceiling.</p>
      <SizeField label="Thickness" measured={wall.thickness} canEdit={canEdit} onSet={(v) => onSize('thickness', v)} onProvenance={(p) => onProvenance('thickness', p)} />
      <div>
        <p className={s.muted}>Doors and windows on this wall</p>
        <ul className={s.list}>
          {wall.openings.map((o, i) => (
            <li key={o.opening_id}>
              <button className={s.listButton} onClick={() => onSelect({ kind: 'opening', id: o.opening_id })}>
                <span>
                  {KIND_LABEL[o.kind]} {i + 1}: {formatInches(o.width.value)} wide, {formatInches(o.offset.value)} from the start
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
      <div className={s.row}>
        {(['door', 'window', 'passthrough'] as const).map((k) => (
          <button key={k} className={s.button} disabled={!canEdit} onClick={() => onAddOpening(k)}>
            + {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className={s.row}>
        <button className={s.buttonDanger} disabled={!canEdit} onClick={onDelete}>
          Delete wall
        </button>
      </div>
    </section>
  );
}

const OPENING_FIELDS: { field: OpeningField; label: string }[] = [
  { field: 'offset', label: 'From wall start' },
  { field: 'width', label: 'Width' },
  { field: 'height', label: 'Height' },
  { field: 'sill_height', label: 'Sill height' },
];

export function OpeningPanel({ room, wall, opening, canEdit, onKind, onSize, onProvenance, onDelete, onSelect }: {
  room: Room;
  wall: Wall;
  opening: Opening;
  canEdit: boolean;
  onKind: (k: Opening['kind']) => Result<unknown>;
  onSize: (field: OpeningField, v: TypedSize) => Result<unknown>;
  onProvenance: (field: OpeningField, p: Measured['provenance']) => Result<unknown>;
  onDelete: () => void;
  onSelect: (sel: Selection) => void;
}) {
  const wallIndex = room.walls.findIndex((w) => w.wall_id === wall.wall_id);
  return (
    <section className={s.card}>
      <BackToRoom onSelect={onSelect} />
      <h2 className={s.cardTitle}>
        {KIND_LABEL[opening.kind]} on{' '}
        <button className={s.button} onClick={() => onSelect({ kind: 'wall', id: wall.wall_id })}>
          wall {wallIndex + 1}
        </button>
      </h2>
      <div className={s.row}>
        {(['door', 'window', 'passthrough'] as const).map((k) => (
          <button key={k} className={k === opening.kind ? s.buttonActive : s.button} disabled={!canEdit} aria-pressed={k === opening.kind} onClick={() => k !== opening.kind && onKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <p className={s.muted}>Drag it along the wall on the plan, or type exact sizes here.</p>
      {OPENING_FIELDS.map(({ field, label }) => (
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

export function ChecksPanel({ formatErrors, issues, onSelect }: { formatErrors: readonly string[]; issues: readonly Issue[]; onSelect: (sel: Selection) => void }) {
  const total = formatErrors.length + issues.length;
  return (
    <section className={s.card} aria-label="Checks">
      <h2 className={s.cardTitle}>Checks {total > 0 && <span className={s.chipRough}>⚠ {total}</span>}</h2>
      {total === 0 && <p className={s.ok}>✓ No problems found</p>}
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
              onClick={() => (issue.ref.kind === 'wall' || issue.ref.kind === 'opening' ? onSelect({ kind: issue.ref.kind, id: issue.ref.id }) : undefined)}
            >
              <span>
                {issue.severity === 'block' ? '⛔ ' : '⚠ '}
                {issue.message}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MasterCopyPanel({ job, onDownload, onLoad }: { job: Job; onDownload: () => void; onLoad: (text: string) => Result<unknown> }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <section className={s.card}>
      <details>
        <summary className={s.cardTitle} style={{ cursor: 'pointer' }}>
          What gets saved (the master copy)
        </summary>
        <p className={s.muted}>This is exactly what the system stores for this room. Sizes are whole numbers of 1/64 inch.</p>
        <pre className={s.json} data-testid="master-copy">
          {JSON.stringify(job, null, 2)}
        </pre>
      </details>
      <div className={s.row}>
        <button className={s.button} onClick={onDownload}>
          Download
        </button>
        <label className={s.fileButton}>
          Load a file…
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const r = onLoad(await file.text());
              setError(r.ok ? null : r.reason);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
    </section>
  );
}
