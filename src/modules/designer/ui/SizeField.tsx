'use client';
import { useState } from 'react';
import { formatInches, type Measured, type Provenance, type Result } from '@/core/index';
import type { TypedSize } from '../model/editor';
import { parseSize } from './parseSize';
import s from './RoomCapture.module.css';

const CHIP: Record<Provenance, { className: string; text: string }> = {
  unmeasured: { className: s.chipRough as string, text: 'Unmeasured' },
  confirmed: { className: s.chipConfirmed as string, text: 'Confirmed' },
};

export function ProvenanceChip({ provenance }: { provenance: Provenance }) {
  const c = CHIP[provenance];
  return (
    <span className={c.className} data-provenance={provenance}>
      {c.text}
    </span>
  );
}

interface Props {
  label: string;
  /** The current size, or null when there isn't one yet. */
  measured: Measured | null;
  /** Shown instead of the exact value (for example "≈ 48 1/16\"" on a slanted wall). */
  display?: string;
  /** Extra detail under the value (for example the length that was typed). */
  detail?: string;
  canEdit: boolean;
  onSet: (size: TypedSize) => Result<unknown>;
  /** Omit for values that have no sureness tag. */
  onProvenance?: (p: Provenance) => Result<unknown>;
}

/** A size: shows it with its sureness tag, edits it by typing, verifies it on purpose. */
export function SizeField({ label, measured, display, detail, canEdit, onSet, onProvenance }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const parsed = parseSize(text);
    if (!parsed.ok) return setError(parsed.reason);
    const r = onSet(parsed.value);
    if (!r.ok) return setError(r.reason);
    setError(null);
    setEditing(false);
  };
  const provenance = (p: Provenance) => {
    if (!onProvenance) return;
    const r = onProvenance(p);
    setError(r.ok ? null : r.reason);
  };

  return (
    <div className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {editing ? (
        <>
          <input
            className={error ? s.inputError : s.input}
            aria-label={label}
            autoFocus
            value={text}
            placeholder={`e.g. 10' 2 1/4" or 600 mm`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <div className={s.row}>
            <button className={s.buttonPrimary} onClick={save}>
              Save
            </button>
            <button className={s.button} onClick={() => (setEditing(false), setError(null))}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={s.row}>
            <span className={s.fieldValue} data-testid={`value-${label}`}>
              {display ?? (measured ? formatInches(measured.value) : 'Not entered')}
            </span>
            {measured && onProvenance && <ProvenanceChip provenance={measured.provenance} />}
            {measured?.source_mm && <span className={s.muted}>from {measured.source_mm} mm</span>}
          </div>
          <div className={s.row}>
            <button
              className={s.button}
              disabled={!canEdit}
              aria-label={`Edit ${label}`}
              onClick={() => {
                setText(measured ? formatInches(measured.value) : '');
                setEditing(true);
              }}
            >
              Edit
            </button>
            {measured && onProvenance && measured.provenance === 'unmeasured' && (
              <button className={s.button} disabled={!canEdit} aria-label={`Confirm ${label}`} onClick={() => provenance('confirmed')}>
                Confirm
              </button>
            )}
            {measured && onProvenance && measured.provenance === 'confirmed' && (
              <button className={s.button} disabled={!canEdit} aria-label={`Unconfirm ${label}`} onClick={() => provenance('unmeasured')}>
                Unconfirm
              </button>
            )}
          </div>
        </>
      )}
      {detail && !editing && <p className={s.muted}>{detail}</p>}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
