'use client';
/**
 * Customize's Cabinet tab (owner, 2026-11-12: "controls similar to the other major cabinet design
 * softwares"): the cabinet's library type; its size and place; how its doors open; its front and
 * interior, divided the way the common programs do it (split vertical or horizontal, shelves,
 * drawers, roll-outs); its ends; and its back. Every change goes through `editItems` (model/cabinets.ts)
 * and is saved as a new version of the master copy.
 */
import { useState } from 'react';
import { formatInches, type FrontSection, type Room } from '@/core/index';
import { CURRENT_CATALOG } from '@/modules/catalog/contract';
import type { CabinetView, ItemEdit } from '../model/cabinets';
import { wallLabel } from '../model/editor';
import { frontPieces } from '../model/fronts';
import { startingSections } from '../model/fronts';
import { DRAFT_SETTINGS, itemByCode, runOf, standard } from '../model/placeholder-draft';
import { editSection, sectionAt, sectionBoxes, type SectionAction, type SectionPath } from '../model/sections';
import { parseSize } from './parseSize';
import { FrontIcon } from './FrontIcon';
import { SELECT_BLUE } from './theme';
import s from './Customize.module.css';

const IN = 64;

export function CabinetEditor(props: {
  room: Room;
  cab: CabinetView;
  name: string;
  canEdit: boolean;
  /** The cabinets in the same row (run and layer), left to right. */
  row: readonly CabinetView[];
  rowName: (c: CabinetView) => string;
  finish: string;
  onStep: (d: 1 | -1) => void;
  onEdit: (e: ItemEdit) => boolean;
  onPick: (id: string) => void;
  /** Opens the look choices of the sink, dishwasher or fridge this is (or holds). */
  onLooks: (placementId: string) => void;
}) {
  const { room, cab, canEdit } = props;
  const where = runOf(room, cab.runId);
  const item = cab.code ? itemByCode(cab.code) : null;
  const types = item && item.type !== 'filler' ? CURRENT_CATALOG.items.filter((i) => i.type === item.type && i.availability === 'available') : [];
  const offers = (code: string) => item?.options.includes(code) ?? false;
  const option = (code: string) => CURRENT_CATALOG.options.find((o) => o.code === code) ?? null;
  const depth = cab.depth ?? (cab.code ? standard(cab.code, 'depth') : null) ?? 0;
  const set = (code: string, value: string | null) => props.onEdit({ kind: 'option', id: cab.id, option: code, value });

  return (
    <>
      <div className={s.cabHero}>
        <span className={s.cabPic}>
          <FrontIcon item={item} appliance={cab.appliance} width={cab.width} height={cab.height || 34 * IN} size={88} selected finish={props.finish} />
        </span>
        <div className={s.cabInfo}>
          <h2 className={s.h2}>{props.name}</h2>
          <p className={s.sub}>
            {where?.wall.kind === 'floating' ? 'Island' : wallLabel(room, cab.wallId).replace(/^w/, 'W')} · {formatInches(cab.offset - (where?.run.offset ?? 0))} from the run’s start
          </p>
          <div className={s.row}>
            {cab.code === null ? null : !cab.reviewed ? (
              <>
                <span className={s.tag}>Placed by the placeholder</span>
                <button className={s.btnSm} disabled={!canEdit} onClick={() => props.onEdit({ kind: 'approve', ids: [cab.id] })}>
                  Approve
                </button>
              </>
            ) : (
              <span className={s.ok}>Reviewed</span>
            )}
          </div>
        </div>
        <div className={s.stepBtns}>
          <button className={s.btnSm} onClick={() => props.onStep(-1)} aria-label="Previous cabinet">
            ←
          </button>
          <button className={s.btnSm} onClick={() => props.onStep(1)} aria-label="Next cabinet">
            →
          </button>
        </div>
      </div>
      {cab.code === null && <p className={s.notice}>An appliance. Move or resize it on the Room drawing step.</p>}
      {cab.housed && (
        <section className={s.sec}>
          <button className={s.btn} onClick={() => props.onLooks(cab.housed!.placementId)}>
            {cab.housed.kind === 'sink' ? 'Sink' : cab.housed.kind === 'dishwasher' ? 'Dishwasher' : cab.housed.kind === 'fridge' ? 'Fridge' : 'Appliance'} options
          </button>
          <p className={s.sub}>Or click it in the 3D view.</p>
        </section>
      )}
      {cab.code !== null && item && (
        <>
          {types.length > 1 && (
            <section className={s.sec}>
              <h3 className={s.h3}>Library cabinet</h3>
              <div className={s.typeGrid} role="radiogroup" aria-label="Cabinet type">
                {types.map((t) => (
                  <button key={t.code} role="radio" className={s.typeCard} aria-checked={t.code === cab.code} disabled={!canEdit} onClick={() => props.onEdit({ kind: 'type', id: cab.id, code: t.code })}>
                    <span className={s.typePic}>
                      <FrontIcon item={t} width={cab.width} height={cab.height || (t.size.height.default.value ?? 34 * IN)} size={44} selected={t.code === cab.code} finish={props.finish} />
                    </span>
                    <span className={s.typeName}>{t.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className={s.sec}>
            <h3 className={s.h3}>Size and position</h3>
            <div className={s.rowStrip} aria-label="This cabinet in its row">
              {props.row.map((c) => (
                <button
                  key={c.id}
                  className={c.id === cab.id ? s.rowCellOn : s.rowCell}
                  style={{ flex: `${Math.max(c.width / IN, 4)} 1 0` }}
                  title={`${props.rowName(c)} ${formatInches(c.width)}`}
                  aria-label={`${props.rowName(c)} ${formatInches(c.width)}`}
                  onClick={() => props.onPick(c.id)}
                >
                  {c.code ? formatInches(c.width).replace('"', '') : ''}
                </button>
              ))}
            </div>
            <p className={s.sub}>The cabinet beside it gives or takes a change in width, so the run stays the same length. You can also drag the blue handles in the 3D view.</p>
            <div className={s.sizeGrid}>
              <SizeInput key={`w${cab.width}`} label="Width" value={cab.width} canEdit={canEdit} step={DRAFT_SETTINGS.ok ? DRAFT_SETTINGS.value.widthStep : null} onSet={(v) => props.onEdit({ kind: 'width', id: cab.id, width: v })} />
              <SizeInput key={`h${cab.height}`} label="Height" value={cab.height} canEdit={canEdit} step={IN / 4} onSet={(v) => props.onEdit({ kind: 'box', id: cab.id, height: v })} />
              <SizeInput key={`d${depth}`} label="Depth" value={depth} canEdit={canEdit} step={IN / 4} onSet={(v) => props.onEdit({ kind: 'box', id: cab.id, depth: v })} />
              <SizeInput key={`e${cab.elevation}`} label="Off the floor" value={cab.elevation} canEdit={canEdit} step={IN / 4} allowZero onSet={(v) => props.onEdit({ kind: 'box', id: cab.id, elevation: v })} />
              <SizeInput key={`b${cab.setback ?? 0}`} label="Out from the wall" value={cab.setback ?? 0} canEdit={canEdit} step={IN / 4} allowZero onSet={(v) => props.onEdit({ kind: 'box', id: cab.id, setback: v })} />
            </div>
          </section>

          {offers('hinge_side') && (
            <section className={s.sec}>
              <h3 className={s.h3}>Door opening</h3>
              <Segmented
                label="Door opening"
                canEdit={canEdit}
                value={cab.selections?.['hinge_side'] ?? null}
                choices={[
                  { value: null, name: 'By width' },
                  { value: 'left', name: 'Hinged left' },
                  { value: 'right', name: 'Hinged right' },
                  { value: 'pair', name: 'Double doors' },
                ]}
                onSet={(v) => set('hinge_side', v)}
              />
              <p className={s.sub}>
                {cab.selections?.['hinge_side']
                  ? option('hinge_side')?.values.find((v) => v.code === cab.selections?.['hinge_side'])?.name
                  : 'Not chosen: one door up to 20" wide, then a pair (the shop’s door rule).'}
              </p>
            </section>
          )}

          <FrontEditor cab={cab} item={item} canEdit={canEdit} onSet={(sections) => props.onEdit({ kind: 'sections', id: cab.id, sections })} />

          {(offers('end_left') || offers('end_right')) && (
            <section className={s.sec}>
              <h3 className={s.h3}>Ends</h3>
              {(['end_left', 'end_right'] as const).filter(offers).map((code) => (
                <div key={code} className={s.optRow}>
                  <span className={s.optLabel}>{code === 'end_left' ? 'Left end' : 'Right end'}</span>
                  <Segmented
                    label={code === 'end_left' ? 'Left end' : 'Right end'}
                    canEdit={canEdit}
                    value={cab.selections?.[code] ?? null}
                    choices={[
                      { value: 'unfinished', name: 'Unfinished' },
                      { value: 'applied_finished', name: 'Applied FE' },
                      { value: 'finished', name: 'Integrated FE' },
                    ]}
                    onSet={(v) => set(code, v)}
                  />
                </div>
              ))}
              <p className={s.sub}>Left and right as seen standing in front of the cabinet. FE: finished end; applied is the usual choice for an open end.</p>
            </section>
          )}

          {offers('back') && (
            <section className={s.sec}>
              <h3 className={s.h3}>Back</h3>
              <Segmented
                label="Back"
                canEdit={canEdit}
                value={cab.selections?.['back'] ?? null}
                choices={[
                  { value: 'unfinished', name: 'Unfinished' },
                  { value: 'finished_panel', name: 'Finished panel' },
                  { value: 'finished_door', name: 'Finished door' },
                ]}
                onSet={(v) => set('back', v)}
              />
            </section>
          )}
        </>
      )}
    </>
  );
}

function Segmented(props: { label: string; canEdit: boolean; value: string | null; choices: readonly { value: string | null; name: string }[]; onSet: (v: string | null) => void }) {
  return (
    <div className={s.seg} role="radiogroup" aria-label={props.label}>
      {props.choices.map((c) => (
        <button key={c.name} role="radio" aria-checked={props.value === c.value} className={s.segBtn} disabled={!props.canEdit} onClick={() => props.value !== c.value && props.onSet(c.value)}>
          {c.name}
        </button>
      ))}
    </div>
  );
}

/** One size: type it (feet and inches, or mm) and press Enter, or step it with − and +. */
function SizeInput(props: { label: string; value: number; canEdit: boolean; step: number | null; allowZero?: boolean; onSet: (v: number) => boolean }) {
  const [text, setText] = useState(formatInches(props.value));
  const [error, setError] = useState<string | null>(null);
  const apply = (v: number) => {
    setError(null);
    if (v < 0 || (!props.allowZero && v === 0)) return setError('Too small.');
    if (!props.onSet(v)) setText(formatInches(props.value));
  };
  const typed = () => {
    const r = parseSize(text);
    if (!r.ok) return setError(r.reason);
    if (r.value.value !== props.value) apply(r.value.value);
  };
  return (
    <label className={s.sizeField}>
      <span className={s.optLabel}>{props.label}</span>
      <span className={s.row}>
        {props.step !== null && (
          <button type="button" className={s.btnSq} disabled={!props.canEdit} aria-label={`${props.label} down by ${formatInches(props.step)}`} onClick={() => apply(props.value - props.step!)}>
            −
          </button>
        )}
        <input className={error ? s.inputBad : s.input} aria-label={props.label} value={text} disabled={!props.canEdit} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && typed()} onBlur={typed} />
        {props.step !== null && (
          <button type="button" className={s.btnSq} disabled={!props.canEdit} aria-label={`${props.label} up by ${formatInches(props.step)}`} onClick={() => apply(props.value + props.step!)}>
            +
          </button>
        )}
      </span>
      {error && (
        <span className={s.error} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * The cabinet's face, drawn from the same layout the 3D view uses; click a part to pick it, then
 * split it or change what is in it (owner, 2026-11-12, as the common cabinet programs do).
 */
function FrontEditor(props: { cab: CabinetView; item: NonNullable<ReturnType<typeof itemByCode>>; canEdit: boolean; onSet: (sections: FrontSection | null) => boolean }) {
  const { cab, item } = props;
  const [path, setPath] = useState<SectionPath>([]);
  const [error, setError] = useState<string | null>(null);
  if (!DRAFT_SETTINGS.ok || item.type === 'filler' || item.type === 'panel' || item.type === 'appliance_opening' || item.type.startsWith('corner')) return null;
  const rules = DRAFT_SETTINGS.value.fronts;
  const toe = cab.layer === 'base' && item.toeKick ? DRAFT_SETTINGS.value.visual.toeKick / IN : 0;
  const w = cab.width / IN;
  const y0 = cab.elevation / IN + toe;
  const y1 = (cab.elevation + cab.height) / IN;
  const tree: FrontSection = cab.sections ?? startingSections(item, rules.topDrawer);
  const picked = sectionAt(tree, path) ?? tree;
  const pieces = frontPieces({ item, x0: 0, x1: w, y0, y1, hinge: cab.selections?.['hinge_side'] ?? null, sections: cab.sections ?? null, drawerHandleTop: false }, rules);
  const boxes = sectionBoxes(tree, 0, w, y0, y1);
  const act = (a: SectionAction) => {
    setError(null);
    const r = editSection(tree, path, a);
    if (!r.ok) return setError(r.reason);
    if (props.onSet(r.value) && (a === 'split_vertical' || a === 'split_horizontal') && picked.kind !== 'split') {
      // Keep working in the first new part.
      const parent = path.length ? sectionAt(tree, path.slice(0, -1)) : null;
      const same = parent?.kind === 'split' && parent.direction === (a === 'split_vertical' ? 'vertical' : 'horizontal');
      setPath(same ? path : [...path, 0]);
    }
    if (a === 'remove') setPath(path.slice(0, -1));
  };
  // The picture: 220px tall at most, to the cabinet's proportions.
  const H = 200;
  const k = Math.min(H / (y1 - y0), 260 / w);
  const X = (x: number) => 6 + x * k;
  const Y = (y: number) => 6 + (y1 - y) * k;
  const leaf = picked.kind !== 'split';
  const can = props.canEdit;
  return (
    <section className={s.sec}>
      <h3 className={s.h3}>Front and interior</h3>
      <p className={s.sub}>Click a part of the cabinet, then change it. New parts share the space equally.</p>
      <svg className={s.facePreview} width={w * k + 12} height={(y1 - y0) * k + 12} role="group" aria-label="Cabinet face">
        <rect x={X(0)} y={Y(y1)} width={w * k} height={(y1 - y0) * k} fill="#f3f1ec" stroke="#57524b" />
        {pieces.map((p, i) =>
          p.kind === 'door' || p.kind === 'drawer' ? (
            <g key={i}>
              <rect x={X(p.x0) + 1} y={Y(p.y1) + 1} width={(p.x1 - p.x0) * k - 2} height={(p.y1 - p.y0) * k - 2} fill="#fbfaf7" stroke="#8f8a82" />
              {p.kind === 'door' ? (
                <line x1={X(p.hinge === 'left' ? p.x1 - 1.6 : p.x0 + 1.6)} x2={X(p.hinge === 'left' ? p.x1 - 1.6 : p.x0 + 1.6)} y1={Y(p.handleY + 2.5)} y2={Y(p.handleY - 2.5)} stroke="#57524b" strokeWidth={2} />
              ) : (
                <line x1={X((p.x0 + p.x1) / 2 - 2.5)} x2={X((p.x0 + p.x1) / 2 + 2.5)} y1={Y(p.handleY)} y2={Y(p.handleY)} stroke="#57524b" strokeWidth={2} />
              )}
            </g>
          ) : p.kind === 'shelf' || p.kind === 'rollout' ? (
            <line key={i} x1={X(p.x0) + 3} x2={X(p.x1) - 3} y1={Y(p.y)} y2={Y(p.y)} stroke="#8f8a82" strokeDasharray={p.kind === 'shelf' ? '4 3' : undefined} strokeWidth={p.kind === 'rollout' ? 3 : 1} />
          ) : p.kind === 'divider' ? (
            <rect key={i} x={X(p.x0)} y={Y(p.y1)} width={Math.max(1, (p.x1 - p.x0) * k)} height={Math.max(1, (p.y1 - p.y0) * k)} fill="#8f8a82" />
          ) : null,
        )}
        {boxes.map((b) => {
          const on = b.path.join('.') === path.join('.');
          return (
            <rect
              key={b.path.join('.') || 'all'}
              x={X(b.x0)}
              y={Y(b.y1)}
              width={(b.x1 - b.x0) * k}
              height={(b.y1 - b.y0) * k}
              fill={on ? 'rgba(47,125,225,0.12)' : 'transparent'}
              stroke={on ? SELECT_BLUE : 'transparent'}
              strokeWidth={2}
              style={{ cursor: 'pointer' }}
              role="button"
              aria-label={`Section ${b.path.map((n) => n + 1).join('-') || 'whole cabinet'}: ${b.section.kind}`}
              aria-pressed={on}
              onClick={(e) => {
                e.stopPropagation();
                // The deepest part under the pointer wins: parts are listed after their split.
                setPath(b.path);
              }}
            />
          );
        })}
      </svg>
      <p className={s.sub}>
        Picked: <b>{path.length ? `part ${path.map((n) => n + 1).join('-')}` : 'the whole cabinet'}</b> ·{' '}
        {picked.kind === 'split'
          ? `${picked.parts.length} parts ${picked.direction === 'vertical' ? 'side by side' : 'stacked'}`
          : picked.kind === 'doors'
            ? `doors, ${picked.shelves} shelf${picked.shelves === 1 ? '' : 'ves'}, ${picked.rollouts} roll-out${picked.rollouts === 1 ? '' : 's'}`
            : picked.kind === 'drawers'
              ? `${picked.count} drawer${picked.count === 1 ? '' : 's'}`
              : `open, ${picked.shelves} shelf${picked.shelves === 1 ? '' : 'ves'}`}
      </p>
      <div className={s.toolGrid}>
        <button className={s.btnSm} disabled={!can} onClick={() => act('split_vertical')}>
          Split vertical
        </button>
        <button className={s.btnSm} disabled={!can} onClick={() => act('split_horizontal')}>
          Split horizontal
        </button>
        <button className={s.btnSm} disabled={!can || path.length === 0} onClick={() => act('remove')}>
          Remove part
        </button>
        <button className={s.btnSm} disabled={!can || !leaf || picked.kind === 'doors'} onClick={() => act('doors')}>
          Doors
        </button>
        <button className={s.btnSm} disabled={!can || !leaf || picked.kind === 'drawers'} onClick={() => act('drawers')}>
          Drawers
        </button>
        <button className={s.btnSm} disabled={!can || !leaf || picked.kind === 'open'} onClick={() => act('open')}>
          Open
        </button>
      </div>
      {leaf && (
        <div className={s.counters}>
          {picked.kind !== 'drawers' && <Counter label="Shelves" value={picked.shelves} can={can} onDown={() => act('remove_shelf')} onUp={() => act('add_shelf')} />}
          {picked.kind === 'drawers' && <Counter label="Drawers" value={picked.count} can={can} onDown={() => act('remove_drawer')} onUp={() => act('add_drawer')} />}
          {picked.kind === 'doors' && <Counter label="Roll-outs" value={picked.rollouts} can={can} onDown={() => act('remove_rollout')} onUp={() => act('add_rollout')} />}
        </div>
      )}
      {cab.sections && (
        <button className={s.btnGhost} disabled={!can} onClick={() => (setPath([]), props.onSet(null))}>
          Back to the library cabinet’s front
        </button>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Counter(props: { label: string; value: number; can: boolean; onDown: () => void; onUp: () => void }) {
  return (
    <span className={s.counter}>
      <span className={s.optLabel}>{props.label}</span>
      <button className={s.btnSq} disabled={!props.can} aria-label={`Fewer ${props.label.toLowerCase()}`} onClick={props.onDown}>
        −
      </button>
      <b aria-label={props.label}>{props.value}</b>
      <button className={s.btnSq} disabled={!props.can} aria-label={`More ${props.label.toLowerCase()}`} onClick={props.onUp}>
        +
      </button>
    </span>
  );
}
