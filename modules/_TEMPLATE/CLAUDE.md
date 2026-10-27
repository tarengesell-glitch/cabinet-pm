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
- Only edit files inside this folder unless explicitly told otherwise.
- The public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data with a recorded source, never literals in code.
- Every failure blocks the step and creates an alert. No silent catches, no defaults that hide missing data.
- Never name a CAD vendor outside its adapter folder.
- Tests live in `__tests__/` inside this folder.
