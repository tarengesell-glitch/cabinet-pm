'use client';
/**
 * The side frames for the "Cabinets & appliances" tool (owner, 2026-11-06): "Cabinet runs"
 * (how to, Add island, and the selected run's options) and "Appliances" (the tray). Plus the
 * small pop-up next to a selected appliance. Display only: every rule is in model/layout.ts.
 */
import { useRef } from 'react';
import { formatInches, type Length, type Result, type Room, type RunKind, wallLetter } from '@/core/index';
import type { TypedSize } from '../model/editor';
import { RUN_KIND_LABEL, cornerCabinets, findAppliance, findRun, insideSpan, runEnd } from '../model/layout';
import { LAYOUT_RULES, applianceType } from '../model/layout-rules';
import { SizeField } from './SizeField';
import { ApplianceIcon } from './applianceIcons';
import type { LayoutEdit } from './layoutEdits';
import s from './RoomCapture.module.css';

const RUN_KINDS = Object.keys(RUN_KIND_LABEL) as RunKind[];
const rough = (value: Length) => ({ value, provenance: 'unmeasured' as const, source_mm: null });

export function RunsFrame(props: {
  room: Room;
  selectedRunIds: readonly string[];
  canEdit: boolean;
  onEdit: (edit: LayoutEdit) => Result<unknown>;
  onAddIsland: () => void;
}) {
  const { room: r, selectedRunIds, canEdit, onEdit } = props;
  const found = selectedRunIds.map((id) => findRun(r, id)).filter((x): x is NonNullable<typeof x> => x !== null);
  const one = found.length === 1 ? found[0] : null;
  const island = one?.wall.kind === 'floating' ? one.wall : null;
  const sameDepth = found.length > 0 && found.every((f) => f.run.depth === found[0]!.run.depth);
  const letter = (wallId: string) => wallLetter(r.walls.findIndex((w) => w.wall_id === wallId));
  const corners = one
    ? cornerCabinets(r).filter(
        (c) =>
          (c.endingWallId === one.wall.wall_id && runEnd(one.run) >= insideSpan(r, one.wall).end) ||
          (c.startingWallId === one.wall.wall_id && one.run.offset <= insideSpan(r, one.wall).start),
      )
    : [];
  return (
    <section className={s.stack} aria-label="Cabinet runs">
      <p className={s.muted}>Tap a wall to fill it, or drag along a wall for part of it. Drag on the open floor for an island. Select a run to change it.</p>
      <div className={s.row}>
        <button className={s.button} disabled={!canEdit} onClick={props.onAddIsland}>
          Add island
        </button>
      </div>
      {found.length > 0 && (
        <div className={s.field} aria-label="Selected run">
          <h3 className={s.fieldLabel} style={{ margin: 0 }}>
            {island ? 'Selected: island' : one ? `Selected: run on wall ${letter(one.wall.wall_id)}` : `${found.length} runs selected`}
          </h3>
          <div className={s.row} role="group" aria-label="Cabinet type">
            {RUN_KINDS.map((k) => (
              <button
                key={k}
                className={found.every((f) => f.run.kind === k) ? s.buttonActive : s.button}
                aria-pressed={found.every((f) => f.run.kind === k)}
                disabled={!canEdit}
                onClick={() => onEdit({ kind: 'run-kind', runIds: found.map((f) => f.run.run_id), runKind: k })}
              >
                {RUN_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          {one && !island && (
            <SizeField
              key={`len-${one.run.run_id}-${one.run.length}`}
              label="Length"
              measured={rough(one.run.length)}
              canEdit={canEdit}
              onSet={(v: TypedSize) => onEdit({ kind: 'run-length', runId: one.run.run_id, length: v.value })}
            />
          )}
          {island && one && (
            <>
              <SizeField
                key={`ilen-${island.wall_id}-${one.run.length}`}
                label="Length"
                measured={rough(one.run.length)}
                canEdit={canEdit}
                onSet={(v: TypedSize) => onEdit({ kind: 'island-resize', wallId: island.wall_id, length: v.value, depth: one.run.depth })}
              />
              <span className={s.fieldLabel}>Depth</span>
              <div className={s.row} role="group" aria-label="Island depth">
                {LAYOUT_RULES.islandDepths.map((d) => (
                  <button
                    key={d}
                    className={one.run.depth === d ? s.buttonActive : s.button}
                    aria-pressed={one.run.depth === d}
                    disabled={!canEdit}
                    onClick={() => onEdit({ kind: 'island-resize', wallId: island.wall_id, length: one.run.length, depth: d })}
                  >
                    {formatInches(d)}
                  </button>
                ))}
              </div>
            </>
          )}
          {!island && (
            <SizeField
              key={`dep-${found.map((f) => f.run.run_id).join()}-${sameDepth ? found[0]!.run.depth : 'mixed'}`}
              label="Depth"
              measured={sameDepth ? rough(found[0]!.run.depth) : null}
              {...(sameDepth ? {} : { display: 'Mixed' })}
              canEdit={canEdit}
              onSet={(v: TypedSize) => onEdit({ kind: 'run-depth', runIds: found.map((f) => f.run.run_id), depth: v.value })}
            />
          )}
          {corners.map((c) => (
            <p key={c.endingWallId} className={s.muted}>
              Corner cabinet ({c.base && c.upper ? 'base and upper' : c.base ? 'base' : 'upper'}) where walls {letter(c.endingWallId)} and {letter(c.startingWallId)} meet.
            </p>
          ))}
          <div className={s.row}>
            {one && !island && (
              <button className={s.button} disabled={!canEdit} onClick={() => onEdit({ kind: 'split', runId: one.run.run_id })}>
                Split
              </button>
            )}
            <button className={s.buttonDanger} disabled={!canEdit} onClick={() => onEdit({ kind: 'delete-runs', runIds: found.map((f) => f.run.run_id) })}>
              {island ? 'Delete island' : found.length > 1 ? 'Delete runs' : 'Delete run'}
            </button>
          </div>
          {one && !island && <p className={s.muted}>Split cuts the run in half. Drag the divider to move it.</p>}
        </div>
      )}
    </section>
  );
}

/** Pointer movement before a press on the tray counts as a drag rather than a tap. UI setting. */
const TRAY_DRAG_PX = 6;

/**
 * Appliance tray: drag one onto the plan, or tap it and then tap the plan. Dragging uses pointer
 * events (not the browser's drag and drop), so it works the same with a mouse, a finger or a pen.
 */
export function ApplianceTray(props: {
  armed: string | null;
  canEdit: boolean;
  onArm: (kind: string | null) => void;
  /** The dragged appliance is over this screen point; `done` is the release. */
  onTrayDrag: (kind: string, clientX: number, clientY: number, done: boolean) => void;
}) {
  /** Set when a press became a drag, so the click that may follow it is not a tap. */
  const dragged = useRef(false);
  const startDrag = (kind: string, e: React.PointerEvent<HTMLButtonElement>) => {
    dragged.current = false;
    if (!props.canEdit || e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < TRAY_DRAG_PX) return;
      dragging = true;
      props.onTrayDrag(kind, ev.clientX, ev.clientY, false);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragging) {
        dragged.current = true;
        props.onTrayDrag(kind, ev.clientX, ev.clientY, true);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <section className={s.stack} aria-label="Appliances">
      <p className={s.muted}>Drag one onto the plan, or tap it and then tap where it goes. Select one on the plan to change it.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        {LAYOUT_RULES.appliances.map((a) => (
          <button
            key={a.id}
            className={props.armed === a.id ? s.buttonActive : s.button}
            aria-pressed={props.armed === a.id}
            disabled={!props.canEdit}
            onPointerDown={(e) => startDrag(a.id, e)}
            onClick={() => {
              if (dragged.current) return void (dragged.current = false);
              props.onArm(props.armed === a.id ? null : a.id);
            }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 4px', touchAction: 'none' }}
          >
            <ApplianceIcon id={a.id} />
            <span style={{ fontWeight: 600 }}>{a.name}</span>
            <span style={{ fontSize: 12, opacity: 0.8 }}>{a.widths.map(formatInches).join(' / ')}</span>
          </button>
        ))}
      </div>
      <p className={s.muted}>Ranges and cooktops come with a hood. A sink dropped near a window centres under it, and a dishwasher is added beside it.</p>
    </section>
  );
}

/** Options for one appliance, shown next to it on the plan. */
export function AppliancePopover(props: {
  room: Room;
  placementId: string;
  at: { x: number; y: number };
  canEdit: boolean;
  onEdit: (edit: LayoutEdit) => void;
}) {
  const found = findAppliance(props.room, props.placementId);
  if (!found) return null;
  const { appliance: a, wall } = found;
  const type = applianceType(LAYOUT_RULES, a.kind);
  return (
    <div
      role="dialog"
      aria-label={type?.name ?? a.kind}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: Math.max(6, props.at.x - 110),
        top: Math.max(6, props.at.y),
        zIndex: 4,
        width: 220,
        background: '#fff',
        border: '1px solid #e2e7eb',
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(0,0,0,0.16)',
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <strong style={{ fontSize: 13 }}>{type?.name ?? `Unknown appliance "${a.kind}"`}</strong>
      {type && type.widths.length > 1 ? (
        <div className={s.row} role="group" aria-label="Width">
          {type.widths.map((w) => (
            <button
              key={w}
              className={a.width.value === w ? s.buttonActive : s.button}
              aria-pressed={a.width.value === w}
              disabled={!props.canEdit || a.width.value === w}
              onClick={() => props.onEdit({ kind: 'appliance-width', placementId: a.placement_id, width: w })}
            >
              {formatInches(w)}
            </button>
          ))}
        </div>
      ) : (
        <span className={s.muted}>
          {formatInches(a.width.value)} wide{type?.upperAboveDepth && wall.kind === 'room' ? `, with a ${formatInches(type.upperAboveDepth)}-deep upper above` : ''}
        </span>
      )}
      {type?.comesWithHood && <span className={s.muted}>Comes with a matching hood.</span>}
      {a.paired_with && (
        <button className={s.button} disabled={!props.canEdit} onClick={() => props.onEdit({ kind: 'appliance-flip', placementId: a.placement_id })}>
          Move to other side of sink
        </button>
      )}
      <div className={s.row}>
        <button className={s.buttonDanger} disabled={!props.canEdit} onClick={() => props.onEdit({ kind: 'delete-appliances', placementIds: [a.placement_id] })}>
          Delete
        </button>
      </div>
    </div>
  );
}
