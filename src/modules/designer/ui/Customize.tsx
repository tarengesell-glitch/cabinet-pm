'use client';
/**
 * The customize screens (the owner's Kitchen Studio prototype, 2026-11-08): a settings pane
 * beside a studio-lit 3D view of the room, 40/60. The pane (owner, 2026-11-13): the room's
 * defaults (editable, drawn by the intake), everything to review (placements, checks, notes),
 * and below them the cabinet editor, for editing cabinets only.
 *
 * Drawn from, and saved to, the room's master copy (placed items, schema 2; P1, P6): the
 * cabinets the placeholder AI step put down (no AI) are marked until a person changes or approves
 * them. Kept in this browser until the platform store exists. Live pricing is not connected
 * (no prices exist yet, DECISIONS P-1).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatInches, ITEM_CHECKS, runChecks, type Room } from '@/core/index';
import { can, type User } from '@/platform/index';
import { catalogItemCheck, CURRENT_CATALOG } from '@/modules/catalog/contract';
import { cabinetViews, editItems, upperTopOf, type CabinetView, type ItemEdit } from '../model/cabinets';
import { fillEnds, refreshEnds, reviewEnds } from '../model/ends';
import { room as roomOf, type Draft } from '../model/editor';
import { applianceType, LAYOUT_RULES } from '../model/layout-rules';
import { islandPanelsOf, trimsOf, type DesignChoices } from '../model/choices';
import { itemByCode, standard } from '../model/placeholder-draft';
import { lookOptions } from '../model/appliance-looks';
import { placeholderNotes, saveRoom, storedDraft } from './placeholder-store';
import { CabinetEditor } from './CabinetEditor';
import { Stage3D } from './Stage3D';
import s from './Customize.module.css';

export interface CustomizeRoom {
  /** The room's ID in the design choices; its drawing and design are kept under it. */
  readonly key: string;
  readonly name: string;
  /** The room's design choices as editable defaults, drawn by the module that owns them (the intake). */
  readonly defaults: ReactNode;
  /** The room's design choices for the layout (re-drafting a run) and the 3D view (the look, the island panels), checked here before use. */
  readonly designChoices: DesignChoices;
  /** Called after every saved change. */
  readonly onChange?: () => void;
}

type PaneTab = 'defaults' | 'review';
const PANE_TABS: readonly { id: PaneTab; name: string }[] = [
  { id: 'defaults', name: 'Room defaults' },
  { id: 'review', name: 'To review' },
];
/** The checks on the room's cabinets: Core's layout checks and the catalog's buildability checks. */
const CABINET_CHECKS = [...ITEM_CHECKS, catalogItemCheck(CURRENT_CATALOG)];

/** The history line for each kind of change. */
function summaryOf(e: ItemEdit): string {
  switch (e.kind) {
    case 'approve':
      return `Approved ${e.ids.length} cabinet${e.ids.length === 1 ? '' : 's'}`;
    case 'type':
      return 'Changed a cabinet’s type';
    case 'width':
    case 'resize':
      return 'Changed a cabinet’s width';
    case 'move':
      return 'Moved a cabinet along its wall';
    case 'preset':
      return 'Changed a cabinet to another library cabinet';
    case 'insert':
      return e.insert ? `Put a drawer insert in drawer ${e.drawer}` : `Took the insert out of drawer ${e.drawer}`;
    case 'split':
      return e.direction === 'side_by_side' ? 'Split a cabinet into two, side by side' : 'Split a cabinet into two, stacked';
    case 'box':
      return 'Changed a cabinet’s size or position';
    case 'option':
      return `Changed a cabinet’s ${e.option.replace(/_/g, ' ')}`;
    case 'sections':
      return 'Changed a cabinet’s front and interior';
    case 'appliance':
      return `Changed an appliance’s ${e.option}`;
  }
}

const nameOf = (c: CabinetView): string =>
  c.code ? (itemByCode(c.code)?.name ?? c.code) : c.appliance === 'hood' ? 'Hood' : c.appliance === 'millwork_hood' ? 'Millwork hood' : (applianceType(LAYOUT_RULES, c.appliance ?? '')?.name ?? c.appliance ?? 'Appliance');

