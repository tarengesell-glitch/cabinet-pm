'use client';
/**
 * The design studio: one job, from the design choices to the room drawing, the AI design and the
 * customize screens, with the steps and the rooms always in view (the owner's Kitchen Studio
 * prototype, 2026-11-08). The app only puts the modules' screens together here; the intake and
 * the designer own everything they show.
 *
 * Each job is saved to the shared database as the person works, by the signed-in staff member
 * (`app/sync`); without the database it is kept in this browser only, with the labelled preview
 * user. Each client (a real client from the database, or a demo client) has one job until jobs have
 * their own records (BUILD_PLAN 7a). A client's job is opened with `?job=<client ID>`; without it, the studio opens the preview job. The AI design
 * step is a PLACEHOLDER: an animation, then a fixed recipe fills the rooms (no AI is called).
 */
import Link from 'next/link';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@/platform/index';
import { layoutPreferences, roomDrawingStatus, type DesignChoices, type RoomDrawingStatus } from '@/modules/designer/contract';
import { Customize, RoomCapture } from '@/modules/designer/ui/index';
import { INTAKE_DEFINITION, intakeHandover, loadIntakeState, roomDesignInputs, roughCeiling, type IntakeState, type RoomDesignInputs, type RoomHandover } from '@/modules/intake/contract';
import { IntakeScreen, RoomDefaults } from '@/modules/intake/ui/index';
import { clientHref, type ClientInfo } from '../clients';
import { jobName } from '../demo-data';
import { WhoIsIn } from '../sync/session';
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

/** A room's drawing counts as done once it has walls and cabinet runs and no problems (owner, 2026-11-08). */
const drawingDone = (st: RoomDrawingStatus | undefined): boolean => st?.kind === 'drawn' && st.walls > 0 && st.runs > 0 && st.problems === 0;

/**
 * The room's design inputs as the designer takes them. The intake reads the answers
 * (`roomDesignInputs`) and the designer checks them before use (`layoutPreferences`,
 * `islandPanelsOf`); nothing is interpreted here. The assignment keeps the two contracts in step.
 */
const designChoices = (i: RoomDesignInputs): DesignChoices => i;

function readIntake(job: string | null): IntakeState | null {
  const loaded = loadIntakeState(job);
  return loaded.kind === 'found' ? loaded.state : null;
}

