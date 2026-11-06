# core

The master copy format (Zod schemas), the base unit and conversions, the angle convention, generic geometry, layout checks and the validation interface (BUILD_SPEC 5.2).

**Pure:** no database, network, React, clock or randomness. It imports nothing but `zod`. The checks in `npm run check` enforce this.

Core never throws for bad input. Anything that can be refused returns `{ ok: true, value }` or `{ ok: false, reason }`, where `reason` is a plain-language sentence to show the person (`result.ts`).

## Lengths (`units.ts`, DECISIONS U-1 and U-2)
- A `Length` is a whole number of **1/64 inch**. Sizes are never negative; coordinates may be.
- `parseImperial` reads `10' 2 1/4"`, `10'2-1/4"`, `122.25`, `3/8` and similar. Anything not exactly on a 1/64" mark is refused with a reason.
- `fromInches(whole, num, den)` is exact or refused.
- `fromMillimetres("595.5")` is the one exception to exactness. It rounds to the nearest 1/64" (ties away from zero) and returns `source_mm`, which must be stored with the value. The calculation is exact BigInt maths: mm × 320 / 127.
- `formatInches` writes lengths for people, for example `10' 2 1/4"`.

## Angles (`angles.ts`, DECISIONS A-1)
- An `Angle` is a whole number of **hundredths of a degree**, normalized to 0 … 35999 (22.5° is 2250).
- 0 points along the room's **+X** axis. Angles grow **counter-clockwise**.
- Room coordinates have **Y pointing up**, as on paper. Screens have Y pointing down, so the drawing screen must flip Y when converting between screen and room coordinates. Core never does.
- `directionOf` and `cornerAngle` use trigonometry. They are for display and snapping only, never for stored values.

## Geometry (`geometry.ts`)
- Comparisons are exact. "Does this fit along the wall" compares squared lengths in BigInt, so it stays exact on slanted walls, whose true length is rarely a whole number of 1/64".
- `pointFromLengthAndAngle` gives a wall's far corner from a typed length and angle.
  - Exact at 0°, 90°, 180° and 270°.
  - Any other angle rounds the corner to the nearest 1/64" and returns `entered_length` to keep with the wall (owner decision, 2026-11-05).
- `segmentsCross`: walls cross when their insides cross, or when they run along the same line and overlap. Sharing a corner, or a stub wall ending on another wall, is not crossing.
- Snapping for the drawing screen:
  - `snapToPoints` (corners within a tolerance; on a tie, the first candidate wins);
  - `snapToGrid`;
  - `snapEndToAngle` (for example, every 45°).

  The tolerance, grid and step are UI settings that the caller passes in.

## The master copy (`schema/master-copy.ts`)
Job, Room, Wall, Opening (window, door or passthrough), Obstacle, and the rough layout on each wall: cabinet runs and appliance placements (schema version 1, owner 2026-11-06). PlacedItem and selections come in step 1b-items, which raises `SCHEMA_VERSION` again. The format is still a draft, saved only in the preview's browser storage.
- Every object is strict. An unknown or missing field is an error, never a default. "Not known" is an explicit `null`.
- Each size is `Measured`: `{ value, provenance: 'unmeasured' | 'confirmed', source_mm }`. Two states (owner, 2026-11-05); typing a size never confirms it.
- A wall is a `room` wall or a `floating` wall (an invisible wall for an island or peninsula: no thickness, no openings; closet-builder A-21). It is two corner points, plus:
  - `entered_length` and `length_source_mm` when the corners were rounded (see above);
  - `length_provenance`;
  - a `Measured` thickness (no height of its own: walls are as high as the ceiling, owner 2026-11-05);
  - its openings and obstacles, placed by `offset` along the wall from its start corner;
  - its **cabinet runs** (`base`, `upper`, `base_upper`, `base_upper_pantry` or `pantry`, with `offset`, `length` and `depth`) and **appliance placements** (`kind` from the appliance-type list, `offset`, a `Measured` width, and `paired_with` for a dishwasher beside its sink). Runs mark where cabinetry goes; they are not cabinets. Corner cabinets, the upper over a fridge and hoods are worked out, not stored.
- IDs are UUIDs, passed in by the caller, and must be unique within the job.

## Checks (`checks.ts`)
- A check is `{ id, layer, description, run(job, context) → Issue[] }`.
- An issue is `{ check_id, severity: 'block' | 'warn', message, ref: { kind, id } }`.
- `runChecks` fails closed. A check that crashes, or two checks with the same ID, becomes a **blocking** issue; it is never skipped. Only blocking issues stop a pass.

### Wall layout checks (`layout/wall-checks.ts`, all block)
| ID | Fails when |
|---|---|
| `layout.wall-zero-length` | A wall starts and ends at the same point |
| `layout.fits-along-wall` | An opening or obstacle runs past the end of its wall |
| `layout.fits-under-ceiling` | An opening or obstacle reaches above the room's ceiling |
| `layout.openings-overlap` | Two openings on one wall overlap (touching is fine) |
| `layout.walls-cross` | Two walls in a room cross or run over each other |

### Rough-layout checks (`layout/run-checks.ts`, all block)
Pure geometry. Clearances such as "3\" from a door" are snapping rules kept as data in the designer, not checks.
| ID | Fails when |
|---|---|
| `layout.runs-fit-along-wall` | A cabinet run or appliance runs past the end of its wall |
| `layout.runs-overlap` | Two runs on one wall overlap (touching is fine) |
| `layout.runs-clear-doorways` | A run or appliance crosses a door or passthrough (windows are fine) |
| `layout.appliances-overlap` | Two appliances on one wall overlap |
| `layout.appliances-on-runs` | An appliance isn't within a run (touching runs count as one stretch) |
| `layout.appliance-pairs-exist` | A dishwasher points to a sink that isn't in the room |

## Tests
`__tests__/` holds unit tests and two example rooms in `examples/rooms.ts`: a 12' × 10' kitchen with a rough layout (runs, a sink under the window with its dishwasher, a range), and an L-shaped laundry with a 45° wall. Both pass every check, and for each check a copy broken for it fails it.
