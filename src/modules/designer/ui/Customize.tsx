'use client';
/**
 * The customize screens (the owner's Kitchen Studio prototype, 2026-11-08): a settings pane
 * (Room · Run · Cabinet · Checks) beside a studio-lit 3D view of the room, 40/60.
 *
 * A PREVIEW on a PLACEHOLDER design: the cabinets come from the placeholder AI step (no AI), are
 * kept in this browser beside the room's drawing, and are not in the master copy yet (Core has
 * no placed cabinets). Every cabinet the placeholder put down is marked until a person changes
 * or approves it. Live pricing is not connected (no prices exist yet, DECISIONS P-1).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatInches, type Room } from '@/core/index';
import { can, type User } from '@/platform/index';
import { CATALOG_CHECKS, CURRENT_CATALOG, checkPlacement } from '@/modules/catalog/contract';
import { wallLabel } from '../model/editor';
import { RUN_KIND_LABEL } from '../model/layout';
import { applianceType, LAYOUT_RULES } from '../model/layout-rules';
import { draftPlaceholder, editDesign, itemByCode, redraftRun, runOf, standard, type DesignEdit, type DraftPreferences, type PlaceholderCabinet, type PlaceholderDesign } from '../model/placeholder-draft';
import { parseSize } from './parseSize';
import { saveDesign, storedDesign, storedRoom } from './placeholder-store';
import { Stage3D, type FinishLook } from './Stage3D';
import s from './Customize.module.css';

export interface CustomizeRoom {
  /** The room's ID in the design choices; its drawing and design are kept under it. */
  readonly key: string;
  readonly name: string;
  readonly look: FinishLook;
  /** The room's design choices, in words, for the Room tab. */
  readonly choices: readonly { readonly label: string; readonly value: string }[];
  /** What the placeholder recipe reads from the design choices (for re-drafting a run). */
  readonly prefs: DraftPreferences;
  /** Opens the design choices for this room. */
  readonly onEditChoices: () => void;
  /** Called after every saved change. */
  readonly onChange?: () => void;
}

type Tab = 'room' | 'run' | 'cabinet' | 'checks';
const TABS: readonly { id: Tab; name: string }[] = [
  { id: 'room', name: 'Room' },
  { id: 'run', name: 'Run' },
  { id: 'cabinet', name: 'Cabinet' },
  { id: 'checks', name: 'Checks' },
];
const SIZE_CHECKS: ReadonlySet<string> = new Set([CATALOG_CHECKS.sizeInRange.id, CATALOG_CHECKS.sizeOnStep.id, CATALOG_CHECKS.available.id]);

const nameOf = (c: PlaceholderCabinet): string =>
  c.code ? (itemByCode(c.code)?.name ?? c.code) : c.appliance === 'hood' ? 'Hood' : (applianceType(LAYOUT_RULES, c.appliance ?? '')?.name ?? c.appliance ?? 'Appliance');