export function Studio({ user, saveStatus, client }: { user: User; saveStatus: ReactNode; client: ClientInfo | null }) {
  const job = useMemo(() => new URLSearchParams(window.location.search).get('job'), []);
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
  /**
   * A room's design choices, read from the answers by the intake when a later step needs them,
   * and kept until the answers change. Null only when the room isn't in the design choices.
   */
  const inputsOf = useMemo(() => {
    const def = INTAKE_DEFINITION.ok ? INTAKE_DEFINITION.value : null;
    const read = new Map<string, RoomDesignInputs | null>();
    return (roomId: string): RoomDesignInputs | null => {
      if (!read.has(roomId)) read.set(roomId, intake && def ? roomDesignInputs(def, intake, roomId) : null);
      return read.get(roomId) ?? null;
    };
  }, [intake]);
  const drawings = useMemo(() => {
    void tick;
    return new Map(rooms.map((r) => [r.room_id, roomDrawingStatus(r.room_id)]));
  }, [rooms, tick]);
  /** Rooms whose master copy has placed cabinets (from the AI design step). */
  const designed = useMemo(
    () =>
      new Set(
        rooms
          .filter((r) => {
            const d = drawings.get(r.room_id);
            return d?.kind === 'drawn' && d.cabinets > 0;
          })
          .map((r) => r.room_id),
      ),
    [rooms, drawings],
  );

  const missingChoices = rooms.filter((r) => !r.complete);
  const notDrawn = rooms.filter((r) => !drawingDone(drawings.get(r.room_id)));
  const drawingReason =
    rooms.length === 0 ? 'Make the design choices first.' : missingChoices.length > 0 ? `Finish the design choices for ${missingChoices.map((r) => r.name.toLowerCase()).join(', ')} first.` : null;
  /** The first room whose choices can't be used for a layout, with the designer's reason (read only once everything else is ready). */
  const unusable = (): string | null => {
    for (const r of rooms) {
      const inputs = inputsOf(r.room_id);
      const p = inputs ? layoutPreferences(designChoices(inputs)) : null;
      if (!p) return `The design choices for the ${r.name.toLowerCase()} can’t be read.`;
      if (!p.ok) return `The ${r.name.toLowerCase()} can’t be laid out from its design choices: ${p.reason}`;
    }
    return null;
  };
  const aiReason = drawingReason ?? (notDrawn.length > 0 ? `Draw the walls and cabinet runs of the ${notDrawn.map((r) => r.name.toLowerCase()).join(', ')} first, with no problems.` : unusable());
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

  const currentInputs = current && stage !== 'choices' ? inputsOf(current.room_id) : null;
  const aiRooms = stage === 'ai' ? rooms.map((r) => ({ room: r, inputs: inputsOf(r.room_id) })) : [];
  /** Rooms a later step needs whose design choices can't be read: said plainly, never skipped. */
  const unreadable = (stage === 'ai' ? aiRooms.filter((a) => !a.inputs).map((a) => a.room) : current && stage !== 'choices' && !currentInputs ? [current] : []).map((r) => r.name.toLowerCase());

  return (
    <div className={s.flow}>
      <header className={s.top}>
        <Link className={s.back} href={client ? clientHref(client) : '/'} aria-label={client ? `Back to ${client.name}` : 'Back to Today'}>
          ←
        </Link>
        <div className={s.title}>
          <div className={s.name}>{client ? jobName(client) : 'Design studio'}</div>
          <div className={s.who}>
            {client ? `${client.name}${client.demo ? ' (demo client)' : ''}` : 'Preview job'} · {saveStatus} · <WhoIsIn />
          </div>
          <div className={s.whoShort}>{saveStatus}</div>
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
        {unreadable.length > 0 && (
          <p className={s.alert} role="alert">
            The design choices for the {unreadable.join(', ')} can&apos;t be read, so this step can&apos;t use them.
          </p>
        )}
        {stage === 'choices' && <IntakeScreen user={user} next={STANDALONE_NEXT} flow={{ roomId, onChange: onIntakeChange, onDraw: toDrawing, job }} />}
        {stage === 'drawing' && current && currentInputs && (
          <>
            {drawingProblem?.kind === 'problem' && (
              <p className={s.alert} role="alert">
                The {current.name.toLowerCase()}&apos;s drawing can&apos;t be read: {drawingProblem.reason}
              </p>
            )}
            <RoomCapture key={current.room_id} user={user} studio={{ key: current.room_id, name: current.name, ceiling, onChange: bump, roomSet: currentInputs.roomKind }} />
          </>
        )}
        {stage === 'ai' && unreadable.length === 0 && (
          <AiStep
            rooms={aiRooms.flatMap(({ room, inputs }) => (inputs ? [{ id: room.room_id, name: room.name, choices: { ok: true as const, value: designChoices(inputs) } }] : []))}
            alreadyDesigned={rooms.length > 0 && rooms.every((r) => designed.has(r.room_id))}
            userId={user.id}
            onDrafted={bump}
            onOpen={() => {
              setRoomId(rooms[0]?.room_id ?? null);
              setStage('customize');
            }}
          />
        )}
        {stage === 'customize' && current && currentInputs && (
          <Customize
            key={current.room_id}
            user={user}
            room={{
              key: current.room_id,
              name: current.name,
              defaults: intake && <RoomDefaults user={user} job={job} roomId={current.room_id} state={intake} onChange={onIntakeChange} onOpenChoices={() => setStage('choices')} />,
              designChoices: designChoices(currentInputs),
              onChange: bump,
            }}
          />
        )}
      </div>
    </div>
  );
}
