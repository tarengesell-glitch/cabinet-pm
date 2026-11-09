/**
 * The master copy format (BUILD_SPEC section 6): Job, Room, Wall, Opening, Obstacle, the rough
 * layout on each wall (cabinet runs and appliance placements, owner 2026-11-06), and since
 * version 2 the placed cabinets (PlacedItem) and the job, room and item selections.
 * The format is still a draft and is not saved anywhere but the preview's browser storage.
 *
 * Every object is strict: an unknown or missing field is an error, never a default.
 * Fields that may be empty are required and nullable, so "not known" is explicit.
 */
import { z } from 'zod';
import { wallLetter } from '../labels';
import { isLength } from '../units';

export const SCHEMA_VERSION = 2;

/** A length in base units (1/64 inch). Coordinates may be negative. */
export const LengthSchema = z.number().refine(isLength, 'must be a whole number of 1/64 inch');
/** A size: never negative. */
export const SizeSchema = LengthSchema.refine((v) => v >= 0, 'cannot be negative');

export const IdSchema = z.uuid();

/**
 * Whether a size is confirmed (owner decision, 2026-11-05, replacing rough/measured/verified):
 * unmeasured = anything not yet confirmed, including sizes typed in; confirmed = checked and
 * confirmed by a person, on purpose. Typing or dragging a size never confirms it.
 */
export const ProvenanceSchema = z.enum(['unmeasured', 'confirmed']);

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

/**
 * What a cabinet run holds (owner, 2026-11-06): base only, upper only, base + upper,
 * base + upper + pantry, or all pantry. A run marks where cabinetry goes; it is not cabinets.
 */
export const RunKindSchema = z.enum(['base', 'upper', 'base_upper', 'base_upper_pantry', 'pantry']);

/**
 * A stretch of wall that gets cabinets (the rough layout, OA-3). Positions are design choices,
 * not site measurements, so they are plain lengths rather than Measured.
 */
export const RunSchema = z
  .strictObject({
    run_id: IdSchema,
    kind: RunKindSchema,
    /** Along the wall, from the wall's start corner to the run's near end. */
    offset: SizeSchema,
    length: SizeSchema,
    /**
     * Front to back. On a room wall, from the wall's inside face into the room. On a floating
     * wall (an island or peninsula), the cabinetry's full depth, centred on the wall's line.
     */
    depth: SizeSchema,
  })
  .refine((r) => r.length > 0 && r.depth > 0, { message: 'A cabinet run needs a length and a depth.' });

/**
 * Where an appliance will likely go (OA-3; DATA_MODEL "Appliances in the room"). Placed along
 * a wall like an opening. Its width stays unmeasured until the appliance is confirmed (OA-4).
 */
/**
 * What goes over a range or cooktop (owner, 2026-11-09): an appliance hood, a millwork hood or a
 * cabinet. Which appliance kinds take one is data (the appliance-type list).
 */
export const OverCookingSchema = z.enum(['appliance_hood', 'millwork_hood', 'cabinet']);
export type OverCooking = z.infer<typeof OverCookingSchema>;

export const AppliancePlacementSchema = z.strictObject({
  placement_id: IdSchema,
  /** An ID from the list of appliance types (fridge, range, sink…). The list is data. */
  kind: z.string().min(1),
  /** Along the wall, from the wall's start corner to the appliance's near edge. */
  offset: SizeSchema,
  width: MeasuredSchema,
  /** The sink a dishwasher was placed beside (owner, 2026-11-06); null for anything else. */
  paired_with: IdSchema.nullable(),
  /**
   * For an appliance that takes something over it (a range or cooktop): what goes there. Not
   * set on rooms saved before 2026-11-09, which had an appliance hood (DECISIONS 2026-11-06:
   * ranges and cooktops come with a hood); the screens read it so.
   */
  above: OverCookingSchema.optional(),
});

/**
 * A room wall is a real wall of the room. A floating wall (owner, 2026-10-09, closet-builder
 * A-21; carried over 2026-11-05) is an invisible wall for an island or peninsula: a line with
 * a position and direction, no thickness, not part of the room's outline, which cabinets can
 * stand against on both faces. One kind serves both islands and peninsulas.
 */
export const WallKindSchema = z.enum(['room', 'floating']);

export const WallSchema = z
  .strictObject({
  wall_id: IdSchema,
  kind: WallKindSchema,
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
  /** A room wall's thickness; null for a floating wall, which has none. */
  thickness: MeasuredSchema.nullable(),
  openings: z.array(OpeningSchema),
  obstacles: z.array(ObstacleSchema),
  /** Cabinet runs along this wall, in any order. */
  runs: z.array(RunSchema),
  /** Appliances along this wall, in any order. */
  appliances: z.array(AppliancePlacementSchema),
  })
  .refine((w) => (w.kind === 'room') === (w.thickness !== null), {
    message: 'A room wall needs a thickness; a floating wall has none.',
  })
  .refine((w) => w.kind === 'room' || (w.openings.length === 0 && w.obstacles.length === 0), {
    message: 'A floating wall cannot have doors, windows or obstacles.',
  });

