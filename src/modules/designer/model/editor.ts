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
  formatInchesApprox,
  distanceSquared,
  pointFromLengthAndAngle,
  roomInsideSide,
  samePoint,
  segmentsOverlap,
  type Job,
  type Length,
  type Measured,
  type Opening,
  type Point,
  type Provenance,
  type Result,
  type Room,
  type Swing,
  type Wall,
  wallLetter,
} from '@/core/index';
import { PREVIEW_SHOP } from '@/platform/index';
import { STANDARD_SIZES } from './standard-sizes';

export interface Env {
  newId(): string;
  /** ISO time with offset, for the history. */
  now(): string;
  userId: string;
}

export interface WallDefaults {
  readonly thickness: Measured;
}

/**
 * Which side of the walls is inside the room, looking along each wall from start to end:
 * left for a room drawn counter-clockwise (room Y up), right for clockwise. From the
 * area the corners enclose; an open chain is closed from its last corner to its first.
 */
export function insideSide(r: Room): 'left' | 'right' {
  return roomInsideSide(r.walls);
}

const otherSide = (side: 'left' | 'right'): 'left' | 'right' => (side === 'left' ? 'right' : 'left');

/** The standard swing for a new door in this room (data/standard-sizes.json). */
function standardSwing(r: Room): Swing {
  const std = STANDARD_SIZES.door_swing;
  const inside = insideSide(r);
  return { hinge: std.hinge, opens: std.opens === 'inside' ? inside : otherSide(inside) };
}

/** A standard, dragged or typed size: unmeasured until a person confirms it. */
const rough = (value: Length): Measured => ({ value, provenance: 'unmeasured', source_mm: null });

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

export type WallField = 'length' | 'thickness';
export type OpeningField = 'offset' | 'width' | 'height' | 'sill_height';

export type SizeTarget =
  | { readonly kind: 'room'; readonly field: 'ceiling_height' }
  | { readonly kind: 'wall-defaults'; readonly field: 'thickness' }
  | { readonly kind: 'wall'; readonly id: string; readonly field: WallField }
  | { readonly kind: 'opening'; readonly id: string; readonly field: OpeningField };

/** A size typed by the person: the value plus the mm text it came from, if any. */
export interface TypedSize {
  readonly value: Length;
  readonly source_mm: string | null;
}

const ok = (draft: Draft, notices: string[] = []): Result<Change> => ({ ok: true, value: { draft, notices } });
const refuse = (reason: string): Result<Change> => ({ ok: false, reason });

/** A typed size. Typing never confirms a size (owner, 2026-11-05): it stays unmeasured until confirmed. */
export const typed = (size: TypedSize): Measured => ({ value: size.value, provenance: 'unmeasured', source_mm: size.source_mm });

export const room = (draft: Draft): Room => draft.job.rooms[0] as Room;

export const withRoom = (draft: Draft, env: Env, summary: string, next: Room): Draft => ({
  ...draft,
  job: {
    ...draft.job,
    rooms: [next],
    history: [...draft.job.history, { at: env.now(), by: env.userId, origin: 'designer', summary }],
  },
});

export const wallLabel = (r: Room, wallId: string): string => `wall ${wallLetter(r.walls.findIndex((w) => w.wall_id === wallId))}`;

export function findOpening(r: Room, openingId: string): { wall: Wall; opening: Opening; index: number } | null {
  for (const wall of r.walls) {
    const index = wall.openings.findIndex((o) => o.opening_id === openingId);
    if (index >= 0) return { wall, opening: wall.openings[index] as Opening, index };
  }
  return null;
}

/**
 * Starts a new room from its name and ceiling height (rough until measured).
 * New walls start at the standard thickness, also rough (owner, 2026-11-05).
 */
export function startRoom(env: Env, input: { name: string; shopId: string; ceiling: TypedSize }): Result<Change> {
  const name = input.name.trim();
  if (name === '') return refuse('The room needs a name.');
  const job: Job = {
    schema_version: SCHEMA_VERSION,
    job_id: env.newId(),
    shop_id: input.shopId,
    catalog_version: null,
    status: 'draft',
    job_selections: {},
    rooms: [{ room_id: env.newId(), name, ceiling_height: typed(input.ceiling), walls: [], room_selections: {}, items: [] }],
    history: [{ at: env.now(), by: env.userId, origin: 'designer', summary: `Started room "${name}"` }],
  };
  return ok({ job, wallDefaults: { thickness: rough(STANDARD_SIZES.wall_thickness) } });
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
  return ok({ job, wallDefaults: wallDefaults ?? { thickness: rough(STANDARD_SIZES.wall_thickness) } });
}

