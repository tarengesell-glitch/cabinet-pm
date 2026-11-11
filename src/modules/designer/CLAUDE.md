# Module: designer

Filled in from `docs/BUILD_SPEC.md` section 5, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Room capture (walls, angles, ceiling height, openings, obstacles, utilities) and visual editing of the layout. Draws only from the master copy, offers only the shop's catalog items, shows validation live, marks AI-placed vs designer-changed items.

## Status (2026-11-11)
This module holds **the builder the app runs**: the placeholder design (`model/placeholder-draft.ts`, `data/placeholder-draft.json`), the master copy items (`model/cabinets.ts`) and the 3D view (`ui/Stage3D.tsx`). Layout and 3D fixes the owner can see go here. The live path and its tests: `docs/PROJECT_MAP.md`.

## Owns (only this module writes these)
- No tables of its own. Saves edits as new master copy versions through the platform master copy store (origin `designer`).

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`
- `catalog`, `shop-settings`, `visual-library`, `appliances` (contract.ts only)

## Provides to the ready-to-send gate
- None of its own; it shows every module's issues live.

## Rules for AI sessions in this module
- Only edit code inside this folder unless explicitly told otherwise. Recording the change in `docs/` and this folder's README is allowed (root `CLAUDE.md`, "Docs").
- The public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data with a recorded source, never literals in code.
- Every failure blocks the step and creates an alert. No silent catches, no defaults that hide missing data.
- Never name a CAD vendor outside its adapter folder.
- Tests live in `__tests__/` inside this folder.