/**
 * Selections (BUILD_SPEC section 6): option code → chosen value code, both the catalog's own
 * codes (never a CAD code). An item's effective selections are resolved item, then room, then job.
 */
export const SelectionsSchema = z.record(z.string().min(1), z.string().min(1));

/**
 * Where a placed item stands (BUILD_SPEC section 6: "wall reference plus offset along the wall
 * and elevation"). Every placement is on a wall: islands and peninsulas stand on floating walls
 * (A-21), so no item needs free room coordinates. All four lengths are exact base units, the
 * true size in the room, so the CAD file can be written from them without rounding.
 */
export const ItemPositionSchema = z.strictObject({
  wall_id: IdSchema,
  /**
   * Which side of the wall the item stands on, looking from the wall's start to its end (the
   * same convention as a door's swing). On a room wall it must be the room's inside; a floating
   * wall has cabinets on either side.
   */
  side: z.enum(['left', 'right']),
  /**
   * Along the wall, from the wall's start corner to the item's edge nearer that corner,
   * measured on the wall's line (as openings, runs and appliances are).
   */
  offset: SizeSchema,
  /** From the floor to the bottom of the item (its box, toe kick included). */
  elevation: SizeSchema,
  /**
   * From the wall face to the back of the item: on a room wall, from the inside face; on a
   * floating wall, from the wall's line. 0 when it stands against the wall.
   */
  setback: SizeSchema,
});

/** Who placed an item and who last changed it (BUILD_SPEC 5.6, 9 "Reviewer complacency"). */
export const ItemOriginSchema = z.strictObject({
  placed_by: z.enum(['ai', 'designer']),
  last_edited_by: z.enum(['ai', 'designer']),
  /** True once a designer has approved an AI-placed item as it is. A designer's edit counts too. */
  approved: z.boolean(),
});

/** A catalog-defined modification (scribe, end panel…). Free-form modifications are not allowed. */
export const ModificationSchema = z.strictObject({ code: z.string().min(1) });

/** BUILD_SPEC section 6, PlacedItem: one catalog item placed in a room. */
export const PlacedItemSchema = z
  .strictObject({
    item_instance_id: IdSchema,
    /** Our catalog's item ID, never a CAD-specific code. */
    catalog_item_id: IdSchema,
    width: SizeSchema,
    height: SizeSchema,
    depth: SizeSchema,
    position: ItemPositionSchema,
    item_selections: SelectionsSchema,
    modifications: z.array(ModificationSchema),
    origin: ItemOriginSchema,
    /** Free text for the shop; never used for translation. */
    notes: z.string(),
  })
  .refine((i) => i.width > 0 && i.height > 0 && i.depth > 0, { message: 'A placed item needs a width, a height and a depth.' });

export const RoomSchema = z.strictObject({
  room_id: IdSchema,
  name: z.string().min(1),
  ceiling_height: MeasuredSchema,
  /** In order, as drawn. */
  walls: z.array(WallSchema),
  /** Overrides of the job's selections for this room. */
  room_selections: SelectionsSchema,
  /** The cabinets and other catalog items placed in this room. */
  items: z.array(PlacedItemSchema),
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
    /** Default selections for the whole job (door style, finish, hardware, construction). */
    job_selections: SelectionsSchema,
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
        wall.runs.forEach((r, i) => note(r.run_id, `cabinet run ${i + 1} on wall ${wallLetter(w)} in "${room.name}"`));
        wall.appliances.forEach((a, i) => note(a.placement_id, `appliance ${i + 1} (${a.kind}) on wall ${wallLetter(w)} in "${room.name}"`));
      });
      room.items.forEach((item, i) => note(item.item_instance_id, `placed item ${i + 1} in "${room.name}"`));
    });
  });

export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Measured = z.infer<typeof MeasuredSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Swing = z.infer<typeof SwingSchema>;
export type Obstacle = z.infer<typeof ObstacleSchema>;
export type RunKind = z.infer<typeof RunKindSchema>;
export type Run = z.infer<typeof RunSchema>;
export type AppliancePlacement = z.infer<typeof AppliancePlacementSchema>;
export type Wall = z.infer<typeof WallSchema>;
export type WallKind = z.infer<typeof WallKindSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type Job = z.infer<typeof JobSchema>;
export type Selections = z.infer<typeof SelectionsSchema>;
export type ItemPosition = z.infer<typeof ItemPositionSchema>;
export type ItemOrigin = z.infer<typeof ItemOriginSchema>;
export type PlacedItem = z.infer<typeof PlacedItemSchema>;

/**
 * An item's effective selections: item, then room, then job (BUILD_SPEC section 6). The resolved
 * values, not the chain, are what validation and translation check. Nothing is filled in.
 */
export function resolveSelections(job: Pick<Job, 'job_selections'>, room: Pick<Room, 'room_selections'>, item: Pick<PlacedItem, 'item_selections'>): Selections {
  return { ...job.job_selections, ...room.room_selections, ...item.item_selections };
}
