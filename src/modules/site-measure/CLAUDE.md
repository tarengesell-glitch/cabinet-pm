# Module: site-measure

Filled in from `docs/BUILD_SPEC.md` section 5, OA-5, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Site measurements with provenance, verified explicitly. Entering a value never verifies it.

## Owns (only this module writes these)
- measurements, measurement_photos, measurement_prompts

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`

## Provides to the ready-to-send gate
- Release layer: required measurements are verified and the design uses them (block).

## Rules for AI sessions in this module
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