export function renameRoom(draft: Draft, env: Env, name: string): Result<Change> {
  const n = name.trim();
  if (n === '') return refuse('The room needs a name.');
  return ok(withRoom(draft, env, `Renamed the room to "${n}"`, { ...room(draft), name: n }));
}

/** Adds a wall with the room's wall defaults. Its length is rough until typed or verified. */
export function addWall(
  draft: Draft,
  env: Env,
  start: Point,
  end: Point,
  enteredLength: Length | null = null,
  kind: Wall['kind'] = 'room',
): Result<Change> {
  if (samePoint(start, end)) return refuse('A wall needs two different corners.');
  const r = room(draft);
  const over = r.walls.findIndex((w) => segmentsOverlap(w.start_point, w.end_point, start, end));
  if (over >= 0) return refuse(`That wall would run back over wall ${wallLetter(over)}. Walls can't lie on top of each other.`);
  const wall: Wall = {
    wall_id: env.newId(),
    kind,
    start_point: start,
    end_point: end,
    entered_length: enteredLength,
    length_source_mm: null,
    length_provenance: 'unmeasured',
    thickness: kind === 'room' ? draft.wallDefaults.thickness : null,
    openings: [],
    obstacles: [],
    runs: [],
    appliances: [],
  };
  const length = distanceForDisplay(start, end);
  return ok(
    withRoom(draft, env, `Added wall ${wallLetter(r.walls.length)} (${length.exact ? formatInches(length.value) : formatInchesApprox(length.value)})`, {
      ...r,
      walls: [...r.walls, wall],
    }),
  );
}

/**
 * Moves corners: every wall end at a `from` point goes to its `to` point, so joined walls
 * stay joined. A wall whose length changes goes back to rough (its measurement no longer
 * matches) and the person is told. Walls that keep their length keep their tag.
 */
function moveCorners(draft: Draft, env: Env, moves: readonly (readonly [Point, Point])[], summary: string): Result<Change> {
  const r = room(draft);
  const target = (p: Point): Point => moves.find(([from]) => samePoint(from, p))?.[1] ?? p;
  const notices: string[] = [];
  let touched = 0;
  const walls: Wall[] = [];
  for (const [i, w] of r.walls.entries()) {
    const start = target(w.start_point);
    const end = target(w.end_point);
    if (samePoint(start, w.start_point) && samePoint(end, w.end_point)) {
      walls.push(w);
      continue;
    }
    touched += 1;
    if (samePoint(start, end)) return refuse(`That would shrink wall ${wallLetter(i)} to nothing.`);
    const sameLength = distanceSquared(start, end) === distanceSquared(w.start_point, w.end_point);
    if (sameLength) {
      walls.push({ ...w, start_point: start, end_point: end });
      continue;
    }
    // A wall that stays on the same line keeps its doors, windows and obstacles where they
    // are in the room: their offsets (measured from the start corner) shift if the start moved.
    let { openings, obstacles } = w;
    const ox = w.end_point.x - w.start_point.x;
    const oy = w.end_point.y - w.start_point.y;
    const nx = end.x - start.x;
    const ny = end.y - start.y;
    const sameLine = BigInt(ox) * BigInt(ny) - BigInt(oy) * BigInt(nx) === 0n && ox * nx + oy * ny > 0;
    if (sameLine && !samePoint(start, w.start_point)) {
      const len = Math.hypot(ox, oy);
      const shift = Math.round(((w.start_point.x - start.x) * ox + (w.start_point.y - start.y) * oy) / len);
      const cut = [...w.openings.map((o) => ({ offset: o.offset.value, what: `the ${o.kind}` })), ...w.obstacles.map((o) => ({ offset: o.offset.value, what: `the ${o.kind}` }))].find(
        (o) => o.offset + shift < 0,
      );
      if (cut) return refuse(`That would cut through ${cut.what} on wall ${wallLetter(i)}.`);
      openings = w.openings.map((o) => ({ ...o, offset: { ...o.offset, value: o.offset.value + shift } }));
      obstacles = w.obstacles.map((o) => ({ ...o, offset: { ...o.offset, value: o.offset.value + shift } }));
    }
    if (w.length_provenance === 'confirmed') {
      notices.push(`Wall ${wallLetter(i)} changed length, so it's no longer confirmed. Measure it again.`);
    }
    walls.push({ ...w, start_point: start, end_point: end, entered_length: null, length_source_mm: null, length_provenance: 'unmeasured', openings, obstacles });
  }
  if (touched === 0) return refuse('Nothing moved.');
  for (const [i, a] of walls.entries()) {
    for (const [j, b] of walls.entries()) {
      if (j > i && segmentsOverlap(a.start_point, a.end_point, b.start_point, b.end_point)) {
        return refuse(`That would put wall ${wallLetter(i)} on top of wall ${wallLetter(j)}.`);
      }
    }
  }
  return ok(withRoom(draft, env, summary, { ...r, walls }), notices);
}

