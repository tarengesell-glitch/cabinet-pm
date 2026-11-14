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
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
