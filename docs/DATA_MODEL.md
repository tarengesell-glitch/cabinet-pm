# Data Model (conceptual)

**The master copy is defined in `docs/BUILD_SPEC.md` section 6. That is authority.** This doc lists the tables around it and which module owns each one. Only the owner writes a table; everyone else reads through contracts. Table names marked PROPOSED are a first cut.

## Conventions

- IDs are UUIDs. Catalog IDs are stable forever once used in a job (spec 5.3).
- **Lengths:** exact integers in the base unit, **1/64 inch** (DECISIONS U-1, 2026-11-05). Inexact conversions are refused, except mm input, which is rounded to the nearest 1/64 inch with the original kept (U-2). Conversion happens only at the edges: editor display and adapters.
- **Angles:** one convention, documented in `core/` when the master copy is defined (Phase 1).
- **Money:** integer cents, CAD.
- Every table has `created_at`, `created_by`, `updated_at`. Every change goes to `audit_log`. Rows are soft-deleted only.
- Anything that is sent, approved or used as evidence is versioned or snapshotted, never edited in place.

## platform (PROPOSED owner)

- **users**, **roles**, **permissions**, **role_permissions**. Permissions are strings like `design.approve` or `job.send`. New roles are rows.
- **shops**: a manufacturing partner, which is a Hutterite colony. There is one now; more must be possible (OA-1). Not a customer of the software: there is no separate sign-up or billing per shop.
- **audit_log**, **alerts**, **locks**.
- **master_copy_versions**: job_id, version_no, parent_version, schema_version, document (JSON, per spec section 6), origin (designer | ai | returned), created_by. Written only by the modules named in ARCHITECTURE "Who writes it".
- **gate_results**: master copy version, each check's issues, pass/fail, run at.

## core

Core owns no tables. It owns the master copy *format*: Job, Room, Wall, PlacedItem (spec section 6), plus selection resolution (item, then room, then job) and the check interface.

**Additions to the master copy format** (needed for OA-3 to OA-5, not in spec section 6):
- **Dimension provenance (decided 2026-11-05).** Every wall length, wall thickness, opening and obstacle dimension, and ceiling height records whether it is `unmeasured` or `confirmed` (owner, 2026-11-05: two states, replacing rough / measured / verified). Typing or dragging a size never confirms it; a person confirms it on purpose. The push gate needs every value the design depends on to be `confirmed`. A size is stored as `{ value, provenance, source_mm }`. `source_mm` is the millimetre text it was rounded from, or null (U-2).
- **No wall height (owner, 2026-11-05, BUILD_SPEC OA-11).** Walls are as high as the room's `ceiling_height`.
- **Wall kind (owner, 2026-11-05, from closet-builder A-21).** Each wall is a `room` wall or a `floating` wall (an invisible wall for an island or peninsula). A floating wall has no thickness (`null`) and no openings or obstacles; cabinets will stand on both of its faces.
- **Typed wall length (decided 2026-11-05).** A wall keeps `entered_length` (and `length_source_mm`) when its corners had to be rounded to 1/64", which happens on a slanted wall or a length typed in mm. Otherwise both are null, and the corners are the length.
- **Rough layout: cabinet runs and appliances (owner, 2026-11-06; schema version 1).** Each wall carries:
  - `runs`: stretches of wall that get cabinetry: `{ run_id, kind, offset, length, depth }`, where `kind` is `base`, `upper`, `base_upper`, `base_upper_pantry` or `pantry`. A run marks where cabinetry goes; it is not cabinets. Offsets and lengths are design choices, so they are plain lengths, not `Measured`. On a room wall the depth runs into the room from the inside face; on a floating wall (island or peninsula) it is the full depth, centred on the line.
  - `appliances`: where appliances will likely go: `{ placement_id, kind, offset, width, paired_with }`. `kind` is an ID from the appliance-type list (data). `width` is `Measured` and stays `unmeasured` until the appliance is confirmed (OA-4). `paired_with` is the sink a dishwasher was placed beside, or null.
  - Corner cabinets, the 24" upper above a fridge and the hood over a range or cooktop are worked out from these and the rules; they are not stored.
  - Islands are floating walls with a run on them (A-21), not a separate shape.
  - Later, when `appliances` exists: a placement gains a reference to the job's appliance record, whose specs live there; the master copy keeps a copy of the confirmed size it was designed to.
- **Placed cabinets (schema 2, 2026-11-08):** each room has `items` (PlacedItem). Positions are wall-referenced in the CAD import file's terms: wall, side, offset along the wall from its start corner, elevation from the floor, setback from the wall face; exact 1/64" values. Selections at job, room and item level. See DECISIONS "Placed cabinets in the master copy".
- **PROPOSED:**
  - **Price shown live** is calculated from the catalog and is never stored in the master copy. Quotes freeze it (`projects`).