/**
 * Changes a wall's length along its own line, from one end (owner, 2026-11-05: a length
 * change never changes the angle of the walls joined to it). The wall joined at that end
 * moves across with it, keeping its angle and length; whatever is joined beyond that stretches.
 * Doors and windows stay where they are in the room. The new length is unmeasured until confirmed.
 */
export function resizeWall(
  draft: Draft,
  env: Env,
  wallId: string,
  which: 'start' | 'end',
  size: TypedSize,
): Result<Change> {
  const r = room(draft);
  const index = r.walls.findIndex((w) => w.wall_id === wallId);
  const wall = r.walls[index];
  if (!wall) return refuse('That wall no longer exists.');
  if (size.value <= 0) return refuse('A wall needs a length greater than zero.');
  const fixed = which === 'end' ? wall.start_point : wall.end_point;
  const moving = which === 'end' ? wall.end_point : wall.start_point;
  const placed = pointFromLengthAndAngle(fixed, size.value, directionOf(moving.x - fixed.x, moving.y - fixed.y));
  if (!placed.ok) return refuse(placed.reason);
  const next = placed.value.point;
  const v = { x: next.x - moving.x, y: next.y - moving.y };
  const moves: [Point, Point][] = [[moving, next]];
  if (v.x !== 0 || v.y !== 0) {
    for (const w of r.walls) {
      if (w.wall_id === wallId) continue;
      const far = samePoint(w.start_point, moving) ? w.end_point : samePoint(w.end_point, moving) ? w.start_point : null;
      if (!far || samePoint(far, fixed) || moves.some(([from]) => samePoint(from, far))) continue;
      moves.push([far, { x: far.x + v.x, y: far.y + v.y }]);
    }
  }
  const entered = placed.value.entered_length ?? (size.source_mm !== null ? size.value : null);
  const tagOnly = v.x === 0 && v.y === 0;
  const moved = tagOnly
    ? ok({ ...draft }, [])
    : moveCorners(draft, env, moves, `Set ${wallLabel(r, wallId)} length to ${formatInches(size.value)}`);
  if (!moved.ok) return moved;
  const after = room(moved.value.draft);
  const walls = after.walls.map((w) =>
    w.wall_id === wallId
      ? { ...w, entered_length: entered, length_source_mm: size.source_mm, length_provenance: 'unmeasured' as const }
      : w,
  );
  const notices = moved.value.notices.filter((n) => !n.startsWith(`Wall ${wallLetter(index)} `));
  const updated = { ...moved.value.draft, job: { ...moved.value.draft.job, rooms: [{ ...after, walls }] } };
  return ok(tagOnly ? withRoom(updated, env, `Set ${wallLabel(r, wallId)} length to ${formatInches(size.value)}`, room(updated)) : updated, notices);
}

/** Drags a corner to a new point. Every wall meeting at that corner follows (changes their angles). */
export function moveCorner(draft: Draft, env: Env, from: Point, to: Point): Result<Change> {
  if (samePoint(from, to)) return refuse('Nothing moved.');
  if (!room(draft).walls.some((w) => samePoint(w.start_point, from) || samePoint(w.end_point, from))) {
    return refuse('There is no corner there.');
  }
  return moveCorners(draft, env, [[from, to]], `Moved a corner to ${formatInches(to.x)}, ${formatInches(to.y)}`);
}

