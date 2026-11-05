/**
 * The master copy format (BUILD_SPEC section 6), room shell only: Job, Room, Wall,
 * Opening, Obstacle. PlacedItem and selections are added by the next Core session,
 * which raises SCHEMA_VERSION. Version 0 is a draft and is not saved anywhere yet.
 *
 * Every object is strict: an unknown or missing field is an error, never a default.
 * Fields that may be empty are required and nullable, so "not known" is explicit.
 */
import { z } from 'zod';
import { wallLetter } from '../labels';
import { isLength } from '../units';

export const SCHEMA_VERSION = 0;

/** A length in base units (1/64 inch). Coordinates may be negative. */
export const LengthSchema = z.number().refine(isLength, 'must be a whole number of 1/64 inch');
/** A size: never negative. */
export const SizeSchema = LengthSchema.refine((v) => v >= 0, 'cannot be negative');

export const IdSchema = z.uuid();

/**
 * How sure we are of a value (owner decision, 2026-11-05):
 * rough = from the client or the intake; measured = entered on site; verified = checked.
 * Entering a value never verifies it.
 */
export const ProvenanceSchema = z.enum(['rough', 'measured', 'verified']);

/** A millimetre value as it was typed (DECISIONS U-2), kept when a value was rounded from it. */
export const SourceMmSchema = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a millimetre number such as 595.5');

/** A size and how sure we are of it. */
export const MeasuredSchema = z.strictObject({
  value: SizeSchema,
  provenance: ProvenanceSchema,
  source_mm: SourceMmSchema.nullable(),
});

export const PointSchema = z.strictObject({ x: LengthSchema, y: LengthSchema });

/** BUILD_SPEC section 6: "windows, doors, and passthroughs". */
export const OpeningKindSchema = z.enum(['window', 'door', 'passthrough']);

/**
 * How a door hangs (owner, 2026-11-05: hinge side and swing direction are choosable).
 * Stored relative to its wall, looking from the wall's start corner towards its end:
 * - hinge: the opening's edge nearer the wall's start ('start') or end ('end');
 * - opens: the side of the wall the door swings to ('left' or 'right' of that direction).
 * Whether that is "in" or "out", or a left- or right-hand door, depends on the room and is
 * worked out for display. Windows and passthroughs have no swing (null).
 */
export const SwingSchema = z.strictObject({
  hinge: z.enum(['start', 'end']),
  opens: z.enum(['left', 'right']),
});

export const OpeningSchema = z
  .strictObject({
  opening_id: IdSchema,
  kind: OpeningKindSchema,
  /** Along the wall, from the wall's start corner to the opening's near edge. */
  offset: MeasuredSchema,
  width: MeasuredSchema,
  height: MeasuredSchema,
  /** From the floor to the bottom of the opening. 0 for a door. */
  sill_height: MeasuredSchema,
  swing: SwingSchema.nullable(),
  })
  .refine((o) => (o.kind === 'door') === (o.swing !== null), {
    message: 'A door needs a swing (hinge side and direction); windows and passthroughs have none.',
  });

export const ObstacleSchema = z.strictObject({
  obstacle_id: IdSchema,
  /** An ID from the list of obstacle kinds (outlet, switch, plumbing, vent, soffit…). The list is data. */
  kind: z.string().min(1),
  /** Along the wall, from the wall's start corner to the obstacle's near edge. */
  offset: MeasuredSchema,
  /** From the floor to the bottom of the obstacle. */
  elevation: MeasuredSchema,
  width: MeasuredSchema,
  height: MeasuredSchema,
});

export const WallSchema = z.strictObject({
  wall_id: IdSchema,
  start_point: PointSchema,
  end_point: PointSchema,
  /**
   * The length the person typed, kept when the corners had to be rounded to 1/64 inch
   * (a slanted wall) or the length came from mm. Null when the corners are the length.
   */
  entered_length: SizeSchema.nullable(),
  /** The millimetre value the length was typed as, if any (U-2). */
  length_source_mm: SourceMmSchema.nullable(),
  /** How sure we are of the wall's length. */
  length_provenance: ProvenanceSchema,
  // No wall height: walls are as high as the room's ceiling (owner, 2026-11-05).
  thickness: MeasuredSchema,
  openings: z.array(OpeningSchema),
  obstacles: z.array(ObstacleSchema),
});

export const RoomSchema = z.strictObject({
  room_id: IdSchema,
  name: z.string().min(1),
  ceiling_height: MeasuredSchema,
  /** In order, as drawn. */
  walls: z.array(WallSchema),
});

/** BUILD_SPEC section 6, Job.status. */
export const JobStatusSchema = z.enum([
  'draft',
  'ai_draft',
  'in_review',
  'approved',
  'sent',
  'returned',
  'verified',
  'released',
]);

export const HistoryEntrySchema = z.strictObject({
  /** When, passed in by the caller (Core never reads the clock). */
  at: z.iso.datetime({ offset: true }),
  /** The user ID of who made the change. */
  by: IdSchema,
  origin: z.enum(['ai', 'designer']),
  summary: z.string().min(1),
});

export const JobSchema = z
  .strictObject({
    schema_version: z.literal(SCHEMA_VERSION),
    job_id: IdSchema,
    shop_id: IdSchema,
    /** The catalog version the design was last validated against; null until it has been. */
    catalog_version: z.number().int().positive().nullable(),
    status: JobStatusSchema,
    rooms: z.array(RoomSchema),
    history: z.array(HistoryEntrySchema),
  })
  .superRefine((job, ctx) => {
    // Every ID is stable and unique within the job.
    const seen = new Map<string, string>();
    const note = (id: string, what: string) => {
      const earlier = seen.get(id);
      if (earlier) {
        ctx.addIssue({ code: 'custom', message: `The ID ${id} is used twice: by ${earlier} and by ${what}.` });
      } else {
        seen.set(id, what);
      }
    };
    note(job.job_id, 'the job');
    job.rooms.forEach((room) => {
      note(room.room_id, `room "${room.name}"`);
      room.walls.forEach((wall, w) => {
        note(wall.wall_id, `wall ${wallLetter(w)} in "${room.name}"`);
        wall.openings.forEach((o, i) => note(o.opening_id, `opening ${i + 1} on wall ${wallLetter(w)} in "${room.name}"`));
        wall.obstacles.forEach((o, i) => note(o.obstacle_id, `obstacle ${i + 1} on wall ${wallLetter(w)} in "${room.name}"`));
      });
    });
  });

export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Measured = z.infer<typeof MeasuredSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Swing = z.infer<typeof SwingSchema>;
export type Obstacle = z.infer<typeof ObstacleSchema>;
export type Wall = z.infer<typeof WallSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type Job = z.infer<typeof JobSchema>;
