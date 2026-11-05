'use client';
/**
 * Room drawing screen (UX brief screen 07, first slice). A PREVIEW:
 * - the room is kept in this browser only (no database yet);
 * - the user and shop are mocked (no sign-in yet), and the screen says so.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JobSchema, WALL_CHECKS, examples, runChecks, type Opening, type Point, type Result } from '@/core/index';
import { can, PREVIEW_SHOP, type User } from '@/platform/index';
import {
  addWall,
  addWallByLength,
  closeRoom,
  commit,
  deleteOpening,
  deleteWall,
  deleteWalls,
  setWallsThickness,
  findOpening,
  loadJob,
  moveOpening,
  placeOpening,
  redo,
  renameRoom,
  room as roomOf,
  setOpeningKind,
  setProvenance,
  setSize,
  startRoom,
  startTimeline,
  undo,
  upgradeStoredDraft,
  type Change,
  type Env,
  type Timeline,
} from '../model/editor';
import { AddWallForm, ChecksPanel, MasterCopyPanel, OpeningPanel, RoomPanel, StartRoomForm, WallPanel, WallsPanel, KIND_LABEL } from './Panels';
import { PlanCanvas, selectedWallIds, wallSelection, type Selection, type Tool } from './PlanCanvas';
import { downloadText, readStored, writeStored } from './storage';
import s from './RoomCapture.module.css';

const TOOL_HINT: Record<Tool, string> = {
  select: 'Tap a wall, door or window to edit it. Drag across the plan to select several walls (Shift-click adds one). Delete removes what is selected. Scroll to zoom; scroll sideways to move left and right.',
  draw: 'Tap corner to corner. Snaps to corners, whole inches and 45°. Tap the first corner, or Finish, to stop.',
  door: 'Move the door onto a wall (it shows the distance to each end), then click to place it. Drag it or type sizes after.',
  window: 'Move the window onto a wall (it shows the distance to each end), then click to place it. Drag it or type sizes after.',
  passthrough: 'Move the passthrough onto a wall (it shows the distance to each end), then click to place it. Drag it or type sizes after.',
};

export function RoomCapture({ user }: { user: User }) {
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
  const [selection, setSelection] = useState<Selection>(null);
  const [chainStart, setChainStart] = useState<Point | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);

  // Load what was kept in this browser.
  useEffect(() => {
    const stored = readStored();
    if (stored.kind === 'unavailable') setStorageProblem(`This browser won't keep your work (${stored.reason}).`);
    else if (stored.kind === 'unreadable') setUnreadable({ raw: stored.raw, reason: stored.reason });
    else if (stored.kind === 'found') {
      const upgraded = upgradeStoredDraft(stored.data);
      const r = loadJob(upgraded.job, upgraded.wallDefaults);
      if (r.ok) {
        setTimeline(startTimeline(r.value.draft));
        if (upgraded.notes.length) setMessage({ kind: 'notice', text: upgraded.notes.join(' ') });
      } else setUnreadable({ raw: stored.raw, reason: r.reason });
    }
    setLoaded(true);
  }, []);

  // Keep it in this browser after every change.
  useEffect(() => {
    if (!loaded || unreadable) return;
    const problem = writeStored(timeline?.present ?? null);
    setStorageProblem(problem ? `Your work is NOT being kept in this browser (${problem}). Download it to keep it.` : null);
  }, [timeline, loaded, unreadable]);

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
  const checkRun = useMemo(() => (draft && formatErrors.length === 0 ? runChecks(WALL_CHECKS, draft.job, {}) : null), [draft, formatErrors]);
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
        : apply(deleteWalls(draft, env, selectedWallIds(selection)));
    if (r.ok) setSelection(null);
    else setMessage({ kind: 'error', text: r.reason });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape') setChainStart(null);
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
    const ids = selectedWallIds(selection);
    const still = ids.filter((id) => room.walls.some((w) => w.wall_id === id));
    if (still.length !== ids.length) setSelection(wallSelection(still));
  }, [room, selection]);

  if (!canView) {
    return (
      <div className={s.screen}>
        <div className={s.blocked}>
          <h1 className={s.title}>You don&apos;t have permission to see rooms</h1>
          <p className={s.muted}>Ask an owner or admin for the “room.view” permission.</p>
        </div>
      </div>
    );
  }

  const chooseTool = (t: Tool) => {
    setTool(t);
    setChainStart(null);
    if (t !== 'select') setSelection(null);
  };

  const loadExample = (which: 'kitchen' | 'lshape') => {
    if (room && room.walls.length > 0 && !window.confirm('Replace this room with the example? (Undo brings it back.)')) return;
    const job = which === 'kitchen' ? examples.kitchen() : examples.lShapeWithAngledWall();
    const r = apply(loadJob(job, null));
    if (!r.ok) setMessage({ kind: 'error', text: r.reason });
    setSelection(null);
  };

  const header = (
    <header className={s.header}>
      <h1 className={s.title}>{room ? room.name : 'Room drawing'}</h1>
      <span className={s.banner}>Preview: saved in this browser only</span>
      {storageProblem && <span className={s.bannerDanger} role="alert">{storageProblem}</span>}
      <span className={s.spacer} />
      <span className={s.mockNote}>
        {user.mocked && `${user.name} · `}
        {PREVIEW_SHOP.name}
        {!canEdit && ' · read-only'}
      </span>
      <button className={s.button} onClick={doUndo} disabled={!canEdit || !timeline || timeline.past.length === 0}>
        Undo
      </button>
      <button className={s.button} onClick={doRedo} disabled={!canEdit || !timeline || timeline.future.length === 0}>
        Redo
      </button>
    </header>
  );

  if (!loaded) return <div className={s.screen}>{header}</div>;

  if (unreadable) {
    return (
      <div className={s.screen}>
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

  /** Drops a standard opening and selects it so it can be customized. */
  const dropOpening = (wallId: string, kind: Opening['kind'], centre: number | null) => {
    if (!draft) return;
    const r = apply(placeOpening(draft, env, wallId, kind, centre));
    if (!r.ok) return setMessage({ kind: 'error', text: r.reason });
    const wall = roomOf(r.value.draft).walls.find((w) => w.wall_id === wallId);
    const added = wall?.openings[wall.openings.length - 1];
    setTool('select');
    if (added) setSelection({ kind: 'opening', id: added.opening_id });
  };

  const multiWalls = room && selection?.kind === 'walls' ? room.walls.filter((w) => selection.ids.includes(w.wall_id)) : [];
  const selectedWall = room && selection?.kind === 'wall' ? room.walls.find((w) => w.wall_id === selection.id) ?? null : null;
  const selectedOpening = room && selection?.kind === 'opening' ? findOpening(room, selection.id) : null;

  return (
    <div className={s.screen}>
      {header}
      <div className={s.body}>
        <div className={s.planColumn}>
          <div className={s.toolbar} role="toolbar" aria-label="Tools">
            {(['select', 'draw', 'door', 'window', 'passthrough'] as const).map((t) => (
              <button
                key={t}
                className={tool === t ? s.buttonActive : s.button}
                disabled={!room || (t !== 'select' && !canEdit)}
                aria-pressed={tool === t}
                onClick={() => chooseTool(t)}
              >
                {t === 'select' ? 'Select' : t === 'draw' ? 'Draw walls' : `Add ${KIND_LABEL[t].toLowerCase()}`}
              </button>
            ))}
            {chainStart && (
              <button className={s.buttonPrimary} onClick={() => setChainStart(null)}>
                Finish
              </button>
            )}
            <span className={s.hint}>{room ? TOOL_HINT[tool] : 'Start a room on the right.'}</span>
          </div>
          {message && (
            <p className={message.kind === 'error' ? s.error : s.notice} role="status" style={{ padding: '6px 12px' }}>
              {message.text}
            </p>
          )}
          <div className={s.canvas}>
            {room && (
              <PlanCanvas
                room={room}
                tool={tool}
                selection={selection}
                issues={issues}
                canEdit={canEdit}
                onSelect={setSelection}
                onAddWall={(a, b) => {
                  if (!draft) return;
                  const r = apply(addWall(draft, env, a, b));
                  if (!r.ok) setMessage({ kind: 'error', text: r.reason });
                }}
                onPickWallForOpening={(wallId, centre) => {
                  if (!draft || tool === 'select' || tool === 'draw') return;
                  dropOpening(wallId, tool, centre);
                }}
                onMoveOpening={(openingId, offset) => {
                  if (!draft) return;
                  const r = apply(moveOpening(draft, env, openingId, offset));
                  if (!r.ok) setMessage({ kind: 'error', text: r.reason });
                }}
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
              onExample={loadExample}
              onStart={(input) => {
                const r = apply(startRoom(env, { ...input, shopId: PREVIEW_SHOP.id }));
                if (r.ok) setTool('draw');
                return r;
              }}
            />
          ) : (
            <>
              <ChecksPanel formatErrors={formatErrors} issues={issues} onSelect={(sel) => (setSelection(sel), setTool('select'))} />

              {selectedWall && (
                <WallPanel
                  key={selectedWall.wall_id}
                  room={room}
                  wall={selectedWall}
                  canEdit={canEdit}
                  onSelect={setSelection}
                  onSize={(field, v) => apply(setSize(draft, env, { kind: 'wall', id: selectedWall.wall_id, field }, v))}
                  onProvenance={(field, p) => apply(setProvenance(draft, env, { kind: 'wall', id: selectedWall.wall_id, field }, p))}
                  onAddOpening={(kind) => dropOpening(selectedWall.wall_id, kind, null)}
                  onDelete={() => {
                    const r = apply(deleteWall(draft, env, selectedWall.wall_id));
                    if (r.ok) setSelection(null);
                  }}
                />
              )}

              {selectedOpening && (
                <OpeningPanel
                  key={selectedOpening.opening.opening_id}
                  room={room}
                  wall={selectedOpening.wall}
                  opening={selectedOpening.opening}
                  canEdit={canEdit}
                  onSelect={setSelection}
                  onKind={(k) => apply(setOpeningKind(draft, env, selectedOpening.opening.opening_id, k))}
                  onSize={(field, v) => apply(setSize(draft, env, { kind: 'opening', id: selectedOpening.opening.opening_id, field }, v))}
                  onProvenance={(field, p) => apply(setProvenance(draft, env, { kind: 'opening', id: selectedOpening.opening.opening_id, field }, p))}
                  onDelete={() => {
                    const r = apply(deleteOpening(draft, env, selectedOpening.opening.opening_id));
                    if (r.ok) setSelection(null);
                  }}
                />
              )}

              {multiWalls.length > 1 && (
                <WallsPanel
                  key={multiWalls.map((w) => w.wall_id).join()}
                  room={room}
                  walls={multiWalls}
                  canEdit={canEdit}
                  onSelect={setSelection}
                  onThickness={(v) => apply(setWallsThickness(draft, env, multiWalls.map((w) => w.wall_id), v))}
                  onDelete={() => deleteSelected.current()}
                />
              )}

              {!selectedWall && !selectedOpening && multiWalls.length < 2 && (
                <>
                  <AddWallForm
                    canEdit={canEdit}
                    hasWalls={room.walls.length > 0}
                    onAdd={(length, angle) => apply(addWallByLength(draft, env, length, angle))}
                    onClose={() => apply(closeRoom(draft, env))}
                  />
                  <RoomPanel
                    key={room.room_id}
                    room={room}
                    wallDefaults={draft.wallDefaults}
                    canEdit={canEdit}
                    onSelect={setSelection}
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
              )}

              <MasterCopyPanel
                job={draft.job}
                onDownload={() => downloadText(`${room.name.replace(/[^\w-]+/g, '-')}.json`, JSON.stringify(draft.job, null, 2))}
                onLoad={(text) => {
                  let raw: unknown;
                  try {
                    raw = JSON.parse(text);
                  } catch (error) {
                    return { ok: false, reason: `That file isn't JSON (${error instanceof Error ? error.message : String(error)}).` };
                  }
                  const r = apply(loadJob(raw, null));
                  if (r.ok) setSelection(null);
                  return r;
                }}
              />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