/**
 * Slides a wall sideways (square to its own direction) by `distance` (positive = to its
 * left, looking from its start). The wall keeps its length; walls joined to it stretch.
 */
export function slideWall(draft: Draft, env: Env, wallId: string, distance: number): Result<Change> {
  const r = room(draft);
  const wall = r.walls.find((w) => w.wall_id === wallId);
  if (!wall) return refuse('That wall no longer exists.');
  const dx = wall.end_point.x - wall.start_point.x;
  const dy = wall.end_point.y - wall.start_point.y;
  const len = Math.hypot(dx, dy);
  const v = { x: Math.round((-dy / len) * distance), y: Math.round((dx / len) * distance) };
  if (v.x === 0 && v.y === 0) return refuse('Nothing moved.');
  const shift = (p: Point): Point => ({ x: p.x + v.x, y: p.y + v.y });
  return moveCorners(
    draft,
    env,
    [
      [wall.start_point, shift(wall.start_point)],
      [wall.end_point, shift(wall.end_point)],
    ],
    `Moved ${wallLabel(r, wallId)} ${formatInches(Math.round(Math.hypot(v.x, v.y)))}`,
  );
}

/** Adds a wall by typed length and direction, from `from` (or the last wall's end, or the origin). */
export function addWallByLength(
  draft: Draft,
  env: Env,
  length: TypedSize,
  angle: number,
  from?: Point,
  kind: Wall['kind'] = 'room',
): Result<Change> {
  const r = room(draft);
  const last = r.walls[r.walls.length - 1];
  const start = from ?? (last ? last.end_point : { x: 0, y: 0 });
  const placed = pointFromLengthAndAngle(start, length.value, angle);
  if (!placed.ok) return refuse(placed.reason);
  const entered = placed.value.entered_length ?? (length.source_mm !== null ? length.value : null);
  const added = addWall(draft, env, start, placed.value.point, entered, kind);
  if (!added.ok) return added;
  // A typed length counts as measured (entered, not verified).
  const next = room(added.value.draft);
  const walls = next.walls.map((w, i) =>
    i === next.walls.length - 1 ? { ...w, length_source_mm: length.source_mm } : w,
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
  return deleteWalls(draft, env, [wallId]);
}

/**
 * Makes a wall a room wall or a floating wall (island / peninsula). A floating wall has no
 * thickness and no doors or windows; a room wall gets the standard thickness for new walls.
 */
export function setWallKind(draft: Draft, env: Env, wallId: string, kind: Wall['kind']): Result<Change> {
  const r = room(draft);
  const wall = r.walls.find((w) => w.wall_id === wallId);
  if (!wall) return refuse('That wall no longer exists.');
  if (wall.kind === kind) return refuse('Nothing changed.');
  if (kind === 'floating' && (wall.openings.length > 0 || wall.obstacles.length > 0)) {
    return refuse(`Move or delete the doors and windows on ${wallLabel(r, wallId)} first: a floating wall can't have them.`);
  }
  const walls = r.walls.map((w) =>
    w.wall_id !== wallId ? w : { ...w, kind, thickness: kind === 'room' ? draft.wallDefaults.thickness : null },
  );
  return ok(withRoom(draft, env, `Made ${wallLabel(r, wallId)} a ${kind === 'floating' ? 'floating' : 'room'} wall`, { ...r, walls }));
}

/** Deletes one or more walls (with their doors and windows) as one step, so one undo brings them back. */
export function deleteWalls(draft: Draft, env: Env, wallIds: readonly string[]): Result<Change> {
  const r = room(draft);
  if (wallIds.length === 0) return refuse('No walls are selected.');
  const missing = wallIds.filter((id) => !r.walls.some((w) => w.wall_id === id));
  if (missing.length > 0) return refuse('Some of those walls no longer exist.');
  const labels = r.walls.filter((w) => wallIds.includes(w.wall_id)).map((w) => wallLabel(r, w.wall_id));
  const summary = labels.length === 1 ? `Deleted ${labels[0]}` : `Deleted ${labels.length} walls (${labels.join(', ')})`;
  return ok(withRoom(draft, env, summary, { ...r, walls: r.walls.filter((w) => !wallIds.includes(w.wall_id)) }));
}

/** Sets the thickness of several walls at once (typed, so measured). */
export function setWallsThickness(draft: Draft, env: Env, wallIds: readonly string[], size: TypedSize): Result<Change> {
  const r = room(draft);
  if (wallIds.length === 0) return refuse('No walls are selected.');
  if (size.value <= 0) return refuse('A wall needs a thickness greater than zero.');
  if (wallIds.some((id) => !r.walls.some((w) => w.wall_id === id))) return refuse('Some of those walls no longer exist.');
  const walls = r.walls.map((w) => (wallIds.includes(w.wall_id) && w.kind === 'room' ? { ...w, thickness: typed(size) } : w));
  return ok(withRoom(draft, env, `Set ${wallIds.length} walls' thickness to ${formatInches(size.value)}`, { ...r, walls }));
}

/** A typed wall length: the far end moves along the wall's line (see resizeWall). */
function setWallLength(draft: Draft, env: Env, wallId: string, size: TypedSize): Result<Change> {
  return resizeWall(draft, env, wallId, 'end', size);
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
      if (wall.kind === 'floating') return refuse('A floating wall has no thickness.');
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
        if (target.field === 'length') return { ...w, length_provenance: provenance };
        return w.thickness ? { ...w, thickness: set(w.thickness) } : w;
      });
      if (target.field === 'thickness' && r.walls.find((w) => w.wall_id === target.id)?.kind === 'floating') {
        return refuse('A floating wall has no thickness.');
      }
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

