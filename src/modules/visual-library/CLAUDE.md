# Module: visual-library

Filled in from `docs/BUILD_SPEC.md` section 5, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
How things look: models, textures, door-style previews and icons, linked to catalog items by ID. No dimensions or rules.

## Owns (only this module writes these)
- visual_assets

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/platform`
- `catalog` (contract.ts only; item ID types only)

## Provides to the ready-to-send gate
- None.

## Rules for AI sessions in this module
- Only edit code inside this folder unless explicitly told otherwise. Recording the change in `docs/` and this folder's README is allowed (root `CLAUDE.md`, "Docs").
- The public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data with a recorded source, never literals in code.
- Every failure blocks the step and creates an alert. No silent catches, no defaults that hide missing data.
- Never name a CAD vendor outside its adapter folder.
- Tests live in `__tests__/` inside this folder.
