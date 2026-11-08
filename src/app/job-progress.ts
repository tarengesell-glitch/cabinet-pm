/**
 * How far a design job has got, room by room, for the office screens. Read through the modules'
 * contracts from what this browser keeps (the preview has no database). Null when the job
 * hasn't been started in this browser.
 */
import { roomDrawingStatus, storedDesign } from '@/modules/designer/contract';
import { INTAKE_DEFINITION, intakeHandover, loadIntakeState } from '@/modules/intake/contract';

export type RoomStage = 'Choices in progress' | 'Choices done' | 'Drawn' | 'Designed';

export interface JobProgress {
  readonly rooms: readonly { readonly id: string; readonly name: string; readonly stage: RoomStage; readonly drawn: boolean }[];
  /** The step the whole job is on: the earliest step any room is still on. */
  readonly stage: RoomStage;
  /** A reason the job's saved work can't be read, or null. */
  readonly problem: string | null;
}

const ORDER: readonly RoomStage[] = ['Choices in progress', 'Choices done', 'Drawn', 'Designed'];

export function jobProgress(job: string | null): JobProgress | null {
  const loaded = loadIntakeState(job);
  if (loaded.kind === 'none') return null;
  if (loaded.kind === 'problem') return { rooms: [], stage: 'Choices in progress', problem: loaded.reason };
  if (!INTAKE_DEFINITION.ok) return { rooms: [], stage: 'Choices in progress', problem: INTAKE_DEFINITION.reason };
  const rooms = intakeHandover(INTAKE_DEFINITION.value, loaded.state).map((r) => {
    const drawing = roomDrawingStatus(r.room_id);
    const drawn = drawing.kind === 'drawn' && drawing.walls > 0 && drawing.runs > 0 && drawing.problems === 0;
    const design = storedDesign(r.room_id);
    const stage: RoomStage = !r.complete ? 'Choices in progress' : design.ok && design.value ? 'Designed' : drawn ? 'Drawn' : 'Choices done';
    return { id: r.room_id, name: r.name, stage, drawn: drawing.kind === 'drawn' && drawing.walls > 0 };
  });
  const stage = rooms.reduce<RoomStage>((m, r) => (ORDER.indexOf(r.stage) < ORDER.indexOf(m) ? r.stage : m), 'Designed');
  return { rooms, stage: rooms.length ? stage : 'Choices in progress', problem: null };
}
