# Module: test-library

Filled in from `docs/BUILD_SPEC.md` section 5, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Runs the golden test cases (files in `golden/<adapter>/`) and records regression runs and corrections.

## Owns (only this module writes these)
- test_runs, corrections

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`
- every adapter (contract.ts only)

## Provides to the ready-to-send gate
- None.

## Rules for AI sessions in this module
- Only edit files inside this folder unless explicitly told otherwise.
- The public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data with a recorded source, never literals in code.
- Every failure blocks the step and creates an alert. No silent catches, no defaults that hide missing data.
- Never name a CAD vendor outside its adapter folder.
- Tests live in `__tests__/` inside this folder.
