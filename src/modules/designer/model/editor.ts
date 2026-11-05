/**
 * Room-drawing editor logic. Pure functions on the master copy: no React.
 * Every action returns a Result. A refused action leaves the room unchanged and
 * gives a plain-language reason to show (rule 7).
 *
 * IDs and times come from `env`, so tests can pass fixed ones.
 */
import {
  JobSchema,
  SCHEMA_VERSION,
  directionOf,
  distanceForDisplay,
  formatInches,
  pointFromLengthAndAngle,
  samePoint,
  type Job,
  type Length,
  type Measured,
  type Opening,
  type Point,
  type Provenance,
  type Result,
  type Room,
  type Wall,
} from '@/core/index';

export interface Env {
  newId(): string;
  /** ISO time with offset, for the history. */
  now(): string;
  userId: string;
}

export interface WallDefaults {
  readonly height: Measured;
  readonly thickness: Measured;
}

/** What the editor keeps: the master copy plus the sizes new walls start with. */
export interface Draft {
  readonly job: Job;
  readonly wallDefaults: WallDefaults;
}

export interface Change {
  readonly draft: Draft;
  /** Extra things the person should know (for example a wall that went back to rough). */
  readonly notices: readonly string[];
}

export type WallField = 'length' | 'height' | 'thickness';
export type OpeningField = 'offset' | 'width' | 'height' | 'sill_height';

export type SizeTarget =
  | { readonly kind: 'room'; readonly field: 'ceiling_height' }
  | { readonly kind: 'wall-defaults'; readonly field: 'height' | 'thickness' }
  | { readonly kind: 'wall'; readonly id: string; readonly field: WallField }
  | { readonly kind: 'opening'; readonly id: string; readonly field: OpeningField };

/** A size typed by the person: the value plus the mm text it came from, if any. */
export interface TypedSize {
  readonly value: Length;
  readonly source_mm: string | null;
}

const ok = (draft: Draft, notices: string[] = []): Result<Change> => ({ ok: true, value: { draft, notices } });
const refuse = (reason: string): Result<Change> => ({ ok: false, reason });

export const typed = (size: TypedSize): Measured => ({ value: size.value, provenance: 'measured', source_mm: size.source_mm });

export const room = (draft: Draft): Room => draft.job.rooms[0] as Room;

const withRoom = (draft: Draft, env: Env, summary: string, next: Room): Draft => ({
  ...draft,
  job: {
    ...draft.job,
    rooms: [next],
    history: [...draft.job.history, { at: env.now(), by: env.userId, origin: 'designer', summary }],
  },
});

export const wallLabel = (r: Room, wallId: string): string => `wall ${r.walls.findIndex((w) => w.wall_id === wallId) + 1}`;

export function findOpening(r: Room, openingId: string): { wall: Wall; opening: Opening; index: number } | null {
  for (const wall of r.walls) {
    const index = wall.openings.findIndex((o) => o.opening_id === openingId);
    if (index >= 0) return { wall, opening: wall.openings[index] as Opening, index };
  }
  return null;
}

/** Starts a new room. Every size is typed by the person: nothing is guessed. */
export function startRoom(
  env: Env,
  input: { name: string; shopId: string; ceiling: TypedSize; wallHeight: TypedSize; thickness: TypedSize },
): Result<Change> {
  const name = input.name.trim();
  if (name === '') return refuse('The room needs a name.');
  const job: Job = {
    schema_version: SCHEMA_VERSION,
    job_id: env.newId(),
    shop_id: input.shopId,
    catalog_version: null,
    status: 'draft',
    rooms: [{ room_id: env.newId(), name, ceiling_height: typed(input.ceiling), walls: [] }],
    history: [{ at: env.now(), by: env.userId, origin: 'designer', summary: `Started room "${name}"` }],
  };
  return ok({ job, wallDefaults: { height: typed(input.wallHeight), thickness: typed(input.thickness) } });
}

