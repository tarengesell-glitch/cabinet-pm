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
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
