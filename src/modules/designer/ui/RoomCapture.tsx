'use client';
/**
 * Room drawing screen (UX brief screen 07, first slice). A PREVIEW:
 * - the room is kept in this browser only (no database yet);
 * - the user and shop are mocked (no sign-in yet), and the screen says so.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ITEM_CHECKS, JobSchema, RUN_CHECKS, WALL_CHECKS, examples, runChecks, type Length, type Opening, type Point, type Result, type Room } from '@/core/index';
import { can, PREVIEW_SHOP, type User } from '@/platform/index';
import {
  addWall,
  addWallByLength,
  commit,
  deleteOpening,
  deleteWall,
  deleteWalls,
  setWallsThickness,
  setWallKind,
  findOpening,
  loadJob,
  moveCorner,
  moveOpening,
  resizeOpening,
  resizeWall,
  slideWall,
  placeOpening,
  redo,
  renameRoom,
  room as roomOf,
  setOpeningKind,
  setDoorSwing,
  swingFromHanding,
  setProvenance,
  setSize,
  startRoom,
  startTimeline,
  undo,
  upgradeStoredDraft,
  type Change,
  type Draft,
  type Env,
  type Timeline,
} from '../model/editor';
import type { DesignChoices } from '../model/choices';
import { findAppliance, findRun } from '../model/layout';
import { freestandingKinds, LAYOUT_RULES, rulesForRoom } from '../model/layout-rules';
import { ApplianceTray, RunsFrame } from './LayoutPanels';
import { OpeningIcon } from './applianceIcons';
import { STEP_LABEL, StepList, type StepId } from './Steps';
import { applyLayoutEdit, type LayoutEdit } from './layoutEdits';
import { ChecksMenu, OpeningPanel, RoomPanel, StartRoomForm, WallPanel, WallsPanel, KIND_LABEL } from './Panels';
import { PlanCanvas, selectedWallIds, wallSelection, type Selection, type Tool } from './PlanCanvas';
import { downloadText, readStored, storageKey, writeStored } from './storage';
import s from './RoomCapture.module.css';

const TOOL_HINT: Record<Tool, string> = {
  select: 'Tap a wall, door or window on the plan to change it.',
  draw: 'Tap corner to corner. Tap the first corner, or Finish, to stop.',
  floating: 'Click where the island or peninsula wall starts, then where it ends.',
  door: 'Move onto a wall and click to place.',
  window: 'Move onto a wall and click to place.',
  passthrough: 'Move onto a wall and click to place.',
  layout: 'Tap a wall to fill it with cabinets, or drag along it. Drag on the floor for an island. Place appliances from the tray.',
};

type WallTool = 'select' | 'draw' | 'floating';
const WALL_TOOLS: readonly { tool: WallTool; label: string; hint: string }[] = [
  { tool: 'select', label: 'Select', hint: 'Tap a wall to change it, or drag its handles.' },
  { tool: 'draw', label: 'Room wall', hint: 'Tap corner to corner, or point the way, type a length and press Enter. Tap the first corner, or Finish, to stop.' },
  { tool: 'floating', label: 'Floating wall', hint: 'For islands and peninsulas: tap where the line starts, then where it ends. It has no thickness and no doors or windows.' },
];

/** The step a selection belongs to: picking something on the plan opens its step. */
const stepFor = (sel: Selection): StepId | null =>
  !sel ? null : sel.kind === 'wall' || sel.kind === 'walls' ? 'walls' : sel.kind === 'opening' ? 'openings' : sel.kind === 'runs' ? 'cabinets' : 'appliances';

const runIds = (r: Room) => new Set(r.walls.flatMap((w) => w.runs.map((x) => x.run_id)));
const applianceIds = (r: Room) => new Set(r.walls.flatMap((w) => w.appliances.map((a) => a.placement_id)));
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** What to select after a layout edit is saved: the run or appliance it made, if any. */
function selectionAfter(edit: LayoutEdit, before: Room, after: Room): Selection | 'keep' {
  const newRuns = [...runIds(after)].filter((id) => !runIds(before).has(id));
  const newAppliances = [...applianceIds(after)].filter((id) => !applianceIds(before).has(id));
  switch (edit.kind) {
    case 'fill':
    case 'draw':
    case 'island-add':
    case 'split':
      return newRuns.length > 0 ? { kind: 'runs', ids: [newRuns[newRuns.length - 1] as string] } : 'keep';
    case 'appliance-place': {
      // The appliance itself (a sink), not the dishwasher it brought.
      const placed = newAppliances.find((id) => findAppliance(after, id)?.appliance.kind === edit.applianceKind);
      return placed ? { kind: 'appliance', id: placed } : 'keep';
    }
    case 'appliance-move':
      return { kind: 'appliance', id: edit.placementId };
    case 'run-kind':
      return { kind: 'runs', ids: [...edit.runIds.filter((id) => findRun(after, id)), ...newRuns] };
    case 'delete-runs':
    case 'delete-appliances':
      return null;
    default:
      return 'keep';
  }
}

