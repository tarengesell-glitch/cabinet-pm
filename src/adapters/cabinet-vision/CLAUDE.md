# Module: cabinet-vision (adapter)

Filled in from `docs/BUILD_SPEC.md` section 5.8, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
The only code that knows Cabinet Vision exists: mapping tables, catalog sync, preflight, the writer, the reader and the independent verification source.

## Owns (only this module writes these)
- mappings, catalog_syncs, translations, readbacks, verifications

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`
- `catalog` (contract.ts only)
- Never `designer`, `ai-design`, `projects`.
- No AI SDKs. The writer and reader may not read the clock or random numbers.

## Provides to the ready-to-send gate
- Translation preflight (block): every item and option has a current, verified mapping and every required field is present.

## Rules for AI sessions in this module
- Only edit code inside this folder unless explicitly told otherwise. Recording the change in `docs/` and this folder's README is allowed (root `CLAUDE.md`, "Docs").
- The public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data with a recorded source, never literals in code.
- Every failure blocks the step and creates an alert. No silent catches, no defaults that hide missing data.
- Never name a CAD vendor outside its adapter folder.
- Tests live in `__tests__/` inside this folder.
