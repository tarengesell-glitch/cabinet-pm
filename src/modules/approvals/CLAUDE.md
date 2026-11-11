# Module: approvals

Filled in from `docs/BUILD_SPEC.md` section 5, OA-5, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Client sign-off on one exact master copy version, with a frozen snapshot of what the client saw.

## Owns (only this module writes these)
- client_signoffs

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`

## Provides to the ready-to-send gate
- Release layer: the client signed off this exact version (block).

## Rules for AI sessions in this module
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
