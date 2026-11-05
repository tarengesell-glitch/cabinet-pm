# Module: ai-design

Filled in from `docs/BUILD_SPEC.md` section 5, OA-3, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Drafts a layout into the master copy from the room, selections, intake answers, shop design rules and catalog. Drafts must pass the same validation as a human design and record a short explanation.

## Owns (only this module writes these)
- draft_runs
- Saves drafts as master copy versions (origin `ai`, status `ai_draft`).

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`
- `catalog`, `shop-settings`, `intake`, `appliances` (contract.ts only)
- Never `designer`.

## Provides to the ready-to-send gate
- None. A designer must approve a draft before it can pass the gate.

## Rules for AI sessions in this module
- Only edit files inside this folder unless explicitly told otherwise.
- The public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data with a recorded source, never literals in code.
- Every failure blocks the step and creates an alert. No silent catches, no defaults that hide missing data.
- Never name a CAD vendor outside its adapter folder.
- Tests live in `__tests__/` inside this folder.
