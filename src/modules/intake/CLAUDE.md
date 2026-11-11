# Module: intake

Filled in from `docs/BUILD_SPEC.md` section 5, OA-3, OA-10, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
The visual intake (image selector): questions, options, images and answers per room type. Option IDs are the source of truth.

## Owns (only this module writes these)
- intake_questions, intake_options, intake_answers

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`
- `catalog` (contract.ts only)

## Provides to the ready-to-send gate
- None.

## Rules for AI sessions in this module
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
