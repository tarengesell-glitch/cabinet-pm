'use client';
/**
 * The customize screens (the owner's Kitchen Studio prototype, 2026-11-08): a settings pane
 * (Room · Run · Cabinet · Checks) beside a studio-lit 3D view of the room, 40/60.
 *
 * Drawn from, and saved to, the room's master copy (placed items, schema 2; P1, P6): the
 * cabinets the placeholder AI step put down (no AI) are marked until a person changes or approves
 * them. Kept in this browser until the platform store exists. Live pricing is not connected
 * (no prices exist yet, DECISIONS P-1).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatInches, ITEM_CHECKS, runChecks, type Room } from '@/core/index';
import { can, type User } from '@/platform/index';
import { catalogItemCheck, CURRENT_CATALOG } from '@/modules/catalog/contract';
import { cabinetViews, editItems, placeholderItems, replaceRunItems, upperTopOf, type CabinetView, type ItemEdit } from '../model/cabinets';
import { fillEnds, refreshEnds, reviewEnds } from '../model/ends';
import { room as roomOf, wallLabel, type Draft } from '../model/editor';
import { RUN_KIND_LABEL } from '../model/layout';
import { applianceType, LAYOUT_RULES } from '../model/layout-rules';
import { DRAFT_SETTINGS, draftPlaceholder, itemByCode, runOf, standard, type DraftPreferences } from '../model/placeholder-draft';
import { parseSize } from './parseSize';
import { placeholderNotes, saveRoom, storedDraft } from './placeholder-store';
import { FrontIcon } from './FrontIcon';
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
/** The checks on the room's cabinets: Core's layout checks and the catalog's buildability checks. */
const CABINET_CHECKS = [...ITEM_CHECKS, catalogItemCheck(CURRENT_CATALOG)];

const nameOf = (c: CabinetView): string =>
  c.code ? (itemByCode(c.code)?.name ?? c.code) : c.appliance === 'hood' ? 'Hood' : c.appliance === 'millwork_hood' ? 'Millwork hood' : (applianceType(LAYOUT_RULES, c.appliance ?? '')?.name ?? c.appliance ?? 'Appliance');

