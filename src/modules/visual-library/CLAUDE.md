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
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
