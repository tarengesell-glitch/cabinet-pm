'use client';
/**
 * The design studio: one job, from the design choices to the room drawing, with the steps and
 * the rooms always in view (the owner's Kitchen Studio prototype, 2026-11-08). The app only puts
 * the modules' screens together here; the intake and the designer own everything they show.
 *
 * A PREVIEW: there is one job, kept in this browser, and the user is mocked. AI design and
 * Customize are shown as steps that are not built yet; they can't be opened.
 */
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { PREVIEW_SHOP, PREVIEW_USER } from '@/platform/index';
import { roomDrawingStatus, type RoomDrawingStatus } from '@/modules/designer/contract';
import { RoomCapture } from '@/modules/designer/ui/index';
import { INTAKE_DEFINITION, intakeHandover, loadIntakeState, roughCeiling, type IntakeState, type RoomHandover } from '@/modules/intake/contract';
import { IntakeScreen } from '@/modules/intake/ui/index';
import s from './Studio.module.css';

type Stage = 'choices' | 'drawing';
const STEPS: readonly { readonly id: Stage | 'ai' | 'customize'; readonly name: string }[] = [
  { id: 'choices', name: 'Design choices' },
  { id: 'drawing', name: 'Room drawing' },
  { id: 'ai', name: 'AI design' },
  { id: 'customize', name: 'Customize' },
];
const STANDALONE_NEXT = { href: '/rooms/preview/', label: 'Next: walls, cabinets and appliances' } as const;

/** A room's drawing counts as done once it has walls and cabinet runs and no problems. */
const drawingDone = (st: RoomDrawingStatus | undefined): boolean => st?.kind === 'drawn' && st.walls > 0 && st.runs > 0 && st.problems === 0;

function readIntake(): { state: IntakeState | null; problem: string | null } {
  const loaded = loadIntakeState();
  return loaded.kind === 'found' ? { state: loaded.state, problem: null } : { state: null, problem: loaded.kind === 'problem' ? loaded.reason : null };
}

export function Studio() {
  const user = PREVIEW_USER; // MOCKED until sign-in exists (rule 14); the header says so.
  const [stage, setStage] = useState<Stage>('choices');
  const [intake, setIntake] = useState<IntakeState | null>(() => readIntake().state);
  const [roomId, setRoomId] = useState<string | null>(() => {
    const st = readIntake().state;
    return st ? (st.rooms[st.room]?.id ?? null) : null;
  });
  /** Bumped after every saved drawing change, so the room list reads the drawings again. */
  const [drawingTick, setDrawingTick] = useState(0);

  const rooms: readonly RoomHandover[] = useMemo(
    () => (intake && INTAKE_DEFINITION.ok ? intakeHandover(INTAKE_DEFINITION.value, intake) : []),
    [intake],
  );
  const drawings = useMemo(() => {
    void drawingTick;
    return new Map(rooms.map((r) => [r.room_id, roomDrawingStatus(r.room_id)]));
  }, [rooms, drawingTick]);
  const missingChoices = rooms.filter((r) => !r.complete);
  const choicesDone = rooms.length > 0 && missingChoices.length === 0;
  const notReadyReason =
    rooms.length === 0
      ? 'Make the design choices first.'
      : missingChoices.length > 0
        ? `Finish the design choices for ${missingChoices.map((r) => r.name.toLowerCase()).join(', ')} first.`
        : null;

  const onIntakeChange = useCallback((state: IntakeState) => {
    setIntake(state);
    setRoomId(state.rooms[state.room]?.id ?? null);
  }, []);

  const toDrawing = useCallback((): string | null => {
    if (notReadyReason) return notReadyReason;
    const next = rooms.find((r) => !drawingDone(drawings.get(r.room_id))) ?? rooms[0];
    setRoomId(next?.room_id ?? null);
    setStage('drawing');
    return null;
  }, [notReadyReason, rooms, drawings]);

  const onDrawingChange = useCallback(() => setDrawingTick((t) => t + 1), []);

  const current = rooms.find((r) => r.room_id === roomId) ?? rooms[0] ?? null;
  const stageIndex = stage === 'choices' ? 0 : 1;
  const ceiling = useMemo(() => {
    if (!current || !intake || !INTAKE_DEFINITION.ok) return null;
    const c = roughCeiling(INTAKE_DEFINITION.value, intake, current.room_id);
    return c.ok ? c.value : null;
  }, [current, intake]);

  const canEnter = (id: (typeof STEPS)[number]['id']): { ok: boolean; why: string } =>
    id === 'choices'
      ? { ok: true, why: '' }
      : id === 'drawing'
        ? { ok: choicesDone, why: notReadyReason ?? '' }
        : { ok: false, why: 'Not built yet.' };

  const roomDone = (r: RoomHandover): boolean => (stage === 'choices' ? r.complete : drawingDone(drawings.get(r.room_id)));
  const drawingProblem = current ? drawings.get(current.room_id) : undefined;

  return (
    <div className={s.flow}>
      <header className={s.top}>
        <Link className={s.back} href="/" aria-label="Back to the start page">
          ←
        </Link>
        <div className={s.title}>
          <div className={s.name}>Design studio</div>
          <div className={s.who}>Preview job · kept in this browser · {user.name} · {PREVIEW_SHOP.name}</div>
          <div className={s.whoShort}>Preview · mocked user and shop</div>
        </div>
        <nav className={s.stepper} aria-label="Progress">
          {STEPS.map((st, i) => {
            const enter = canEnter(st.id);
            const done = i < stageIndex;
            return (
              <span key={st.id} className={s.stepWrap}>
                {i > 0 && <span className={i <= stageIndex ? s.lineDone : s.line} aria-hidden="true" />}
                <button
                  className={done ? s.stepDone : s.step}
                  aria-current={i === stageIndex ? 'step' : undefined}
                  disabled={!enter.ok}
                  title={enter.ok ? undefined : enter.why}
                  onClick={() => {
                    if (st.id === 'choices') setStage('choices');
                    else if (st.id === 'drawing') toDrawing();
                  }}
                >
                  <span className={s.dot}>{done ? '✓' : i + 1}</span>
                  <span className={s.stepName}>{st.name}</span>
                </button>
              </span>
            );
          })}
        </nav>
      </header>
      {rooms.length > 0 && (
        <nav className={s.rooms} aria-label="Rooms">
          <span className={s.roomsLabel}>Rooms</span>
          {rooms.map((r, i) => (
            <button key={r.room_id} className={roomDone(r) ? s.chipDone : s.chip} aria-current={r.room_id === current?.room_id ? 'true' : undefined} onClick={() => setRoomId(r.room_id)}>
              <span className={s.chipDot}>{roomDone(r) ? '✓' : i + 1}</span>
              {r.name}
            </button>
          ))}
        </nav>
      )}
      <div className={stage === 'drawing' ? s.bodyFixed : s.body}>
        {stage === 'choices' ? (
          <IntakeScreen user={user} next={STANDALONE_NEXT} flow={{ roomId, onChange: onIntakeChange, onDraw: toDrawing }} />
        ) : current ? (
          <>
            {drawingProblem?.kind === 'problem' && (
              <p className={s.alert} role="alert">
                The {current.name.toLowerCase()}&apos;s drawing can&apos;t be read: {drawingProblem.reason}
              </p>
            )}
            <RoomCapture key={current.room_id} user={user} studio={{ key: current.room_id, name: current.name, ceiling, onChange: onDrawingChange }} />
          </>
        ) : null}
      </div>
    </div>
  );
}
