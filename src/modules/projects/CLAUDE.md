# Module: projects

Filled in from `docs/BUILD_SPEC.md` section 5, OA-5, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Customers, leads, jobs, quotes, payments status, milestones and scheduling. Links to designs by job ID only; stores no design data.

## Owns (only this module writes these)
- customers, leads, jobs, quotes, quote_lines, milestones, schedule_entries, payments

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`
- `catalog` (contract.ts only)

## Provides to the ready-to-send gate
- Release layer: the job is paid (block; "paid" is open, DECISIONS PAY-1).

## Rules for AI sessions in this module
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
