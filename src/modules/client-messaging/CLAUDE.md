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
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
