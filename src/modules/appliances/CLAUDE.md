# Module: appliances

Filled in from `docs/BUILD_SPEC.md` section 5, OA-4, OA-5, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Appliance specs per job: rough, then confirmed, with a copy of the spec at confirmation.

## Owns (only this module writes these)
- appliance_models, job_appliances

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`

## Provides to the ready-to-send gate
- Release layer: every appliance has a confirmed spec and the design matches it (block).

## Rules for AI sessions in this module
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