export function Customize({ user, room: cr }: { user: User; room: CustomizeRoom }) {
  const canEdit = can(user, 'room.edit');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);
  const [approveArmed, setApproveArmed] = useState(false);
  /** The pane's tab while no cabinet is picked; a picked cabinet's editor takes the whole pane (owner, 2026-11-13). */
  const [tab, setTab] = useState<PaneTab>('review');
  /** The sink, dishwasher or fridge whose look choices are open (owner, 2026-11-12), by placement ID. */
  const [lookFor, setLookFor] = useState<string | null>(null);
  /** The island panels, checked: a panel the 3D view can't show is reported. */
  const panels = islandPanelsOf(cr.designChoices);
  /** A top trim or valance the 3D view can't draw is reported, never drawn as another one. */
  const trimProblems = trimsOf(cr.designChoices.look).problems;

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
  /**
   * Undo and redo (owner, 2026-11-12: "Ctrl+z doesn't seem to undo"): the rooms before each change
   * made here. Undoing saves the earlier room as a new version, so no saved version is changed (rule 12).
   */
  const [undo, setUndo] = useState<{ room: Room; summary: string }[]>([]);
  const [redo, setRedo] = useState<{ room: Room; summary: string }[]>([]);
  const keep = useCallback(
    (next: Room, summary: string, origin: 'ai' | 'designer', how: 'edit' | 'undo' | 'redo' = 'edit'): boolean => {
      if (!draft) return false;
      const before = roomOf(draft);
      const saved = saveRoom(cr.key, draft, next, summary, origin, user.id);
      if (!saved.ok) {
        setMessage({ kind: 'error', text: saved.reason });
        return false;
      }
      if (how === 'edit') {
        setUndo((u) => [...u.slice(-49), { room: before, summary }]);
        setRedo([]);
      }
      setDraft(saved.value);
      onChange?.();
      return true;
    },
    [cr.key, draft, onChange, user.id],
  );
  const step = useCallback(
    (way: 'undo' | 'redo') => {
      if (!draft || !canEdit) return;
      const from = way === 'undo' ? undo : redo;
      const last = from[from.length - 1];
      if (!last) return;
      const now = roomOf(draft);
      if (!keep(last.room, `${way === 'undo' ? 'Undid' : 'Redid'}: ${last.summary}`, 'designer', way)) return;
      (way === 'undo' ? setUndo : setRedo)(from.slice(0, -1));
      (way === 'undo' ? setRedo : setUndo)((o) => [...o, { room: now, summary: last.summary }]);
    },
    [draft, canEdit, undo, redo, keep],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing in a box keeps the box's own undo.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'y') {
        e.preventDefault();
        step(k === 'y' || e.shiftKey ? 'redo' : 'undo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);
  const edit = (e: ItemEdit): boolean => {
    if (!room || !canEdit) return false;
    const edited = editItems(room, e);
    // A width or type change can change what is beside a cabinet: ends that follow the layout are
    // worked out again; an end that differs from the rule is kept (model/ends.ts, limitation END-4).
    // An end set by hand is kept as chosen; other layout changes work ends out again.
    // A cleared end goes back to the layout's end at once (END-4's "use the layout's end").
    const r = !edited.ok
      ? edited
      : e.kind === 'option' && e.value === null && (e.option === 'end_left' || e.option === 'end_right')
        ? fillEnds(edited.value, [e.id])
        : e.kind !== 'approve' && e.kind !== 'option' && e.kind !== 'sections' && e.kind !== 'appliance' && e.kind !== 'insert'
          ? refreshEnds(room, edited.value)
          : edited;
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.reason });
      return false;
    }
    // A change that breaks a placed-item check (on its wall, along it, under the ceiling, clear of
    // openings, no overlaps) is refused while editing a draft (REQUIREMENTS "What blocks").
    const before = new Set(runChecks(ITEM_CHECKS, draft!.job, {}).issues.map((i) => i.message));
    const fresh = runChecks(ITEM_CHECKS, { ...draft!.job, rooms: [r.value] }, {}).issues.filter((i) => !before.has(i.message));
    if (fresh.length) {
      setMessage({ kind: 'error', text: `Not changed: ${fresh[0]!.message}` });
      return false;
    }
    setMessage(null);
    const summary = summaryOf(e);
    return keep(r.value, summary, 'designer');
  };

  /** Saves ends a person asked to set (older designs, or ends out of date), as a designer change. */
  const saveEnds = (r: ReturnType<typeof fillEnds>, summary: string) => {
    if (!r.ok) return setMessage({ kind: 'error', text: r.reason });
    if (keep(r.value, summary, 'designer')) setMessage({ kind: 'notice', text: 'Cabinet ends saved.' });
  };

  /** Selects a cabinet (from the 3D view or a check); the cabinet editor shows it. */
  const pick = useCallback((id: string) => setSelected(id), []);
  const deselect = useCallback(() => setSelected(null), []);
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

  const stepCab = (d: 1 | -1) => {
    const list = design.cabinets;
    const i = sel ? list.indexOf(sel) : -1;
    const next = list[(i + d + list.length) % list.length];
    if (next) pick(next.id);
  };

  return (
    <div className={s.ws}>
      <section className={s.pane} aria-label="Settings">
        <div className={s.tabs} role="tablist" aria-label="Settings">
          {PANE_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              className={s.tab}
              aria-selected={!sel && tab === t.id}
              onClick={() => {
                setSelected(null);
                setTab(t.id);
              }}
            >
              {t.name}
              {t.id === 'review' && issues.length > 0 && <span className={s.count}>{issues.length}</span>}
            </button>
          ))}
        </div>
        <div className={s.body} role={sel ? undefined : 'tabpanel'}>
          {message && (
            <p className={message.kind === 'error' ? s.error : s.notice} role="status">
              {message.text}
            </p>
          )}
          {sel ? (
            <section className={s.sec} aria-label="Cabinet">
              <CabinetEditor key={sel.id} room={room} cab={sel} name={nameOf(sel)} canEdit={canEdit} onStep={stepCab} onEdit={edit} finish={cr.designChoices.look.door} onLooks={setLookFor} />
            </section>
          ) : tab === 'defaults' ? (
            <>
              <p className={s.sub}>
                Drawn room: ceiling {formatInches(room.ceiling_height.value)} · cabinets to {formatInches(design.upperTop)} · {design.cabinets.filter((c) => c.code !== null).length} cabinets
              </p>
              {cr.defaults}
            </>
          ) : (
            <>
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
          {endReview?.ok && endReview.value.overridden.length > 0 && (
            <p className={s.notice} role="status" data-testid="ends-overridden">
              {endReview.value.overridden.length} cabinet{endReview.value.overridden.length === 1 ? ' has an end' : 's have ends'} chosen by hand that the layout would now set differently. They are kept as chosen; pick
              “From the layout” on a cabinet’s end to change that.
            </p>
          )}
          {panels.problems.length + trimProblems.length > 0 && (
            <div className={s.notice} role="status" data-testid="panel-problems">
              {[...panels.problems, ...trimProblems].map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          )}
          <section className={s.sec} aria-label="Checks">
            <h3 className={s.h3}>Checks</h3>
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
              <p className={s.sub}>Nothing to fix.</p>
            )}
            <p className={s.hint}>Click one to select the cabinet it is about. Core’s layout checks and the catalog’s checks, on the room’s master copy. The placeholder doesn’t choose door style or hinge sides yet, so those show as missing choices. It sets each cabinet’s ends from the layout, except an L-shaped corner cabinet’s, which wait for a decision.</p>
          </section>
          <section className={s.sec} aria-label="How the placeholder laid it out">
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
        </div>
      </section>
      <section className={s.stageCol} aria-label="3D view">
        <Stage3D
          room={room}
          cabinets={design.cabinets}
          look={cr.designChoices.look}
          panels={panels}
          selected={selected}
          doorsOpen={doorsOpen}
          onPick={pick}
          onPickAppliance={setLookFor}
          onDeselect={deselect}
          {...(canEdit ? { onEdit: edit } : {})}
          onError={show3dError}
        />
        {lookFor && <ApplianceLooks room={room} placementId={lookFor} canEdit={canEdit} onEdit={edit} onClose={() => setLookFor(null)} />}
        <div className={s.hudTop}>
          <div className={s.hudCard}>
            <div className={s.label}>Live preview</div>
            <div className={s.hudTitle}>{cr.name}</div>
          </div>
          <div className={s.hudRow}>
            <button className={s.hudBtn} aria-pressed={doorsOpen} onClick={() => setDoorsOpen((o) => !o)}>
              {doorsOpen ? 'Close doors' : 'Open doors'}
            </button>
            <button className={s.hudBtn} disabled={!canEdit || undo.length === 0} onClick={() => step('undo')} aria-label="Undo" title="Undo (Ctrl+Z)">
              ↶
            </button>
            <button className={s.hudBtn} disabled={!canEdit || redo.length === 0} onClick={() => step('redo')} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              ↷
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
        </div>
      </section>
    </div>
  );
}