/** Loads a whole master copy (an example or a downloaded file). This preview edits one room. */
export function loadJob(raw: unknown, wallDefaults: WallDefaults | null): Result<Change> {
  const parsed = JobSchema.safeParse(raw);
  if (!parsed.success) {
    return refuse(`That file isn't a valid master copy: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  const job = parsed.data;
  if (job.rooms.length !== 1) {
    return refuse(`This preview edits one room at a time, and that file has ${job.rooms.length}.`);
  }
  const firstWall = (job.rooms[0] as Room).walls[0];
  const defaults = wallDefaults ?? (firstWall ? { height: firstWall.height, thickness: firstWall.thickness } : null);
  if (!defaults) {
    return refuse('That room has no walls, so there is no wall height or thickness to start new walls with.');
  }
  return ok({ job, wallDefaults: defaults });
}

export function renameRoom(draft: Draft, env: Env, name: string): Result<Change> {
  const n = name.trim();
  if (n === '') return refuse('The room needs a name.');
  return ok(withRoom(draft, env, `Renamed the room to "${n}"`, { ...room(draft), name: n }));
}

/** Adds a wall with the room's wall defaults. Its length is rough until typed or verified. */
export function addWall(draft: Draft, env: Env, start: Point, end: Point, enteredLength: Length | null = null): Result<Change> {
  if (samePoint(start, end)) return refuse('A wall needs two different corners.');
  const r = room(draft);
  const wall: Wall = {
    wall_id: env.newId(),
    start_point: start,
    end_point: end,
    entered_length: enteredLength,
    length_source_mm: null,
    length_provenance: 'rough',
    height: draft.wallDefaults.height,
    thickness: draft.wallDefaults.thickness,
    openings: [],
    obstacles: [],
  };
  const length = distanceForDisplay(start, end);
  return ok(
    withRoom(draft, env, `Added wall ${r.walls.length + 1} (${length.exact ? '' : 'about '}${formatInches(length.value)})`, {
      ...r,
      walls: [...r.walls, wall],
    }),
  );
}

/** Adds a wall from the last wall's end (or the origin), by typed length and direction. */
export function addWallByLength(draft: Draft, env: Env, length: TypedSize, angle: number): Result<Change> {
  const r = room(draft);
  const last = r.walls[r.walls.length - 1];
  const start = last ? last.end_point : { x: 0, y: 0 };
  const placed = pointFromLengthAndAngle(start, length.value, angle);
  if (!placed.ok) return refuse(placed.reason);
  const entered = placed.value.entered_length ?? (length.source_mm !== null ? length.value : null);
  const added = addWall(draft, env, start, placed.value.point, entered);
  if (!added.ok) return added;
  // A typed length counts as measured (entered, not verified).
  const next = room(added.value.draft);
  const walls = next.walls.map((w, i) =>
    i === next.walls.length - 1 ? { ...w, length_provenance: 'measured' as const, length_source_mm: length.source_mm } : w,
  );
  return ok({ ...added.value.draft, job: { ...added.value.draft.job, rooms: [{ ...next, walls }] } });
}

/** Adds the wall that closes the room: from the last wall's end back to the first wall's start. */
export function closeRoom(draft: Draft, env: Env): Result<Change> {
  const r = room(draft);
  const first = r.walls[0];
  const last = r.walls[r.walls.length - 1];
  if (!first || !last || r.walls.length < 2) return refuse('Draw at least two walls before closing the room.');
  if (samePoint(last.end_point, first.start_point)) return refuse('The room is already closed.');
  return addWall(draft, env, last.end_point, first.start_point);
}

export function deleteWall(draft: Draft, env: Env, wallId: string): Result<Change> {
  const r = room(draft);
  if (!r.walls.some((w) => w.wall_id === wallId)) return refuse('That wall no longer exists.');
  const label = wallLabel(r, wallId);
  return ok(withRoom(draft, env, `Deleted ${label}`, { ...r, walls: r.walls.filter((w) => w.wall_id !== wallId) }));
}

/**
 * Sets a wall's length by moving its far corner along its current direction.
 * Any wall sharing that corner moves with it. A wall whose length changes that way
 * goes back to rough, because its measurement no longer matches (it says so).
 */
function setWallLength(draft: Draft, env: Env, wallId: string, size: TypedSize): Result<Change> {
  const r = room(draft);
  const wall = r.walls.find((w) => w.wall_id === wallId);
  if (!wall) return refuse('That wall no longer exists.');
  if (size.value <= 0) return refuse('A wall needs a length greater than zero.');
  const dx = wall.end_point.x - wall.start_point.x;
  const dy = wall.end_point.y - wall.start_point.y;
  const placed = pointFromLengthAndAngle(wall.start_point, size.value, directionOf(dx, dy));
  if (!placed.ok) return refuse(placed.reason);
  const oldEnd = wall.end_point;
  const newEnd = placed.value.point;
  const entered = placed.value.entered_length ?? (size.source_mm !== null ? size.value : null);
  const notices: string[] = [];
  const walls = r.walls.map((w, i) => {
    if (w.wall_id === wallId) {
      return { ...w, end_point: newEnd, entered_length: entered, length_source_mm: size.source_mm, length_provenance: 'measured' as const };
    }
    const movesStart = samePoint(w.start_point, oldEnd);
    const movesEnd = samePoint(w.end_point, oldEnd);
    if (!movesStart && !movesEnd) return w;
    const moved = { ...w, start_point: movesStart ? newEnd : w.start_point, end_point: movesEnd ? newEnd : w.end_point };
    if (w.length_provenance !== 'rough' || w.entered_length !== null) {
      notices.push(`Wall ${i + 1} changed length because it shares that corner, so it's back to rough. Measure it again.`);
    }
    return { ...moved, entered_length: null, length_source_mm: null, length_provenance: 'rough' as const };
  });
  return ok(withRoom(draft, env, `Set ${wallLabel(r, wallId)} length to ${formatInches(size.value)}`, { ...r, walls }), notices);
}