export function Customize({ user, room: cr }: { user: User; room: CustomizeRoom }) {
  const canEdit = can(user, 'room.edit');
  const [room, setRoom] = useState<Room | null>(null);
  const [design, setDesign] = useState<PlaceholderDesign | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('room');
  const [selected, setSelected] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [message, setMessage] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);
  const [approveArmed, setApproveArmed] = useState(false);

  useEffect(() => {
    const r = storedRoom(cr.key);
    const d = storedDesign(cr.key);
    if (!r.ok) return setProblem(r.reason);
    if (!d.ok) return setProblem(d.reason);
    if (!d.value) return setProblem('This room has no design yet. Run the AI design step first.');
    setRoom(r.value);
    setDesign(d.value);
    setRunId(d.value.cabinets[0]?.runId ?? null);
  }, [cr.key]);

  const onChange = cr.onChange;
  const keep = useCallback(
    (next: PlaceholderDesign) => {
      setDesign(next);
      const p = saveDesign(cr.key, next);
      if (p) setMessage({ kind: 'error', text: p });
      onChange?.();
    },
    [cr.key, onChange],
  );
  const edit = (e: DesignEdit): boolean => {
    if (!design || !canEdit) return false;
    const r = editDesign(design, e);
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.reason });
      return false;
    }
    setMessage(null);
    keep(r.value);
    return true;
  };

  const designRef = useRef(design);
  useEffect(() => {
    designRef.current = design;
  }, [design]);
  /** Selects a cabinet (from the 3D view, a run strip or a check) and shows its settings. */
  const pick = useCallback((id: string) => {
    setSelected(id);
    setTab((t) => (t === 'room' || t === 'checks' ? 'cabinet' : t));
    const c = designRef.current?.cabinets.find((x) => x.id === id);
    if (c) setRunId(c.runId);
  }, []);
  const show3dError = useCallback((reason: string) => setMessage({ kind: 'error', text: reason }), []);

  const issues = useMemo(() => {
    if (!design) return [];
    const out: { text: string; id: string | null; kind: 'review' | 'check' }[] = [];
    const pending = design.cabinets.filter((c) => !c.reviewed && c.code !== null);
    if (pending.length) out.push({ kind: 'review', text: `${pending.length} cabinet${pending.length === 1 ? '' : 's'} placed by the placeholder and not reviewed`, id: pending[0]!.id });
    for (const c of design.cabinets) {
      const item = c.code ? itemByCode(c.code) : null;
      if (!item) continue;
      const placed = checkPlacement(CURRENT_CATALOG, CURRENT_CATALOG.shop.id, {
        id: c.id,
        catalogItemId: item.id,
        width: c.width,
        height: item.size.height.default.value ?? 0,
        depth: c.depth ?? item.size.depth.default.value ?? 0,
        selections: {},
      });
      for (const i of placed) if (SIZE_CHECKS.has(i.check_id)) out.push({ kind: 'check', text: `${room ? wallLabel(room, c.wallId).replace(/^w/, 'W') : ''}: ${i.message}`, id: c.id });
    }
    return out;
  }, [design, room]);

  if (problem) {
    return (
      <div className={s.blocked}>
        <h2 className={s.h2}>The {cr.name.toLowerCase()} can’t be customized yet</h2>
        <p className={s.error} role="alert">
          {problem}
        </p>
      </div>
    );
  }
  if (!room || !design) return <p className={s.loading}>Loading the {cr.name.toLowerCase()}…</p>;

  const sel = design.cabinets.find((c) => c.id === selected) ?? null;
  const pending = design.cabinets.filter((c) => !c.reviewed && c.code !== null);
  const runs = room.walls.flatMap((w) => w.runs.map((r) => ({ wall: w, run: r })));
  const run = runs.find((r) => r.run.run_id === runId) ?? runs[0] ?? null;
  const selItem = sel?.code ? itemByCode(sel.code) : null;

  const stepCab = (d: 1 | -1) => {
    const list = design.cabinets;
    const i = sel ? list.indexOf(sel) : -1;
    const next = list[(i + d + list.length) % list.length];
    if (next) pick(next.id);
  };

  return (
    <div className={s.ws}>
      <section className={s.pane} aria-label="Settings">
        <div className={s.review}>
          {pending.length > 0 ? (
            <>
              <span className={s.tag}>
                {pending.length} placement{pending.length === 1 ? '' : 's'} to review
              </span>
              {approveArmed ? (
                <>
                  <button className={s.btnPrimary} onClick={() => (edit({ kind: 'approve', ids: pending.map((c) => c.id) }), setApproveArmed(false))}>
                    Yes, approve all {pending.length}
                  </button>
                  <button className={s.btnGhost} onClick={() => setApproveArmed(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className={s.btn} disabled={!canEdit} onClick={() => setApproveArmed(true)}>
                  Approve all
                </button>
              )}
            </>
          ) : (
            <span className={s.ok}>Every placement reviewed</span>
          )}
          <span className={s.spacer} />
          <span className={s.price}>Live pricing not connected yet</span>
        </div>
        <div className={s.tabs} role="tablist" aria-label="Customize">
          {TABS.map((t) => (
            <button key={t.id} role="tab" className={s.tab} aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.name}
              {t.id === 'checks' && issues.length > 0 && <span className={s.count}>{issues.length}</span>}
            </button>
          ))}
        </div>
        <div className={s.body} role="tabpanel">
          {message && (
            <p className={message.kind === 'error' ? s.error : s.notice} role="status">
              {message.text}
            </p>
          )}
          {tab === 'room' && (
            <>
              <div className={s.tiles}>
                <div className={s.tile}>
                  <div className={s.label}>Walls</div>
                  <div className={s.v}>{room.walls.filter((w) => w.kind === 'room').length}</div>
                </div>
                <div className={s.tile}>
                  <div className={s.label}>Ceiling</div>
                  <div className={s.v}>{formatInches(room.ceiling_height.value)}</div>
                </div>
                <div className={s.tile}>
                  <div className={s.label}>Cabinets</div>
                  <div className={s.v}>{design.cabinets.filter((c) => c.code !== null).length}</div>
                </div>
              </div>
              <section className={s.sec}>
                <h3 className={s.h3}>Design choices</h3>
                <dl className={s.kv}>
                  {cr.choices.map((c) => (
                    <div key={c.label}>
                      <dt>{c.label}</dt>
                      <dd>{c.value}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <button className={s.btn} onClick={cr.onEditChoices}>
                    Change in Design choices
                  </button>
                </div>
              </section>
              <section className={s.sec}>
                <h3 className={s.h3}>How the placeholder laid it out</h3>
                <ul className={s.notes}>
                  {design.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <p className={s.mocked}>
                  <b>Placeholder.</b> No AI designed this: a fixed recipe filled the cabinet runs. It is kept in this browser and is not in the master copy yet.
                </p>
              </section>
            </>
          )}
          {tab === 'run' &&
            (!run ? (
              <p className={s.empty}>No cabinet runs. Go back to Room drawing and add cabinets to a wall.</p>
            ) : (
              <>
                <section className={s.sec}>
                  <h3 className={s.h3}>Runs</h3>
                  <div className={s.stack} role="radiogroup" aria-label="Runs">
                    {runs.map((r) => (
                      <button key={r.run.run_id} role="radio" aria-checked={r.run.run_id === run.run.run_id} className={s.runCard} onClick={() => setRunId(r.run.run_id)}>
                        <span>{r.wall.kind === 'floating' ? 'Island' : wallLabel(room, r.wall.wall_id).replace(/^w/, 'W')}</span>
                        <span className={s.mono}>{formatInches(r.run.length)}</span>
                        <span className={s.muted}>{RUN_KIND_LABEL[r.run.kind]}</span>
                      </button>
                    ))}
                  </div>
                </section>
                {(['upper', 'base'] as const).map((layer) => {
                  const row = design.cabinets.filter((c) => c.runId === run.run.run_id && c.layer === layer).sort((a, b) => a.offset - b.offset);
                  if (!row.length) return null;
                  return (
                    <section key={layer} className={s.sec}>
                      <h3 className={s.h3}>{layer === 'upper' ? 'Uppers' : run.run.kind === 'pantry' ? 'Pantry' : 'Base'}</h3>
                      <div className={s.strip}>
                        {row.map((c) => (
                          <button
                            key={c.id}
                            className={c.code === null ? s.chipApp : itemByCode(c.code)?.type === 'filler' ? s.chipFill : s.chip}
                            aria-pressed={selected === c.id}
                            style={{ flex: `${Math.max(c.width / 64, 6)} 1 0` }}
                            title={`${nameOf(c)} ${formatInches(c.width)}`}
                            aria-label={`${nameOf(c)} ${formatInches(c.width)}`}
                            onClick={() => pick(c.id)}
                          >
                            <span>{c.code === null ? nameOf(c).split(' ')[0] : formatInches(c.width).replace('"', '')}</span>
                            {!c.reviewed && c.code !== null && <i aria-hidden="true" />}
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
                <p className={s.hint}>Dashed dot: placed by the placeholder, not reviewed yet.</p>
                <div>
                  <button
                    className={s.btn}
                    disabled={!canEdit}
                    onClick={() => {
                      const fresh = draftPlaceholder(room, cr.prefs, () => crypto.randomUUID());
                      if (!fresh.ok) return setMessage({ kind: 'error', text: fresh.reason });
                      keep(redraftRun(design, fresh.value, run.run.run_id));
                      setMessage({ kind: 'notice', text: 'Run re-drafted with the placeholder recipe.' });
                    }}
                  >
                    Re-draft this run
                  </button>
                </div>
              </>
            ))}
          {tab === 'cabinet' &&
            (!sel ? (
              <p className={s.empty}>Click a cabinet in the 3D view.</p>
            ) : (
              <CabinetTab
                key={sel.id}
                room={room}
                cab={sel}
                canEdit={canEdit}
                onStep={stepCab}
                onEdit={edit}
                onTypeChange={(code) => edit({ kind: 'type', id: sel.id, code })}
                itemType={selItem?.type ?? null}
              />
            ))}
          {tab === 'checks' && (
            <section className={s.sec}>
              <h3 className={s.h3}>Live checks</h3>
              <p className={s.sub}>Click one to select the cabinet it is about.</p>
              {issues.length ? (
                <div className={s.stack}>
                  {issues.map((i, k) => (
                    <button key={k} className={s.issue} onClick={() => i.id && pick(i.id)}>
                      <span className={i.kind === 'check' ? s.pillWarn : s.pill}>{i.kind === 'check' ? 'Check' : 'Review'}</span>
                      <span>{i.text}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={s.empty}>Nothing to fix.</p>
              )}
              <p className={s.hint}>Sizes are checked against the catalog. Door style, hinge side and other per-cabinet choices aren’t checked here yet: the placeholder doesn’t carry them.</p>
            </section>
          )}
        </div>
      </section>
      <section className={s.stageCol} aria-label="3D view">
        <Stage3D room={room} design={design} look={cr.look} selected={selected} doorsOpen={doorsOpen} fitToken={fitToken} onPick={pick} onError={show3dError} />
        <div className={s.hudTop}>
          <div className={s.hudCard}>
            <div className={s.label}>Live preview</div>
            <div className={s.hudTitle}>{cr.name}</div>
          </div>
          <div className={s.hudRow}>
            <button className={s.hudBtn} aria-pressed={doorsOpen} onClick={() => setDoorsOpen((o) => !o)}>
              {doorsOpen ? 'Close doors' : 'Open doors'}
            </button>
            <button className={s.hudBtn} onClick={() => setFitToken((t) => t + 1)} aria-label="Reset view" title="Reset view">
              ↺
            </button>
          </div>
        </div>
        <div className={s.hudBottom}>
          <div className={s.dims}>
            {sel && sel.code ? (
              <>
                <span>
                  <b>W</b>
                  {formatInches(sel.width)}
                </span>
                <span>
                  <b>H</b>
                  {formatInches(standard(sel.code, 'height') ?? 0)}
                </span>
                <span>
                  <b>D</b>
                  {formatInches(sel.depth ?? standard(sel.code, 'depth') ?? 0)}
                </span>
              </>
            ) : (
              <span>
                <b>Cabinets</b>
                {design.cabinets.filter((c) => c.code !== null).length}
              </span>
            )}
          </div>
          <div className={s.hint3d}>Click a cabinet · drag to turn · scroll to zoom</div>
        </div>
      </section>
    </div>
  );
}

function CabinetTab(props: {
  room: Room;
  cab: PlaceholderCabinet;
  canEdit: boolean;
  itemType: string | null;
  onStep: (d: 1 | -1) => void;
  onEdit: (e: DesignEdit) => boolean;
  onTypeChange: (code: string) => void;
}) {
  const { room, cab, canEdit } = props;
  const [text, setText] = useState(formatInches(cab.width));
  const [error, setError] = useState<string | null>(null);
  const where = runOf(room, cab.runId);
  const types = props.itemType && props.itemType !== 'filler' ? CURRENT_CATALOG.items.filter((i) => i.type === props.itemType && i.availability === 'available') : [];
  const apply = () => {
    const r = parseSize(text);
    if (!r.ok) return setError(r.reason);
    setError(null);
    if (!props.onEdit({ kind: 'width', id: cab.id, width: r.value.value })) setText(formatInches(cab.width));
  };
  return (
    <>
      <div className={s.cabHead}>
        <h2 className={s.h2}>{nameOf(cab)}</h2>
        <button className={s.btnSm} onClick={() => props.onStep(-1)} aria-label="Previous cabinet">
          ←
        </button>
        <button className={s.btnSm} onClick={() => props.onStep(1)} aria-label="Next cabinet">
          →
        </button>
      </div>
      <p className={s.sub}>
        {where?.wall.kind === 'floating' ? 'Island' : wallLabel(room, cab.wallId).replace(/^w/, 'W')} · {formatInches(cab.offset - (where?.run.offset ?? 0))} from the run’s start
      </p>
      {cab.code === null ? (
        <p className={s.notice}>An appliance. Move or resize it on the Room drawing step.</p>
      ) : !cab.reviewed ? (
        <div className={s.row}>
          <span className={s.tag}>Placed by the placeholder</span>
          <button className={s.btnSm} disabled={!canEdit} onClick={() => props.onEdit({ kind: 'approve', ids: [cab.id] })}>
            Approve
          </button>
        </div>
      ) : (
        <span className={s.ok}>Reviewed</span>
      )}
      {types.length > 1 && (
        <section className={s.sec}>
          <h3 className={s.h3}>Type</h3>
          <div className={s.chips} role="radiogroup" aria-label="Cabinet type">
            {types.map((t) => (
              <button key={t.code} role="radio" className={s.choice} aria-checked={t.code === cab.code} disabled={!canEdit} onClick={() => props.onTypeChange(t.code)}>
                {t.name}
              </button>
            ))}
          </div>
        </section>
      )}
      {cab.code !== null && (
        <section className={s.sec}>
          <h3 className={s.h3}>Width</h3>
          <p className={s.sub}>The difference comes from the cabinet or filler beside it, so the run stays the same length.</p>
          <div className={s.row}>
            <input
              className={error ? s.inputBad : s.input}
              aria-label="Width"
              value={text}
              disabled={!canEdit}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
            />
            <button className={s.btn} disabled={!canEdit} onClick={apply}>
              Apply
            </button>
          </div>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </>
  );
}