/** The pop-up of an appliance's look choices: a sink's colour, bowls and faucet; a dishwasher's or fridge's front (owner, 2026-11-12). */
function ApplianceLooks(props: { room: Room; placementId: string; canEdit: boolean; onEdit: (e: ItemEdit) => boolean; onClose: () => void }) {
  const a = props.room.walls.flatMap((w) => w.appliances).find((x) => x.placement_id === props.placementId);
  const onClose = props.onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  if (!a) return null;
  const options = lookOptions(a.kind);
  if (!options.length) return null;
  const name = applianceType(LAYOUT_RULES, a.kind)?.name ?? a.kind;
  return (
    <div className={s.modalBack} onClick={onClose}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-label={`${name} options`} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <h2 className={s.h2}>{name}</h2>
          <button className={s.btnGhost} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {options.map((o) => (
          <section key={o.code} className={s.sec}>
            <h3 className={s.h3}>{o.name}</h3>
            <div className={s.seg} role="radiogroup" aria-label={o.name}>
              {o.values.map((v) => (
                <button key={v.code} role="radio" aria-checked={a.selections?.[o.code] === v.code} className={s.segBtn} disabled={!props.canEdit} onClick={() => props.onEdit({ kind: 'appliance', placementId: a.placement_id, option: o.code, value: v.code })}>
                  {v.hex && <i className={s.dot} style={{ background: v.hex }} />}
                  {v.name}
                </button>
              ))}
            </div>
            {!a.selections?.[o.code] && <p className={s.sub}>Not chosen yet: drawn in stainless{o.code === 'bowls' ? ' with one bowl' : ''}.</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
