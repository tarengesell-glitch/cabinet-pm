# Module: purchasing

Filled in from `docs/BUILD_SPEC.md` section 5, OA-9, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Automatic orders for doors, counters, handles, add-ons and materials when a job goes into production. A failed order stays visible until resolved.

## Owns (only this module writes these)
- purchase_items, supplier_orders, suppliers

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`
- `catalog` (contract.ts only)

## Provides to the ready-to-send gate
- None.

## Rules for AI sessions in this module
- Only edit code inside this folder unless explicitly told otherwise. Recording the change in `docs/` and this folder's README is allowed (root `CLAUDE.md`, "Docs").
- The public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data with a recorded source, never literals in code.
- Every failure blocks the step and creates an alert. No silent catches, no defaults that hide missing data.
- Never name a CAD vendor outside its adapter folder.
- Tests live in `__tests__/` inside this folder.
