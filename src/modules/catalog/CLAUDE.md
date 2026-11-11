# Module: catalog

Filled in from `docs/BUILD_SPEC.md` section 5, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Our own list of what can be designed: item types, allowed size ranges and increments, options, required selections and invalid combinations. Stable IDs and a version history. Pricing reads from here.

## Owns (only this module writes these)
- catalog_items, catalog_item_versions
- options, invalid_option_combinations
- catalog_versions, shop_item_availability
- prices (PROPOSED; price structure is open, DECISIONS E-3)

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`

## Provides to the ready-to-send gate
- Buildability checks (block): item exists for the shop, sizes in range and on increment, required selections present, no invalid option combinations.

## Rules for AI sessions in this module
- Only edit code inside this folder unless explicitly told otherwise. Recording the change in `docs/` and this folder's README is allowed (root `CLAUDE.md`, "Docs").
- The public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data with a recorded source, never literals in code.
- Every failure blocks the step and creates an alert. No silent catches, no defaults that hide missing data.
- Never name a CAD vendor outside its adapter folder.
- Tests live in `__tests__/` inside this folder.