/** Sets any size the person typed. A typed value is "measured": typing never verifies. */
export function setSize(draft: Draft, env: Env, target: SizeTarget, size: TypedSize): Result<Change> {
  const r = room(draft);
  const m = typed(size);
  switch (target.kind) {
    case 'room':
      return ok(withRoom(draft, env, `Set ceiling height to ${formatInches(size.value)}`, { ...r, ceiling_height: m }));
    case 'wall-defaults':
      return ok({ ...draft, wallDefaults: { ...draft.wallDefaults, [target.field]: m } });
    case 'wall': {
      if (target.field === 'length') return setWallLength(draft, env, target.id, size);
      const wall = r.walls.find((w) => w.wall_id === target.id);
      if (!wall) return refuse('That wall no longer exists.');
      const walls = r.walls.map((w) => (w.wall_id === target.id ? { ...w, [target.field]: m } : w));
      return ok(withRoom(draft, env, `Set ${wallLabel(r, target.id)} ${target.field} to ${formatInches(size.value)}`, { ...r, walls }));
    }
    case 'opening': {
      const found = findOpening(r, target.id);
      if (!found) return refuse('That opening no longer exists.');
      if ((target.field === 'width' || target.field === 'height') && size.value === 0) {
        return refuse(`An opening's ${target.field} must be greater than zero.`);
      }
      const walls = r.walls.map((w) =>
        w.wall_id !== found.wall.wall_id
          ? w
          : { ...w, openings: w.openings.map((o) => (o.opening_id === target.id ? { ...o, [target.field]: m } : o)) },
      );
      return ok(withRoom(draft, env, `Set ${found.opening.kind} ${target.field.replace('_', ' ')} to ${formatInches(size.value)}`, { ...r, walls }));
    }
  }
}

/** Sets how sure we are of a size. Verifying is always a separate, deliberate step. */
export function setProvenance(draft: Draft, env: Env, target: SizeTarget, provenance: Provenance): Result<Change> {
  const r = room(draft);
  const set = (m: Measured): Measured => ({ ...m, provenance });
  switch (target.kind) {
    case 'room':
      return ok(withRoom(draft, env, `Marked ceiling height ${provenance}`, { ...r, ceiling_height: set(r.ceiling_height) }));
    case 'wall-defaults':
      return refuse('Defaults for new walls are not measurements, so they cannot be verified.');
    case 'wall': {
      if (!r.walls.some((w) => w.wall_id === target.id)) return refuse('That wall no longer exists.');
      const walls = r.walls.map((w) => {
        if (w.wall_id !== target.id) return w;
        return target.field === 'length' ? { ...w, length_provenance: provenance } : { ...w, [target.field]: set(w[target.field]) };
      });
      return ok(withRoom(draft, env, `Marked ${wallLabel(r, target.id)} ${target.field} ${provenance}`, { ...r, walls }));
    }
    case 'opening': {
      const found = findOpening(r, target.id);
      if (!found) return refuse('That opening no longer exists.');
      const walls = r.walls.map((w) =>
        w.wall_id !== found.wall.wall_id
          ? w
          : { ...w, openings: w.openings.map((o) => (o.opening_id === target.id ? { ...o, [target.field]: set(o[target.field]) } : o)) },
      );
      return ok(withRoom(draft, env, `Marked ${found.opening.kind} ${target.field.replace('_', ' ')} ${provenance}`, { ...r, walls }));
    }
  }
}

export interface NewOpening {
  readonly kind: Opening['kind'];
  readonly offset: TypedSize | null;
  readonly width: TypedSize | null;
  readonly height: TypedSize | null;
  readonly sill_height: TypedSize | null;
}

