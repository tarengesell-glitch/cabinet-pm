# Data Model (conceptual)

**The master copy is defined in `docs/BUILD_SPEC.md` section 6. That is authority.** This doc lists the tables around it and which module owns each one. Only the owner writes a table; everyone else reads through contracts. Table names marked PROPOSED are a first cut.

## Conventions

- IDs are UUIDs. Catalog IDs are stable forever once used in a job (spec 5.3).
- **Lengths:** exact integers in one internal base unit. **The unit is not chosen yet** (DECISIONS U-1). No length code is written until it is. Conversion happens only at the edges: editor display and adapters.
- **Angles:** one convention, documented in `core/` when the master copy is defined (Phase 1).
- **Money:** integer cents, CAD.
- Every table has `created_at`, `created_by`, `updated_at`. Every change goes to `audit_log`. Rows are soft-deleted only.
- Anything that is sent, approved or used as evidence is versioned or snapshotted, never edited in place.

## platform (PROPOSED owner)

- **users**, **roles**, **permissions**, **role_permissions**. Permissions are strings like `design.approve` or `job.send`. New roles are rows.
- **shops**: who a shop is is an open question (DECISIONS S-0).
- **audit_log**, **alerts**, **locks**.
- **master_copy_versions**: job_id, version_no, parent_version, schema_version, document (JSON, per spec section 6), origin (designer | ai | returned), created_by. Written only by the modules named in ARCHITECTURE "Who writes it".
- **gate_results**: master copy version, each check's issues, pass/fail, run at.

## core

Core owns no tables. It owns the master copy *format*: Job, Room, Wall, PlacedItem (spec section 6), plus selection resolution (item, then room, then job) and the check interface.

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

- **customers**, **leads**, **jobs** (job_id shared with the master copy; status, owner), **quotes**, **quote_lines**, **milestones**, **schedule_entries**.
- Stores no design data. Quotes are priced from the catalog and a named master copy version. An issued quote freezes the prices it used (earlier decision, still in force).

## Not in v1 (from the earlier plan; status waiting on the owner, see DECISIONS)

These are not built until the owner confirms them:
- site measurements with provenance;
- appliance library;
- job notes from email and texts;
- visual client intake questionnaire;
- client approvals with frozen snapshots;
- the four separate per-room states;
- regions routing jobs to manufacturing partners;
- purchasing and supplier orders.
