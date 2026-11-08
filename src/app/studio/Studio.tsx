'use client';
/**
 * The design studio: one job, from the design choices to the room drawing, the AI design and the
 * customize screens, with the steps and the rooms always in view (the owner's Kitchen Studio
 * prototype, 2026-11-08). The app only puts the modules' screens together here; the intake and
 * the designer own everything they show.
 *
 * A PREVIEW: each job is kept in this browser and the user is mocked. A demo client's job is
 * opened with `?job=<client>`; without it, the studio opens the preview job. The AI design step
 * is a PLACEHOLDER: an animation, then a fixed recipe fills the rooms (no AI is called).
 */
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { PREVIEW_SHOP, PREVIEW_USER } from '@/platform/index';
import { roomDrawingStatus, storedDesign, type DraftPreferences, type DrawerLevel, type RoomDrawingStatus } from '@/modules/designer/contract';
import { Customize, RoomCapture } from '@/modules/designer/ui/index';
import { INTAKE_DEFINITION, intakeHandover, loadIntakeState, roomLook, roomSummary, roughCabinetTop, roughCeiling, type IntakeState, type RoomHandover } from '@/modules/intake/contract';
import { IntakeScreen } from '@/modules/intake/ui/index';
import { demoClient, jobName } from '../demo-data';
import { AiStep } from './AiStep';
import { TestDataMenu } from './TestDataMenu';
import s from './Studio.module.css';

type Stage = 'choices' | 'drawing' | 'ai' | 'customize';
const STEPS: readonly { readonly id: Stage; readonly name: string }[] = [
  { id: 'choices', name: 'Design choices' },
  { id: 'drawing', name: 'Room drawing' },
  { id: 'ai', name: 'AI design' },
  { id: 'customize', name: 'Customize' },
];
const STANDALONE_NEXT = { href: '/rooms/preview/', label: 'Next: walls, cabinets and appliances' } as const;
const DRAWER_LEVELS: readonly DrawerLevel[] = ['minimum', 'moderate', 'maximum'];

/** A room's drawing counts as done once it has walls and cabinet runs and no problems (owner, 2026-11-08). */
const drawingDone = (st: RoomDrawingStatus | undefined): boolean => st?.kind === 'drawn' && st.walls > 0 && st.runs > 0 && st.problems === 0;

/** What the placeholder recipe reads from a room's design choices. Missing answers stay missing. */
function prefsOf(r: RoomHandover, intake: IntakeState | null): DraftPreferences {
  const option = (k: string): string | null => {
    const a = r.answers[k];
    return a && 'option_id' in a ? a.option_id : null;
  };
  const drawers = option('drawer_level');
  const garbage = option('garbage_recycling') === 'yes' ? option('garbage_location') : null;
  return {
    drawers: DRAWER_LEVELS.find((d) => d === drawers) ?? null,
    cornerInsert: option('corner_insert'),
    garbage: garbage === 'under_sink' || garbage === 'dedicated_cabinet' ? garbage : 'none',
    cabinetTop: (() => {
      if (!intake || !INTAKE_DEFINITION.ok) return null;
      const top = roughCabinetTop(INTAKE_DEFINITION.value, intake, r.room_id);
      return top.ok ? top.value : null;
    })(),
  };
}

function readIntake(job: string | null): IntakeState | null {
  const loaded = loadIntakeState(job);
  return loaded.kind === 'found' ? loaded.state : null;
}