const FIELD_NAMES: Record<OpeningField, string> = {
  offset: 'distance from the wall start',
  width: 'width',
  height: 'height',
  sill_height: 'sill height',
};

/** Adds a door, window or passthrough. Every size must be typed: none is guessed. */
export function addOpening(draft: Draft, env: Env, wallId: string, input: NewOpening): Result<Change> {
  const r = room(draft);
  const wall = r.walls.find((w) => w.wall_id === wallId);
  if (!wall) return refuse('That wall no longer exists.');
  const missing = (['offset', 'width', 'height', 'sill_height'] as const).filter((f) => input[f] === null);
  if (missing.length > 0) return refuse(`Fill in the ${missing.map((f) => FIELD_NAMES[f]).join(', ')} first.`);
  const size = (f: OpeningField) => input[f] as TypedSize;
  if (size('width').value === 0 || size('height').value === 0) return refuse('Width and height must be greater than zero.');
  const opening: Opening = {
    opening_id: env.newId(),
    kind: input.kind,
    offset: typed(size('offset')),
    width: typed(size('width')),
    height: typed(size('height')),
    sill_height: typed(size('sill_height')),
  };
  const walls = r.walls.map((w) => (w.wall_id === wallId ? { ...w, openings: [...w.openings, opening] } : w));
  return ok(withRoom(draft, env, `Added a ${input.kind} to ${wallLabel(r, wallId)}`, { ...r, walls }));
}

export function setOpeningKind(draft: Draft, env: Env, openingId: string, kind: Opening['kind']): Result<Change> {
  const r = room(draft);
  const found = findOpening(r, openingId);
  if (!found) return refuse('That opening no longer exists.');
  const walls = r.walls.map((w) =>
    w.wall_id !== found.wall.wall_id ? w : { ...w, openings: w.openings.map((o) => (o.opening_id === openingId ? { ...o, kind } : o)) },
  );
  return ok(withRoom(draft, env, `Changed a ${found.opening.kind} to a ${kind}`, { ...r, walls }));
}

export function deleteOpening(draft: Draft, env: Env, openingId: string): Result<Change> {
  const r = room(draft);
  const found = findOpening(r, openingId);
  if (!found) return refuse('That opening no longer exists.');
  const walls = r.walls.map((w) =>
    w.wall_id !== found.wall.wall_id ? w : { ...w, openings: w.openings.filter((o) => o.opening_id !== openingId) },
  );
  return ok(withRoom(draft, env, `Deleted a ${found.opening.kind} from ${wallLabel(r, found.wall.wall_id)}`, { ...r, walls }));
}

/** Where along a wall a point falls, and how far from it. For tapping a wall on the plan. */
export function projectOntoWall(wall: Wall, p: Point): { offset: Length; distance: number } {
  const sx = wall.start_point.x;
  const sy = wall.start_point.y;
  const dx = wall.end_point.x - sx;
  const dy = wall.end_point.y - sy;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - sx) * dx + (p.y - sy) * dy) / lenSq));
  const cx = sx + t * dx;
  const cy = sy + t * dy;
  return { offset: Math.round(t * Math.sqrt(lenSq)), distance: Math.hypot(p.x - cx, p.y - cy) };
}

/** The wall nearest a point, if within `tolerance`. */
export function nearestWall(r: Room, p: Point, tolerance: number): { wall: Wall; offset: Length } | null {
  let best: { wall: Wall; offset: Length; distance: number } | null = null;
  for (const wall of r.walls) {
    const hit = projectOntoWall(wall, p);
    if (hit.distance <= tolerance && (best === null || hit.distance < best.distance)) best = { wall, ...hit };
  }
  return best ? { wall: best.wall, offset: best.offset } : null;
}

/** Undo / redo around any action. */
export interface Timeline {
  readonly present: Draft;
  readonly past: readonly Draft[];
  readonly future: readonly Draft[];
}

export const startTimeline = (draft: Draft): Timeline => ({ present: draft, past: [], future: [] });
export const commit = (t: Timeline, draft: Draft): Timeline => ({ present: draft, past: [...t.past, t.present], future: [] });
export const undo = (t: Timeline): Timeline =>
  t.past.length === 0 ? t : { present: t.past[t.past.length - 1] as Draft, past: t.past.slice(0, -1), future: [t.present, ...t.future] };
export const redo = (t: Timeline): Timeline =>
  t.future.length === 0 ? t : { present: t.future[0] as Draft, past: [...t.past, t.present], future: t.future.slice(1) };