/**
 * Drops a standard door, window or passthrough on a wall (owner, 2026-11-05): sizes
 * come from data/standard-sizes.json and start rough. It is centred where the wall
 * was tapped (or the middle of the wall), kept inside the wall where it fits, and
 * placed to the nearest inch. Customize it afterwards.
 */
/**
 * Where a standard opening dropped at `centre` along a wall starts (its offset):
 * centred there (or the middle of the wall), to the nearest inch, kept inside the wall
 * where it fits. The plan's ghost preview uses this too, so what you see is what lands.
 */
export function standardOpeningOffset(wall: Wall, kind: Opening['kind'], centre: Length | null): Length {
  const std = STANDARD_SIZES.openings[kind];
  const wallLength = distanceForDisplay(wall.start_point, wall.end_point).value;
  const middle = centre ?? Math.floor(wallLength / 2);
  const roomForIt = Math.max(0, wallLength - std.width);
  const inch = 64;
  return Math.min(Math.max(0, Math.round((middle - std.width / 2) / inch) * inch), Math.floor(roomForIt / inch) * inch);
}

export function placeOpening(
  draft: Draft,
  env: Env,
  wallId: string,
  kind: Opening['kind'],
  centre: Length | null,
): Result<Change> {
  const r = room(draft);
  const wall = r.walls.find((w) => w.wall_id === wallId);
  if (!wall) return refuse('That wall no longer exists.');
  if (wall.kind === 'floating') return refuse(`A floating wall can't have a ${kind}.`);
  const std = STANDARD_SIZES.openings[kind];
  const offset = standardOpeningOffset(wall, kind, centre);
  const opening: Opening = {
    opening_id: env.newId(),
    kind,
    offset: rough(offset),
    width: rough(std.width),
    height: rough(std.height),
    sill_height: rough(std.sill_height),
    swing: kind === 'door' ? standardSwing(r) : null,
  };
  const walls = r.walls.map((w) => (w.wall_id === wallId ? { ...w, openings: [...w.openings, opening] } : w));
  return ok(withRoom(draft, env, `Added a ${kind} to ${wallLabel(r, wallId)}`, { ...r, walls }));
}