/**
 * A room of the design choices, when the drawing sits inside the design studio. The studio's
 * header shows the job and the rooms; each room is kept on its own.
 */
export interface StudioRoom {
  /** The room's ID in the design choices; it is also where its drawing is kept. */
  readonly key: string;
  readonly name: string;
  /** The rough ceiling height from the design choices (unmeasured), or null when there is none. */
  readonly ceiling: Length | null;
  /** Called after every saved change, so the studio can update its room list. */
  readonly onChange?: () => void;
  /**
   * Which kind of room it is, for its fixtures and cabinet depths (owner, 2026-11-09): "bath" for
   * bathroom-type rooms, "kitchen" otherwise. From the design choices (`DesignChoices.roomKind`), through the app.
   */
  readonly roomSet?: DesignChoices['roomKind'] | null;
}

export function RoomCapture({ user, studio }: { user: User; studio?: StudioRoom }) {
  const key = storageKey(studio?.key ?? null);
  const onStudioChange = studio?.onChange;
  const rules = useMemo(() => rulesForRoom(studio?.roomSet ?? null), [studio?.roomSet]);
  /** A studio room with no drawing yet starts at once, from its name and rough ceiling height. */
  const startWith = studio && studio.ceiling !== null ? { name: studio.name, ceiling: studio.ceiling } : null;
  const startRef = useRef(startWith);
  const canView = can(user, 'room.view');
  const canEdit = can(user, 'room.edit');

  const env: Env = useMemo(
    () => ({ newId: () => crypto.randomUUID(), now: () => new Date().toISOString(), userId: user.id }),
    [user.id],
  );

  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [storageProblem, setStorageProblem] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState<{ raw: string; reason: string } | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  /** The open step (null when all are closed), the steps visited, and each step's own choice. */
  const [step, setStep] = useState<StepId | null>('walls');
  const [visited, setVisited] = useState<ReadonlySet<StepId>>(() => new Set<StepId>(['walls']));
  const [wallTool, setWallTool] = useState<WallTool>('select');
  const [openingTool, setOpeningTool] = useState<Opening['kind'] | null>(null);
  /** On a phone the steps are a bottom sheet, which can be folded down to see the plan. */
  const [sheetOpen, setSheetOpen] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [chainStart, setChainStart] = useState<Point | null>(null);
  /** While a wall handle is dragged: the room with the move applied, not yet saved. */
  const [dragPreview, setDragPreview] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);
  /** An appliance picked in the tray, waiting to be placed on the plan. */
  const [armed, setArmed] = useState<string | null>(null);
  /** The plan fills this in: where an appliance dragged from the tray is, and its drop. */
  const trayDropRef = useRef<((kind: string, clientX: number, clientY: number, done: boolean) => void) | null>(null);

  // Load what was kept in this browser.
  useEffect(() => {
    const stored = readStored(key);
    if (stored.kind === 'unavailable') setStorageProblem(`This browser won't keep your work (${stored.reason}).`);
    else if (stored.kind === 'unreadable') setUnreadable({ raw: stored.raw, reason: stored.reason });
    else if (stored.kind === 'found') {
      const upgraded = upgradeStoredDraft(stored.data);
      const r = loadJob(upgraded.job, upgraded.wallDefaults);
      if (r.ok) {
        setTimeline(startTimeline(r.value.draft));
        if (upgraded.notes.length) setMessage({ kind: 'notice', text: upgraded.notes.join(' ') });
      } else setUnreadable({ raw: stored.raw, reason: r.reason });
    } else if (stored.kind === 'none' && startRef.current) {
      // The ceiling height is the rough one from the design choices: unmeasured until confirmed.
      const r = startRoom(env, { name: startRef.current.name, shopId: PREVIEW_SHOP.id, ceiling: { value: startRef.current.ceiling, source_mm: null } });
      if (r.ok) {
        setTimeline(startTimeline(r.value.draft));
        setWallTool('draw');
        setTool('draw');
      } else setMessage({ kind: 'error', text: r.reason });
    }
    setLoaded(true);
  }, [key, env]);

  // Keep it in this browser after every change.
  useEffect(() => {
    if (!loaded || unreadable) return;
    const problem = writeStored(timeline?.present ?? null, key);
    setStorageProblem(problem ? `Your work is NOT being kept in this browser (${problem}). Download it to keep it.` : null);
    onStudioChange?.();
  }, [timeline, loaded, unreadable, key, onStudioChange]);

  const apply = useCallback(
    (result: Result<Change>): Result<Change> => {
      if (result.ok) {
        setTimeline((t) => (t ? commit(t, result.value.draft) : startTimeline(result.value.draft)));
        setMessage(result.value.notices.length ? { kind: 'notice', text: result.value.notices.join(' ') } : null);
      }
      return result;
    },
    [],
  );

  const draft = timeline?.present ?? null;
  const room = draft ? roomOf(draft) : null;

  const formatErrors = useMemo(() => {
    if (!draft) return [];
    const r = JobSchema.safeParse(draft.job);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  }, [draft]);
  const checkRun = useMemo(() => (draft && formatErrors.length === 0 ? runChecks([...WALL_CHECKS, ...RUN_CHECKS, ...ITEM_CHECKS], draft.job, { freestanding_kinds: freestandingKinds() }) : null), [draft, formatErrors]);
  const issues = checkRun?.issues ?? [];

  const doUndo = useCallback(() => setTimeline((t) => (t ? undo(t) : t)), []);
  const doRedo = useCallback(() => setTimeline((t) => (t ? redo(t) : t)), []);

  /** Deletes whatever is selected: walls (with their doors and windows) or one opening. */
  const deleteSelected = useRef<() => void>(() => undefined);
  deleteSelected.current = () => {
    if (!draft || !selection) return;
    const r =
      selection.kind === 'opening'
        ? apply(deleteOpening(draft, env, selection.id))
        : selection.kind === 'runs'
          ? apply(applyLayoutEdit(draft, env, { kind: 'delete-runs', runIds: selection.ids }, rules))
          : selection.kind === 'appliance'
            ? apply(applyLayoutEdit(draft, env, { kind: 'delete-appliances', placementIds: [selection.id] }, rules))
            : apply(deleteWalls(draft, env, selectedWallIds(selection)));
    if (r.ok) setSelection(null);
    else setMessage({ kind: 'error', text: r.reason });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape') {
        setChainStart(null);
        setArmed(null);
        // Esc puts down a door, window or passthrough that was picked up.
        setOpeningTool((k) => {
          if (k) setTool('select');
          return null;
        });
      }
      if (typing || !canEdit) return;
      // The Mac "delete" key sends Backspace.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected.current();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, doUndo, doRedo]);

  // A selection pointing at something that no longer exists (after undo or delete) is cleared.
  useEffect(() => {
    if (!room || !selection) return;
    if (selection.kind === 'opening') {
      if (findOpening(room, selection.id) === null) setSelection(null);
      return;
    }
    if (selection.kind === 'appliance') {
      if (findAppliance(room, selection.id) === null) setSelection(null);
      return;
    }
    if (selection.kind === 'runs') {
      const still = selection.ids.filter((id) => findRun(room, id) !== null);
      if (!sameIds(still, selection.ids)) setSelection(still.length > 0 ? { kind: 'runs', ids: still } : null);
      return;
    }
    const ids = selectedWallIds(selection);
    const still = ids.filter((id) => room.walls.some((w) => w.wall_id === id));
    if (still.length !== ids.length) setSelection(wallSelection(still));
  }, [room, selection]);

  const screen = studio ? s.embedded : s.screen;
  if (!canView) {
    return (
      <div className={screen}>
        <div className={s.blocked}>
          <h1 className={s.title}>You don&apos;t have permission to see rooms</h1>
          <p className={s.muted}>Ask an owner or admin for the “room.view” permission.</p>
        </div>
      </div>
    );
  }

  /** Switches the plan's tool (clearing anything half done). */
  const switchTool = (t: Tool, keepSelection = false) => {
    setTool(t);
    setChainStart(null);
    setArmed(null);
    setDragPreview(null);
    if (!keepSelection && t !== 'select') setSelection(null);
  };
  /** The tool a step works with: its own choice for walls and openings; the layout tool after. */
  const toolForStep = (st: StepId | null, walls: WallTool = wallTool, opening: Opening['kind'] | null = openingTool): Tool =>
    st === 'walls' ? walls : st === 'openings' ? opening ?? 'select' : st === null ? 'select' : 'layout';
  /** Opens a step (closing the others). Opening the step already open keeps it open. */
  const openStep = (st: StepId | null, keepSelection = false) => {
    setStep(st);
    if (st) setVisited((v) => new Set([...v, st]));
    setSheetOpen(true);
    if (!keepSelection) setSelection(null);
    switchTool(toolForStep(st), keepSelection);
  };
  /** Selects something; if it belongs to another step, that step opens with it selected. */
  const selectAndOpen = (sel: Selection) => {
    setSelection(sel);
    const target = stepFor(sel);
    if (!target || target === step) return;
    setStep(target);
    setVisited((v) => new Set([...v, target]));
    // Walls and openings are selected with their step's Select choice.
    if (target === 'walls') setWallTool('select');
    if (target === 'openings') setOpeningTool(null);
    switchTool(target === 'walls' || target === 'openings' ? 'select' : 'layout', true);
  };

  /**
   * A rough-layout edit from the plan or the side frames. While dragging (done = false) it is
   * only shown; on release it is saved as one undo step, and what it made is selected.
   */
  const layoutEdit = (edit: LayoutEdit, done: boolean): Result<Change> | null => {
    if (!draft) return null;
    const r = applyLayoutEdit(draft, env, edit, rules);
    if (!done) {
      if (r.ok) setDragPreview(r.value.draft);
      return r;
    }
    setDragPreview(null);
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.reason });
      return r;
    }
    apply(r);
    const next = selectionAfter(edit, roomOf(draft), roomOf(r.value.draft));
    if (next !== 'keep') selectAndOpen(next);
    return r;
  };

  /** "Add island": the starting size, in the middle of the room. */
  const addIslandInMiddle = () => {
    if (!room) return;
    const pts = room.walls.filter((w) => w.kind === 'room').flatMap((w) => [w.start_point, w.end_point]);
    if (pts.length === 0) return setMessage({ kind: 'error', text: 'Draw the room\'s walls first.' });
    const mid = (vs: number[]) => Math.round((Math.min(...vs) + Math.max(...vs)) / 2 / 64) * 64;
    layoutEdit(
      { kind: 'island-add', centre: { x: mid(pts.map((p) => p.x)), y: mid(pts.map((p) => p.y)) }, along: 'x', length: LAYOUT_RULES.islandStartSize.length, depth: LAYOUT_RULES.islandStartSize.depth },
      true,
    );
  };

  const loadExample = (which: 'kitchen' | 'lshape') => {
    if (room && room.walls.length > 0 && !window.confirm('Replace this room with the example? (Undo brings it back.)')) return;
    const example = which === 'kitchen' ? examples.kitchen() : examples.lShapeWithAngledWall();
    // An example is loaded as this preview's job: the preview's shop, so the catalog can check it.
    const job = { ...example, shop_id: PREVIEW_SHOP.id };
    const r = apply(loadJob(job, null));
    if (!r.ok) setMessage({ kind: 'error', text: r.reason });
    setSelection(null);
  };

  const header = (
    <header className={s.header}>
      {!studio && <h1 className={s.title}>{room ? room.name : 'Room drawing'}</h1>}
      <span className={s.banner}>Preview: saved in this browser only</span>
      {storageProblem && <span className={s.bannerDanger} role="alert">{storageProblem}</span>}
      {draft && room && <ChecksMenu formatErrors={formatErrors} issues={issues} onSelect={selectAndOpen} />}
      <span className={s.spacer} />
      {/* Inside the studio, its header says the user and shop are mocked. */}
      {!studio && <span className={s.mockNote}>
        {user.mocked && `${user.name} · `}
        {PREVIEW_SHOP.name}
        {!canEdit && ' · read-only'}
      </span>}
      {studio && !canEdit && <span className={s.mockNote}>Read-only</span>}
    </header>
  );

  if (!loaded) return <div className={screen}>{header}</div>;

  if (unreadable) {
    return (
      <div className={screen}>
        {header}
        <div className={s.blocked}>
          <h2 className={s.title}>The room saved in this browser can&apos;t be read</h2>
          <p className={s.error}>{unreadable.reason}</p>
          <p className={s.muted}>Nothing has been thrown away. Download it to keep it, then start again.</p>
          <div className={s.row} style={{ justifyContent: 'center' }}>
            <button className={s.button} onClick={() => downloadText('unreadable-room.json', unreadable.raw)}>
              Download it
            </button>
            <button className={s.buttonDanger} onClick={() => window.confirm('Start again? Download the old room first if you need it.') && setUnreadable(null)}>
              Start again
            </button>
          </div>
        </div>
      </div>
    );
  }

  /**
   * A handle drag: show the move while dragging; save it (one undo step) on release.
   * A move that is refused mid-drag keeps the last good preview; on release it is explained.
   */
  const handleDrag = (r: Result<Change>, done: boolean) => {
    if (!done) {
      if (r.ok) setDragPreview(r.value.draft);
      return;
    }
    setDragPreview(null);
    if (r.ok) apply(r);
    else if (r.reason !== 'Nothing moved.') setMessage({ kind: 'error', text: r.reason });
  };

  /** Drops a standard opening and selects it so it can be customized. */
  const dropOpening = (wallId: string, kind: Opening['kind'], centre: number | null) => {
    if (!draft) return;
    const r = apply(placeOpening(draft, env, wallId, kind, centre));
    if (!r.ok) return setMessage({ kind: 'error', text: r.reason });
    const wall = roomOf(r.value.draft).walls.find((w) => w.wall_id === wallId);
    const added = wall?.openings[wall.openings.length - 1];
    setTool('select');
    setOpeningTool(null);
    if (added) selectAndOpen({ kind: 'opening', id: added.opening_id });
  };

  const multiWalls = room && selection?.kind === 'walls' ? room.walls.filter((w) => selection.ids.includes(w.wall_id)) : [];
  const selectedWall = room && selection?.kind === 'wall' ? room.walls.find((w) => w.wall_id === selection.id) ?? null : null;
  const selectedOpening = room && selection?.kind === 'opening' ? findOpening(room, selection.id) : null;

  // The Walls step shows the selected wall (or walls); with nothing selected, the room itself.
  const wallPanels =
    !draft || !room ? null : selectedWall ? (
      <WallPanel
        key={selectedWall.wall_id}
        room={room}
        wall={selectedWall}
        canEdit={canEdit}
        onSelect={selectAndOpen}
        onSize={(field, v) => apply(setSize(draft, env, { kind: 'wall', id: selectedWall.wall_id, field }, v))}
        onProvenance={(field, p) => apply(setProvenance(draft, env, { kind: 'wall', id: selectedWall.wall_id, field }, p))}
        onAddOpening={(kind) => dropOpening(selectedWall.wall_id, kind, null)}
        onKind={(kind) => apply(setWallKind(draft, env, selectedWall.wall_id, kind))}
        onDelete={() => {
          const r = apply(deleteWall(draft, env, selectedWall.wall_id));
          if (r.ok) setSelection(null);
        }}
      />
    ) : multiWalls.length > 1 ? (
      <WallsPanel
        key={multiWalls.map((w) => w.wall_id).join()}
        room={room}
        walls={multiWalls}
        canEdit={canEdit}
        onSelect={selectAndOpen}
        onThickness={(v) => apply(setWallsThickness(draft, env, multiWalls.map((w) => w.wall_id), v))}
        onDelete={() => deleteSelected.current()}
      />
    ) : (
      <>
        <RoomPanel
          key={room.room_id}
          room={room}
          wallDefaults={draft.wallDefaults}
          canEdit={canEdit}
          onSelect={selectAndOpen}
          onRename={(name) => apply(renameRoom(draft, env, name))}
          onCeiling={{
            set: (v) => apply(setSize(draft, env, { kind: 'room', field: 'ceiling_height' }, v)),
            provenance: (p) => apply(setProvenance(draft, env, { kind: 'room', field: 'ceiling_height' }, p)),
          }}
          onDefaults={(field, v) => apply(setSize(draft, env, { kind: 'wall-defaults', field }, v))}
          onNewRoom={() => {
            if (!window.confirm('Start a new room? This one is replaced (download it first to keep it).')) return;
            setTimeline(null);
            setSelection(null);
            setChainStart(null);
            setWallTool('select');
            setStep('walls');
            setTool('select');
          }}
        />
        <section className={s.card}>
          <h2 className={s.cardTitle}>Examples</h2>
          <div className={s.row}>
            <button className={s.button} disabled={!canEdit} onClick={() => loadExample('kitchen')}>
              Load example kitchen
            </button>
            <button className={s.button} disabled={!canEdit} onClick={() => loadExample('lshape')}>
              Load example L-shaped room
            </button>
          </div>
        </section>
      </>
    );

  // The Openings step shows the selected door, window or passthrough.
  const openingPanel =
    draft && room && selectedOpening ? (
      <OpeningPanel
        key={selectedOpening.opening.opening_id}
        room={room}
        wall={selectedOpening.wall}
        opening={selectedOpening.opening}
        canEdit={canEdit}
        onSelect={selectAndOpen}
        onKind={(k) => apply(setOpeningKind(draft, env, selectedOpening.opening.opening_id, k))}
        onHanding={(hand, swings) => apply(setDoorSwing(draft, env, selectedOpening.opening.opening_id, swingFromHanding(room, hand, swings)))}
        onSize={(field, v) => apply(setSize(draft, env, { kind: 'opening', id: selectedOpening.opening.opening_id, field }, v))}
        onProvenance={(field, p) => apply(setProvenance(draft, env, { kind: 'opening', id: selectedOpening.opening.opening_id, field }, p))}
        onDelete={() => {
          const r = apply(deleteOpening(draft, env, selectedOpening.opening.opening_id));
          if (r.ok) setSelection(null);
        }}
      />
    ) : null;

  return (
    <div className={screen}>
      {header}
      <div className={s.body}>
        <div className={s.planColumn}>
          <div className={s.canvas}>
            {message && (
              // Floats over the top of the plan, so the plan never jumps when a notice appears.
              <div className={message.kind === 'error' ? s.toastError : s.toast} role="status">
                <span>{message.text}</span>
                <button className={s.toastClose} aria-label="Dismiss" onClick={() => setMessage(null)}>
                  ×
                </button>
              </div>
            )}
            {room && (
              <PlanCanvas
                room={dragPreview ? roomOf(dragPreview) : room}
                baseRoom={room}
                onCornerDrag={(from, to, done) => handleDrag(moveCorner(draft!, env, from, to), done)}
                onWallSlide={(wallId, distance, done) => handleDrag(slideWall(draft!, env, wallId, distance), done)}
                onWallResize={(wallId, which, length, done) =>
                  handleDrag(resizeWall(draft!, env, wallId, which, { value: length, source_mm: null }), done)
                }
                onDragCancel={() => setDragPreview(null)}
                tool={tool}
                selection={selection}
                issues={issues}
                canEdit={canEdit}
                onSelect={selectAndOpen}
                onUndo={doUndo}
                onRedo={doRedo}
                canUndo={canEdit && !!timeline && timeline.past.length > 0}
                canRedo={canEdit && !!timeline && timeline.future.length > 0}
                onAddWallTyped={(from, length, angle) => {
                  if (!draft) return null;
                  const r = apply(addWallByLength(draft, env, length, angle, from, tool === 'floating' ? 'floating' : 'room'));
                  if (!r.ok) {
                    setMessage({ kind: 'error', text: r.reason });
                    return null;
                  }
                  const walls = roomOf(r.value.draft).walls;
                  return walls[walls.length - 1]?.end_point ?? null;
                }}
                onDrawError={(reason) => setMessage({ kind: 'error', text: reason })}
                onWallLengthTyped={(wallId, length) => apply(setSize(draft!, env, { kind: 'wall', id: wallId, field: 'length' }, length))}
                                onAddWall={(a, b) => {
                  if (!draft) return;
                  const r = apply(addWall(draft, env, a, b, null, tool === 'floating' ? 'floating' : 'room'));
                  if (!r.ok) setMessage({ kind: 'error', text: r.reason });
                }}
                onPickWallForOpening={(wallId, centre) => {
                  if (!draft || tool === 'select' || tool === 'draw' || tool === 'floating' || tool === 'layout') return;
                  dropOpening(wallId, tool, centre);
                }}
                onLayoutEdit={(edit, done) => void layoutEdit(edit, done)}
                onLayoutCommand={(edit) => layoutEdit(edit, true) ?? { ok: false, reason: 'There is no room yet.' }}
                armed={armed}
                onArm={setArmed}
                onRunLengthLabel={(runId) => selectAndOpen({ kind: 'runs', ids: [runId] })}
                trayDropRef={trayDropRef}
                onOpeningMove={(openingId, wallId, offset, done) => handleDrag(moveOpening(draft!, env, openingId, offset, wallId), done)}
                onOpeningResize={(openingId, offset, width, done) => handleDrag(resizeOpening(draft!, env, openingId, offset, width), done)}
                chainStart={chainStart}
                onChainStart={setChainStart}
              />
            )}
          </div>
        </div>

        <aside className={s.panel} aria-label="Details">
          {!draft || !room ? (
            <StartRoomForm
              canEdit={canEdit}
              initialName={studio?.name ?? ''}
              onExample={loadExample}
              onStart={(input) => {
                const r = apply(startRoom(env, { ...input, shopId: PREVIEW_SHOP.id }));
                if (r.ok) {
                  setWallTool('draw');
                  setStep('walls');
                  setTool('draw');
                }
                return r;
              }}
            />
          ) : (
            <>
              <button className={s.sheetToggle} aria-expanded={sheetOpen} onClick={() => setSheetOpen((o) => !o)}>
                <span className={s.sheetGrip} aria-hidden="true" />
                {step ? STEP_LABEL[step] : 'Steps'}
                <span aria-hidden="true">{sheetOpen ? '▾' : '▴'}</span>
              </button>
              <div className={sheetOpen ? s.sheetBody : s.sheetBodyFolded}>
              <StepList
                open={step}
                visited={visited}
                onOpen={(st) => (st === step ? openStep(null) : openStep(st, stepFor(selection) === st))}
                content={(st) => {
                  if (st === 'walls')
                    return (
                      <>
                        <div className={s.segmented} role="group" aria-label="Wall tool">
                          {WALL_TOOLS.map((w) => (
                            <button
                              key={w.tool}
                              className={wallTool === w.tool ? s.buttonActive : s.button}
                              aria-pressed={wallTool === w.tool}
                              disabled={w.tool !== 'select' && !canEdit}
                              onClick={() => {
                                setWallTool(w.tool);
                                switchTool(w.tool);
                              }}
                            >
                              {w.label}
                            </button>
                          ))}
                        </div>
                        <p className={s.muted}>{WALL_TOOLS.find((w) => w.tool === wallTool)?.hint}</p>
                        {chainStart && (
                          <div className={s.row}>
                            <button className={s.buttonPrimary} onClick={() => setChainStart(null)}>
                              Finish
                            </button>
                          </div>
                        )}
                        {wallPanels}
                      </>
                    );
                  if (st === 'openings')
                    return (
                      <>
                        <div className={s.tiles} role="group" aria-label="Opening type">
                          {(['door', 'window', 'passthrough'] as const).map((k) => (
                            <button
                              key={k}
                              className={openingTool === k ? s.tileActive : s.tile}
                              aria-pressed={openingTool === k}
                              disabled={!canEdit}
                              onClick={() => {
                                const next = openingTool === k ? null : k;
                                setOpeningTool(next);
                                switchTool(next ?? 'select');
                              }}
                            >
                              <OpeningIcon kind={k} />
                              <span>{KIND_LABEL[k]}</span>
                            </button>
                          ))}
                        </div>
                        <p className={s.muted}>{openingTool ? TOOL_HINT[openingTool] : 'Pick Door, Window or Passthrough, then tap a wall to place it. Tap one on the plan to change it.'}</p>
                        {openingPanel}
                      </>
                    );
                  if (st === 'cabinets')
                    return (
                      <RunsFrame canEdit={canEdit} onAddIsland={addIslandInMiddle} />
                    );
                  return (
                    <>
                      <ApplianceTray
                        tray={rules.tray}
                        armed={armed}
                        canEdit={canEdit}
                        onArm={(k) => (setArmed(k), setSelection(null))}
                        onTrayDrag={(kind, x, y, done) => trayDropRef.current?.(kind, x, y, done)}
                      />
                      <div className={s.row} style={{ justifyContent: 'flex-end' }}>
                        <button className={s.buttonPrimary} onClick={() => openStep(null)}>
                          Done
                        </button>
                      </div>
                    </>
                  );
                }}
              />

              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