export function Customize({ user, room: cr }: { user: User; room: CustomizeRoom }) {
  const canEdit = can(user, 'room.edit');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('room');
  const [selected, setSelected] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [message, setMessage] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);
  const [approveArmed, setApproveArmed] = useState(false);

  useEffect(() => {
    const d = storedDraft(cr.key);
    if (!d.ok) return setProblem(d.reason);
    if (roomOf(d.value).items.length === 0) return setProblem('This room has no cabinets yet. Run the AI design step first.');
    setDraft(d.value);
  }, [cr.key]);
  // Worked out once per saved copy: a new room object on every render rebuilt the 3D view each
  // time, which restarted the doors' opening over and over (owner, 2026-11-10).
  const room: Room | null = useMemo(() => (draft ? roomOf(draft) : null), [draft]);
  /** The screens' view of the master copy: cabinets with their runs, plus appliances and hoods. */
  const design = useMemo(() => (draft && room ? { cabinets: cabinetViews(room), notes: placeholderNotes(draft), upperTop: upperTopOf(room) } : null), [draft, room]);

  /** Cabinets whose saved ends don't match the layout: none saved yet (an older design), or different. */
  const endReview = useMemo(() => (room ? reviewEnds(room) : null), [room]);
  const onChange = cr.onChange;
  /** Saves a changed room into the master copy, with a history entry. */
  const keep = useCallback(
    (next: Room, summary: string, origin: 'ai' | 'designer'): boolean => {
      if (!draft) return false;
      const saved = saveRoom(cr.key, draft, next, summary, origin, user.id);
      if (!saved.ok) {
        setMessage({ kind: 'error', text: saved.reason });
        return false;
      }
      setDraft(saved.value);
      onChange?.();
      return true;
    },
    [cr.key, draft, onChange],
  );
  const edit = (e: ItemEdit): boolean => {
    if (!room || !canEdit) return false;
    const edited = editItems(room, e);
    // A width or type change can change what is beside a cabinet: ends that follow the layout are
    // worked out again; any other saved end is kept (model/ends.ts).
    const r = edited.ok && e.kind !== 'approve' ? refreshEnds(room, edited.value) : edited;
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.reason });
      return false;
    }
    setMessage(null);
    const summary = e.kind === 'approve' ? `Approved ${e.ids.length} cabinet${e.ids.length === 1 ? '' : 's'}` : e.kind === 'type' ? 'Changed a cabinet’s type' : 'Changed a cabinet’s width';
    return keep(r.value, summary, 'designer');
  };

  /** Saves ends a person asked to set (older designs, or ends out of date), as a designer change. */
  const saveEnds = (r: ReturnType<typeof fillEnds>, summary: string) => {
    if (!r.ok) return setMessage({ kind: 'error', text: r.reason });
    if (keep(r.value, summary, 'designer')) setMessage({ kind: 'notice', text: 'Cabinet ends saved.' });
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
    if (!design || !draft) return [];
    const out: { text: string; id: string | null; kind: 'review' | 'check' }[] = [];
    const pending = design.cabinets.filter((c) => !c.reviewed && c.code !== null);
    if (pending.length) out.push({ kind: 'review', text: `${pending.length} cabinet${pending.length === 1 ? '' : 's'} placed by the placeholder and not reviewed`, id: pending[0]!.id });
    // Core's layout checks and the catalog's buildability checks on the master copy. The same
    // finding on several cabinets is listed once, with how many it covers.
    const groups = new Map<string, { text: string; ids: string[] }>();
    for (const i of runChecks(CABINET_CHECKS, draft.job, {}).issues) {
      // A missing choice is listed once per choice, across every cabinet that needs it.
      const choice = /needs a choice for (“[^”]+”)/.exec(i.message)?.[1];
      const key = choice ? `choice ${choice}` : i.message.replace(/^Item \d+ in "[^"]*"/, 'Item').replace(/; it is .*$|, so .* can’t be checked\..*$/, '');
      const g = groups.get(key) ?? { text: i.message, ids: [] };
      g.ids.push(i.ref.id);
      groups.set(key, g);
    }
    for (const [key, g] of groups) {
      const n = g.ids.length;
      const text = key.startsWith('choice ') ? `${n} cabinet${n === 1 ? ' needs' : 's need'} a choice for ${key.slice(7)}.` : n > 1 ? `${g.text} (${n} cabinets)` : g.text;
      out.push({ kind: 'check', text, id: g.ids[0] ?? null });
    }
    return out;
  }, [design, draft]);

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
          {endReview && !endReview.ok && (
            <p className={s.error} role="alert">
              {endReview.reason}
            </p>
          )}
          {endReview?.ok && endReview.value.missing.length > 0 && (
            <div className={s.notice} role="status" data-testid="ends-missing">
              <p>
                {endReview.value.missing.length} cabinet{endReview.value.missing.length === 1 ? ' was' : 's were'} designed before cabinet ends were saved, so the 3D view shows no finished ends on {endReview.value.missing.length === 1 ? 'it' : 'them'}. Setting them works
                out each one’s left and right end from the layout (unfinished against a wall, cabinet or panel; an applied finished end where nothing is beside it) and saves a new version. Nothing else on
                the cabinets changes.
              </p>
              <button className={s.btn} disabled={!canEdit} onClick={() => room && endReview.ok && saveEnds(fillEnds(room, endReview.value.missing), 'Set cabinet ends from the layout (older design)')}>
                Set their ends from the layout
              </button>
            </div>
          )}
          {endReview?.ok && endReview.value.differ.length > 0 && (
            <div className={s.notice} role="status" data-testid="ends-differ">
              <p>
                {endReview.value.differ.length} cabinet{endReview.value.differ.length === 1 ? ' has an end' : 's have ends'} that differ from what the layout gives now: either chosen on purpose, or out of date after the
                room drawing changed. Updating replaces only those ends.
              </p>
              <button className={s.btn} disabled={!canEdit} onClick={() => room && endReview.ok && saveEnds(fillEnds(room, endReview.value.differ), 'Updated cabinet ends to match the layout')}>
                Update them to match the layout
              </button>
            </div>
          )}
          {tab === 'room' && (
            <>
              <div className={s.tiles}>
                <div className={s.tile}>
                  <div className={s.label}>Ceiling</div>
                  <div className={s.v}>{formatInches(room.ceiling_height.value)}</div>
                </div>
                <div className={s.tile}>
                  <div className={s.label}>Cabinets to</div>
                  <div className={s.v}>{formatInches(design.upperTop)}</div>
                </div>
                <div className={s.tile}>
                  <div className={s.label}>Cabinets</div>
                  <div className={s.v}>{design.cabinets.filter((c) => c.code !== null).length}</div>
                </div>
              </div>
              <section className={s.sec} aria-label="Finishes">
                <h3 className={s.h3}>Finishes</h3>
                <div className={s.swatches}>
                  {[
                    { name: 'Cabinets', hex: cr.look.door },
                    ...(cr.look.baseDoor !== cr.look.door ? [{ name: 'Base', hex: cr.look.baseDoor }] : []),
                    ...(cr.look.island !== cr.look.door ? [{ name: 'Island', hex: cr.look.island }] : []),
                    { name: 'Counter', hex: cr.look.counter },
                    { name: cr.look.doorHw === 'knob' ? 'Knobs' : 'Handles', hex: cr.look.doorHw === 'knob' ? cr.look.knobFinish : cr.look.pullFinish },
                  ].map((f) => (
                    <span key={f.name} className={s.swatch}>
                      <i style={{ background: f.hex }} />
                      {f.name}
                    </span>
                  ))}
                  <span className={s.swatch}>
                    <span className={s.swatchIcon}>
                      <FrontIcon item={itemByCode('base_doors')} width={30} height={34} size={34} finish={cr.look.door} />
                    </span>
                    Door style
                  </span>
                </div>
              </section>
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
                            <span className={s.chipIcon}>
                              <FrontIcon item={c.code ? itemByCode(c.code) : null} appliance={c.appliance} width={c.width} height={c.height || 34 * 64} size={30} selected={selected === c.id} finish={cr.look.door} />
                            </span>
                            <span className={s.chipW}>{c.code === null ? '' : formatInches(c.width).replace('"', '')}</span>
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
                      const items = placeholderItems(room, fresh.value);
                      if (!items.ok) return setMessage({ kind: 'error', text: items.reason });
                      const next = refreshEnds(room, replaceRunItems(room, items.value, run.run.run_id));
                      if (!next.ok) return setMessage({ kind: 'error', text: next.reason });
                      if (keep(next.value, 'Placeholder layout (no AI was used) of one run', 'ai'))
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
                row={design.cabinets.filter((c) => c.runId === sel.runId && c.layer === sel.layer).sort((a, b) => a.offset - b.offset)}
                finish={cr.look.door}
                onPick={pick}
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
              <p className={s.hint}>Core’s layout checks and the catalog’s checks, on the room’s master copy. The placeholder doesn’t choose door style or hinge sides yet, so those show as missing choices. It sets each cabinet’s ends from the layout, except an L-shaped corner cabinet’s, which wait for a decision.</p>
            </section>
          )}
        </div>
      </section>
      <section className={s.stageCol} aria-label="3D view">
        <Stage3D room={room} cabinets={design.cabinets} look={cr.look} selected={selected} doorsOpen={doorsOpen} fitToken={fitToken} onPick={pick} onError={show3dError} />
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
                  {formatInches(sel.height)}
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
          <div className={s.hint3d}>Click a cabinet · drag to turn · right-drag or Shift-drag to move · scroll to zoom · double-click to look there</div>
        </div>
      </section>
    </div>
  );
}