/** Moves an opening along its wall (dragged on the plan): an approximate position, so rough. */
export function moveOpening(draft: Draft, env: Env, openingId: string, offset: Length, toWallId?: string): Result<Change> {
  const r = room(draft);
  const found = findOpening(r, openingId);
  if (!found) return refuse('That opening no longer exists.');
  if (offset < 0) return refuse('An opening cannot start before the beginning of its wall.');
  const target = toWallId ?? found.wall.wall_id;
  const targetWall = r.walls.find((w) => w.wall_id === target);
  if (!targetWall) return refuse('That wall no longer exists.');
  if (targetWall.kind === 'floating') return refuse(`A floating wall can't have a ${found.opening.kind}.`);
  const moved = { ...found.opening, offset: rough(offset) };
  const walls = r.walls.map((w) => {
    const without = w.wall_id === found.wall.wall_id ? w.openings.filter((o) => o.opening_id !== openingId) : w.openings;
    return w.wall_id === target ? { ...w, openings: [...without, moved] } : without === w.openings ? w : { ...w, openings: without };
  });
  const where = target === found.wall.wall_id ? wallLabel(r, target) : `${wallLabel(r, target)} (from ${wallLabel(r, found.wall.wall_id)})`;
  return ok(withRoom(draft, env, `Moved a ${found.opening.kind} to ${formatInches(offset)} from the start of ${where}`, { ...r, walls }));
}

/** Resizes an opening by dragging one of its ends: new start offset and width, both approximate (rough). */
export function resizeOpening(draft: Draft, env: Env, openingId: string, offset: Length, width: Length): Result<Change> {
  const r = room(draft);
  const found = findOpening(r, openingId);
  if (!found) return refuse('That opening no longer exists.');
  if (offset < 0) return refuse('An opening cannot start before the beginning of its wall.');
  if (width <= 0) return refuse(`A ${found.opening.kind} needs a width greater than zero.`);
  const walls = r.walls.map((w) =>
    w.wall_id !== found.wall.wall_id
      ? w
      : {
          ...w,
          openings: w.openings.map((o) =>
            o.opening_id === openingId
              ? { ...o, offset: o.offset.value === offset ? o.offset : rough(offset), width: o.width.value === width ? o.width : rough(width) }
              : o,
          ),
        },
  );
  return ok(withRoom(draft, env, `Resized a ${found.opening.kind} to ${formatInches(width)} wide`, { ...r, walls }));
}

/**
 * Brings a draft saved by an older version of this preview up to date, saying what
 * changed. Today: walls no longer have their own height (owner, 2026-11-05).
 */
export function upgradeStoredDraft(data: unknown): { job: unknown; wallDefaults: WallDefaults | null; notes: string[] } {
  const notes: string[] = [];
  const d = (data ?? {}) as { job?: { rooms?: { walls?: Record<string, unknown>[] }[] }; wallDefaults?: { thickness?: Measured } };
  const job = structuredClone(d.job);
  let dropped = 0;
  for (const room of job?.rooms ?? []) {
    for (const wall of room.walls ?? []) {
      if ('height' in wall) {
        delete wall.height;
        dropped += 1;
      }
    }
  }
  if (dropped > 0) notes.push(`Your saved room was updated: walls no longer have their own height (${dropped} removed); the ceiling height is used instead.`);
  // Sizes saved with the old three tags (rough / measured / verified) become two (owner,
  // 2026-11-05): only "verified" was ever a deliberate confirmation.
  let retagged = 0;
  const retag = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(retag);
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    for (const key of ['provenance', 'length_provenance']) {
      const v = o[key];
      if (v === 'rough' || v === 'measured' || v === 'verified') {
        o[key] = v === 'verified' ? 'confirmed' : 'unmeasured';
        retagged += 1;
      }
    }
    Object.values(o).forEach(retag);
  };
  retag(job);
  // Walls saved before floating walls existed are room walls.
  for (const room of job?.rooms ?? []) for (const wall of room.walls ?? []) if (!('kind' in wall)) wall.kind = 'room';
  // Walls saved before the rough layout existed have no cabinet runs or appliances (schema 1).
  for (const room of job?.rooms ?? []) for (const wall of room.walls ?? []) {
    if (!('runs' in wall)) wall.runs = [];
    if (!('appliances' in wall)) wall.appliances = [];
  }
  const j = job as { schema_version?: unknown; job_selections?: unknown; shop_id?: unknown } | undefined;
  if (j && j.schema_version === 0) j.schema_version = 1;
  // Schema 2 (2026-11-08) added placed cabinets and selections; rooms saved before have none.
  if (j && j.schema_version === 1) {
    j.schema_version = 2;
    if (!('job_selections' in j)) j.job_selections = {};
    for (const room of (job?.rooms ?? []) as Record<string, unknown>[]) {
      if (!('room_selections' in room)) room.room_selections = {};
      if (!('items' in room)) room.items = [];
    }
  }
  // The preview's stand-in shop became the catalog's shop (2026-11-08), so its cabinets can be checked.
  if (j && j.shop_id === PREVIEW_SHOP.retiredId) j.shop_id = PREVIEW_SHOP.id;
  const oldThickness = d.wallDefaults?.thickness as unknown;
  retag(oldThickness);
  if (retagged > 0) notes.push('Your saved room was updated: sizes are now either unmeasured (red) or confirmed (black).');
  // Doors saved before swings could be chosen keep the swing they were drawn with:
  // hinged at the start side, opening into the room.
  for (const room of job?.rooms ?? []) {
    const walls = (room.walls ?? []) as unknown as Wall[];
    const inside = insideSide({ room_id: '', name: '', ceiling_height: rough(0), walls, room_selections: {}, items: [] });
    for (const wall of walls) {
      for (const o of (wall.openings ?? []) as unknown as Record<string, unknown>[]) {
        if (!('swing' in o)) o.swing = o.kind === 'door' ? { hinge: 'start', opens: inside } : null;
      }
    }
  }
  const thickness = d.wallDefaults?.thickness;
  return { job, wallDefaults: thickness ? { thickness } : null, notes };
}

