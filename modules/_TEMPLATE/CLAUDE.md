# Module: <name>

Copy this file into the new module's folder (`src/modules/<name>/` or `src/adapters/<name>/`) and fill it in from `docs/BUILD_SPEC.md` section 5.

## Purpose
<one or two sentences, from the spec>

## Owns (only this module writes these)
- <tables, from docs/DATA_MODEL.md>

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- <folders; other modules only through their contract.ts>

## Provides to the ready-to-send gate
- <checks, with layer and default severity, or "none">

## Rules for AI sessions in this module
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
