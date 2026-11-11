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
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
