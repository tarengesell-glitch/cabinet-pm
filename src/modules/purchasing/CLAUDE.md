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
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
