# Module: shop-settings

Filled in from `docs/BUILD_SPEC.md` section 5, `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

## Purpose
Per-shop design rules (structured, with a plain-language description), default selections and preferences.

## Owns (only this module writes these)
- design_rules
- default_selections, preferences

## May import (from docs/ARCHITECTURE.md "Dependency rules")
- `src/core`, `src/platform`
- `catalog` (contract.ts only)

## Provides to the ready-to-send gate
- Design-rule checks: each confirmed rule's `design_tool` setting gives its severity (`docs/REQUIREMENTS.md` "Design rules"; whether they stop the push is open).

## Rules for AI sessions in this module
The root `CLAUDE.md` applies in full, including "Working across modules": change other modules when the requested behaviour needs it, through their contracts and within the dependency table. Tests live in `__tests__/` inside this folder.
