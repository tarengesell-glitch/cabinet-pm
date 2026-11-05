# Module: client-messaging

Filled in from `docs/BUILD_SPEC.md` section 5, OA-8, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Reminders of outstanding items and the deadline ticker. Reads what is outstanding from other modules; never writes their data.

## Owns (only this module writes these)
- deadlines, reminder_rules, sent_messages

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`
- `projects`, `intake`, `appliances`, `site-measure`, `approvals` (contract.ts only)

## Provides to the ready-to-send gate
- None.

## Rules for AI sessions in this module
- Only edit files inside this folder unless explicitly told otherwise.
- The public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data with a recorded source, never literals in code.
- Every failure blocks the step and creates an alert. No silent catches, no defaults that hide missing data.
- Never name a CAD vendor outside its adapter folder.
- Tests live in `__tests__/` inside this folder.
