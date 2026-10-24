# Module: <name>

Copy this file into `src/modules/<name>/CLAUDE.md` when creating a module.

## Purpose
<one or two sentences>

## Owns (only this module writes these)
- <tables>

## Reads (via contracts or events only)
- <other modules' contracts>

## Emits events
- <event names>

## Listens to events
- <event names>

## Rules for AI sessions in this module
- Only edit files inside `src/modules/<name>/` unless explicitly told otherwise.
- Public API is `contract.ts` only. Changing it is a breaking change: list every consumer and stop for approval first.
- Business values come from data tables or config, never literals in code.
- Every failure creates an alert. No silent catches.
- Tests live in `src/modules/<name>/__tests__/`.