export function setOpeningKind(draft: Draft, env: Env, openingId: string, kind: Opening['kind']): Result<Change> {
  const r = room(draft);
  const found = findOpening(r, openingId);
  if (!found) return refuse('That opening no longer exists.');
  const walls = r.walls.map((w) =>
    w.wall_id !== found.wall.wall_id
      ? w
      : {
          ...w,
          openings: w.openings.map((o) =>
            o.opening_id === openingId ? { ...o, kind, swing: kind === 'door' ? (o.swing ?? standardSwing(r)) : null } : o,
          ),
        },
  );
  return ok(withRoom(draft, env, `Changed a ${found.opening.kind} to a ${kind}`, { ...r, walls }));
}

/**
 * Door handing in the usual US terms (owner, 2026-11-05; researched: archtoolbox, Allegion):
 * stand outside the door, facing it. Hinges on your left = left hand, on your right = right
 * hand. "Out" = swings towards you (out of the room), which the trade calls "reverse".
 * The saved swing is relative to the wall (see Core's SwingSchema); this converts both ways.
 */
export function doorHanding(r: Room, swing: Swing): { hand: 'left' | 'right'; swings: 'in' | 'out' } {
  const inside = insideSide(r);
  // Facing the door from outside, your left points to the wall's start when the inside is
  // the wall's left, and to its end when the inside is the wall's right.
  const hand = (inside === 'left') === (swing.hinge === 'start') ? 'left' : 'right';
  return { hand, swings: swing.opens === inside ? 'in' : 'out' };
}

export function swingFromHanding(r: Room, hand: 'left' | 'right', swings: 'in' | 'out'): Swing {
  const inside = insideSide(r);
  const hingeAtStart = (hand === 'left') === (inside === 'left');
  return { hinge: hingeAtStart ? 'start' : 'end', opens: swings === 'in' ? inside : otherSide(inside) };
}

/** Sets which end a door is hinged at, and which way it swings. */
export function setDoorSwing(draft: Draft, env: Env, openingId: string, swing: Swing): Result<Change> {
  const r = room(draft);
  const found = findOpening(r, openingId);
  if (!found) return refuse('That opening no longer exists.');
  if (found.opening.kind !== 'door') return refuse('Only doors swing.');
  const inside = insideSide(r);
  const walls = r.walls.map((w) =>
    w.wall_id !== found.wall.wall_id ? w : { ...w, openings: w.openings.map((o) => (o.opening_id === openingId ? { ...o, swing } : o)) },
  );
  return ok(
    withRoom(draft, env, `Set a door to swing ${swing.opens === inside ? 'in' : 'out'}, hinged at its ${swing.hinge === 'start' ? 'start' : 'end'} side`, { ...r, walls }),
  );
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