## catalog

- **catalog_items**: stable ID, item type (base, wall, tall, filler, panel, molding…), shop.
- **catalog_item_versions**: width, height and depth ranges and increments; supported options; required selections; allowed modifications.
- **options**, **invalid_option_combinations**.
- **catalog_versions**: a numbered snapshot per shop, so a job can be checked against the catalog as it was.
- **shop_item_availability**: whether an item is available, excluded or "manual work required".
- **prices** (PROPOSED here, because "pricing reads from the catalog"; the price structure is an open question, DECISIONS P-1).

## shop-settings

- **design_rules**: structured rule, plain-language description, default severity (warn), and the shop's promotion to block.
- **default_selections**, **preferences**.

## visual-library

- **visual_assets**: model, texture, door-style preview or icon, linked to a catalog item ID. Holds where each asset came from. Never holds dimensions or rules.

## ai-design

- **draft_runs**: the inputs used (master copy version, catalog version, rules version), the draft version produced, its explanation of key decisions, and its validation issues. Failed drafts are kept with their issues, never hidden.

## adapters/cabinet-vision

- **mappings**: our catalog item plus option combination → the shop's Cabinet Vision entry and parameters, the Cabinet Vision catalog version it was verified against, status (current | stale | unverified), and who verified it.
- **catalog_syncs**: the raw library export (in Storage), the diff found (added, removed, changed) and the mappings it flagged.
- **translations**: master copy version, mapping snapshot, writer code version, file (in Storage), content hash.
- **readbacks**: the source (decided in Phase 0), raw file reference, and the returned master copy version.
- **verifications**: the independent engineered-output source (for example a cutlist or materials report) and what it confirmed.

## comparer

- **comparison_reports**: sent version, returned version, tolerance used, and each discrepancy (missing, extra, dimension, position, selection).

## test-library

- **Golden cases are files** in `golden/<adapter>/<case>/`: master copy, expected file output, expected engineered result, and a note on where the case came from.
- **test_runs**: code version, adapter, Cabinet Vision version, and pass/fail per case.
- **corrections**: job, what was sent, what came back, the correct result, the cause, the fix, and the test case it created (spec section 8).

## projects

- **customers**, **leads**, **jobs** (job_id shared with the master copy; status, owner, target delivery date), **quotes**, **quote_lines**, **milestones**, **schedule_entries**.
- **payments**: amount, status and reference from the payment connector. "Paid" for the push gate is open (PAY-1).
- Stores no design data. Quotes are priced from the catalog and a named master copy version. An issued quote freezes the prices it used (earlier decision, still in force).

## intake (OA-3, OA-10)

- **intake_questions**: room type, order, conditions (for example "if there's an island"), fidelity (line drawing | photorealistic).
- **intake_options**: label, image asset, a link to a catalog option (if it is a real selection) or a style tag (if it is guidance).
- **intake_answers**: job, room, question, option, status (selected, skipped, needs follow-up, not applicable, confirmed; no "not sure": the questions don't offer it, owner 2026-11-09. "Not applicable" is for a follow-up an earlier answer ruled out, with a reason), who, when. The option ID is the source of truth, not the label.

## appliances (OA-4, OA-5)

- **appliance_models**: a library of brand, model, sizes, and install and clearance needs as structured data.
- **job_appliances**: job, room, model (or rough size only), status (`rough` | `confirmed`), who confirmed it and when, and a copy of the spec at confirmation.

## site-measure (OA-5)

- **measurements**: room, target (wall, opening, ceiling…), value in the base unit, provenance (rough | customer-supplied | measured | verified | needs re-verification), verified by, verified at.
- **measurement_photos**.
- **measurement_prompts** per room type (config data).

## approvals (OA-5)

- **client_signoffs**: job, the exact master copy version, who signed, how, when, and a frozen snapshot of what they saw (design, selections, price).

## job-notes (OA-7)

- **message_sources**: channel (email | text | meeting transcript), external ID, link, received at.
- **job_notes**: job, room (optional), the requirement in plain words, its source, extraction (manual | ai), confirmed by a person (yes/no), accounted for in the design (yes/no, and where).

## client-messaging (OA-8)

- **deadlines**: job, the "everything in by" date and time, the promised delivery date, and how they were worked out (see DL-1).
- **reminder_rules** (config data): what is outstanding, when to send, channel, wording.
- **sent_messages**: who, what, when, channel, and delivery status. A failed send raises an alert.

## purchasing (OA-9)

- **purchase_items**: job, item (doors, counters, handles, add-ons, materials), quantity, supplier, from which master copy version.
- **supplier_orders**: status (draft | sent | failed | confirmed | received), external reference. Orders are created automatically when the job goes into production. A failed order stays visible until resolved.
- **suppliers** (config data): what they supply and how they take orders.