export function Studio() {
  const user = PREVIEW_USER; // MOCKED until sign-in exists (rule 14); the header says so.
  const job = useMemo(() => new URLSearchParams(window.location.search).get('job'), []);
  const client = demoClient(job);
  const [stage, setStage] = useState<Stage>('choices');
  const [intake, setIntake] = useState<IntakeState | null>(() => readIntake(job));
  const [roomId, setRoomId] = useState<string | null>(() => {
    const st = readIntake(job);
    return st ? (st.rooms[st.room]?.id ?? null) : null;
  });
  /** Bumped after every saved drawing or design change, so the room list reads them again. */
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const rooms: readonly RoomHandover[] = useMemo(() => (intake && INTAKE_DEFINITION.ok ? intakeHandover(INTAKE_DEFINITION.value, intake) : []), [intake]);
  const drawings = useMemo(() => {
    void tick;
    return new Map(rooms.map((r) => [r.room_id, roomDrawingStatus(r.room_id)]));
  }, [rooms, tick]);
  const designed = useMemo(() => {
    void tick;
    return new Set(rooms.filter((r) => {
      const d = storedDesign(r.room_id);
      return d.ok && d.value !== null;
    }).map((r) => r.room_id));
  }, [rooms, tick]);

  const missingChoices = rooms.filter((r) => !r.complete);
  const notDrawn = rooms.filter((r) => !drawingDone(drawings.get(r.room_id)));
  const drawingReason =
    rooms.length === 0 ? 'Make the design choices first.' : missingChoices.length > 0 ? `Finish the design choices for ${missingChoices.map((r) => r.name.toLowerCase()).join(', ')} first.` : null;
  const aiReason = drawingReason ?? (notDrawn.length > 0 ? `Draw the walls and cabinet runs of the ${notDrawn.map((r) => r.name.toLowerCase()).join(', ')} first, with no problems.` : null);
  const customizeReason = rooms.length > 0 && rooms.every((r) => designed.has(r.room_id)) ? null : 'Run the AI design step first.';

  const onIntakeChange = useCallback((state: IntakeState) => {
    setIntake(state);
    setRoomId(state.rooms[state.room]?.id ?? null);
  }, []);

  const toDrawing = useCallback((): string | null => {
    if (drawingReason) return drawingReason;
    const next = rooms.find((r) => !drawingDone(drawings.get(r.room_id))) ?? rooms[0];
    setRoomId(next?.room_id ?? null);
    setStage('drawing');
    return null;
  }, [drawingReason, rooms, drawings]);

  const current = rooms.find((r) => r.room_id === roomId) ?? rooms[0] ?? null;
  const stageIndex = STEPS.findIndex((st) => st.id === stage);
  const ceiling = useMemo(() => {
    if (!current || !intake || !INTAKE_DEFINITION.ok) return null;
    const c = roughCeiling(INTAKE_DEFINITION.value, intake, current.room_id);
    return c.ok ? c.value : null;
  }, [current, intake]);

  const reasonFor = (id: Stage): string | null => (id === 'choices' ? null : id === 'drawing' ? drawingReason : id === 'ai' ? aiReason : customizeReason);
  const go = (id: Stage) => {
    if (id === 'drawing') return void toDrawing();
    if (reasonFor(id)) return;
    setStage(id);
  };

  const roomDone = (r: RoomHandover): boolean =>
    stage === 'choices' ? r.complete : stage === 'drawing' ? drawingDone(drawings.get(r.room_id)) : designed.has(r.room_id);
  const drawingProblem = current ? drawings.get(current.room_id) : undefined;

  const look = current && intake && INTAKE_DEFINITION.ok ? roomLook(INTAKE_DEFINITION.value, intake, current.room_id) : null;
  const choices = current && intake && INTAKE_DEFINITION.ok ? roomSummary(INTAKE_DEFINITION.value, intake, current.room_id) : [];

  return (
    <div className={s.flow}>
      <header className={s.top}>
        <Link className={s.back} href={client ? `/clients/${client.id}/` : '/'} aria-label={client ? `Back to ${client.name}` : 'Back to Today'}>
          ←
        </Link>
        <div className={s.title}>
          <div className={s.name}>{client ? jobName(client) : 'Design studio'}</div>
          <div className={s.who}>
            {client ? `${client.name} (demo client)` : 'Preview job'} · kept in this browser · <span title={`${user.name} · ${PREVIEW_SHOP.name}`}>mocked user and shop</span>
          </div>
          <div className={s.whoShort}>Preview · mocked user and shop</div>
        </div>
        <nav className={s.stepper} aria-label="Progress">
          {STEPS.map((st, i) => {
            const why = reasonFor(st.id);
            const done = i < stageIndex;
            return (
              <span key={st.id} className={s.stepWrap}>
                {i > 0 && <span className={i <= stageIndex ? s.lineDone : s.line} aria-hidden="true" />}
                <button className={done ? s.stepDone : s.step} aria-current={i === stageIndex ? 'step' : undefined} disabled={why !== null} title={why ?? undefined} onClick={() => go(st.id)}>
                  <span className={s.dot}>{done ? '✓' : i + 1}</span>
                  <span className={s.stepName}>{st.name}</span>
                </button>
              </span>
            );
          })}
        </nav>
        <TestDataMenu job={job} fileName={`${client ? client.id : 'preview'}-job.json`} />
      </header>
      {rooms.length > 0 && stage !== 'ai' && (
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
      <div className={stage === 'choices' || stage === 'ai' ? s.body : s.bodyFixed}>
        {stage === 'choices' && <IntakeScreen user={user} next={STANDALONE_NEXT} flow={{ roomId, onChange: onIntakeChange, onDraw: toDrawing, job }} />}
        {stage === 'drawing' && current && (
          <>
            {drawingProblem?.kind === 'problem' && (
              <p className={s.alert} role="alert">
                The {current.name.toLowerCase()}&apos;s drawing can&apos;t be read: {drawingProblem.reason}
              </p>
            )}
            <RoomCapture key={current.room_id} user={user} studio={{ key: current.room_id, name: current.name, ceiling, onChange: bump }} />
          </>
        )}
        {stage === 'ai' && (
          <AiStep
            rooms={rooms.map((r) => ({ id: r.room_id, name: r.name, prefs: prefsOf(r, intake) }))}
            alreadyDesigned={rooms.length > 0 && rooms.every((r) => designed.has(r.room_id))}
            onDrafted={bump}
            onOpen={() => {
              setRoomId(rooms[0]?.room_id ?? null);
              setStage('customize');
            }}
          />
        )}
        {stage === 'customize' && current && look && (
          <Customize
            key={current.room_id}
            user={user}
            room={{
              key: current.room_id,
              name: current.name,
              look,
              choices,
              prefs: prefsOf(current, intake),
              onEditChoices: () => setStage('choices'),
              onChange: bump,
            }}
          />
        )}
      </div>
    </div>
  );
}
