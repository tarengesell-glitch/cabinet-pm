# Module: job-notes

Filled in from `docs/BUILD_SPEC.md` section 5, OA-7, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
The running tally of requirements from email, texts and meeting transcripts, each confirmed by a person and tracked as accounted for in the design.

## Owns (only this module writes these)
- message_sources, job_notes

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`

## Provides to the ready-to-send gate
- None.

## Rules for AI sessions in this module
- Only edit files inside this folder unless explicitly told otherwise.
- The public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data with a recorded source, never literals in code.
- Every failure blocks the step and creates an alert. No silent catches, no defaults that hide missing data.
- Never name a CAD vendor outside its adapter folder.
- Tests live in `__tests__/` inside this folder.