function CabinetTab(props: {
  room: Room;
  cab: CabinetView;
  canEdit: boolean;
  itemType: string | null;
  /** The cabinets in the same row (run and layer), left to right. */
  row: readonly CabinetView[];
  finish: string;
  onStep: (d: 1 | -1) => void;
  onEdit: (e: ItemEdit) => boolean;
  onTypeChange: (code: string) => void;
  onPick: (id: string) => void;
}) {
  const { room, cab, canEdit } = props;
  const [text, setText] = useState(formatInches(cab.width));
  const [error, setError] = useState<string | null>(null);
  const where = runOf(room, cab.runId);
  const item = cab.code ? itemByCode(cab.code) : null;
  const types = props.itemType && props.itemType !== 'filler' ? CURRENT_CATALOG.items.filter((i) => i.type === props.itemType && i.availability === 'available') : [];
  const step = DRAFT_SETTINGS.ok ? DRAFT_SETTINGS.value.widthStep : null;
  const setWidth = (width: number) => {
    setError(null);
    if (props.onEdit({ kind: 'width', id: cab.id, width })) setText(formatInches(width));
    else setText(formatInches(cab.width));
  };
  const apply = () => {
    const r = parseSize(text);
    if (!r.ok) return setError(r.reason);
    setWidth(r.value.value);
  };
  return (
    <>
      <div className={s.cabHero}>
        <span className={s.cabPic}>
          <FrontIcon item={item} appliance={cab.appliance} width={cab.width} height={cab.height || 34 * 64} size={88} selected finish={props.finish} />
        </span>
        <div className={s.cabInfo}>
          <h2 className={s.h2}>{nameOf(cab)}</h2>
          <p className={s.sub}>
            {where?.wall.kind === 'floating' ? 'Island' : wallLabel(room, cab.wallId).replace(/^w/, 'W')} · {formatInches(cab.offset - (where?.run.offset ?? 0))} from the run’s start
          </p>
          <div className={s.dimsRow}>
            <span>
              <b>W</b> {formatInches(cab.width)}
            </span>
            {cab.height > 0 && (
              <span>
                <b>H</b> {formatInches(cab.height)}
              </span>
            )}
            {cab.code && (
              <span>
                <b>D</b> {formatInches(cab.depth ?? standard(cab.code, 'depth') ?? 0)}
              </span>
            )}
          </div>
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
      {cab.code !== null && (
        <section className={s.sec}>
          <h3 className={s.h3}>Width</h3>
          <div className={s.rowStrip} aria-label="This cabinet in its row">
            {props.row.map((c) => (
              <button
                key={c.id}
                className={c.id === cab.id ? s.rowCellOn : s.rowCell}
                style={{ flex: `${Math.max(c.width / 64, 4)} 1 0` }}
                title={`${nameOf(c)} ${formatInches(c.width)}`}
                aria-label={`${nameOf(c)} ${formatInches(c.width)}`}
                onClick={() => props.onPick(c.id)}
              >
                {c.code ? formatInches(c.width).replace('"', '') : ''}
              </button>
            ))}
          </div>
          <p className={s.sub}>The cabinet or filler beside it gives or takes the difference, so the run stays the same length.</p>
          <div className={s.row}>
            {step !== null && (
              <button className={s.btnSq} disabled={!canEdit} aria-label={`Narrower by ${formatInches(step)}`} onClick={() => setWidth(cab.width - step)}>
                −
              </button>
            )}
            <input
              className={error ? s.inputBad : s.input}
              aria-label="Width"
              value={text}
              disabled={!canEdit}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
            />
            {step !== null && (
              <button className={s.btnSq} disabled={!canEdit} aria-label={`Wider by ${formatInches(step)}`} onClick={() => setWidth(cab.width + step)}>
                +
              </button>
            )}
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
      {types.length > 1 && (
        <section className={s.sec}>
          <h3 className={s.h3}>Type</h3>
          <div className={s.typeGrid} role="radiogroup" aria-label="Cabinet type">
            {types.map((t) => (
              <button key={t.code} role="radio" className={s.typeCard} aria-checked={t.code === cab.code} disabled={!canEdit} onClick={() => props.onTypeChange(t.code)}>
                <span className={s.typePic}>
                  <FrontIcon item={t} width={cab.width} height={cab.height || (t.size.height.default.value ?? 34 * 64)} size={44} selected={t.code === cab.code} finish={props.finish} />
                </span>
                <span className={s.typeName}>{t.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
