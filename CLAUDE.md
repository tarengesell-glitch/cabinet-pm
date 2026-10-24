# CLAUDE.md — Rules for every AI coding session

You are working on an in-house job management tool for a residential cabinetry business. Mozaik (cabinet software) is the source of truth for design, parametrics, construction rules and manufacturing files. This tool handles everything around it.

Read before any work: `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DECISIONS.md`. For any UI work also read `docs/ux/UX_BRIEF.md`.

## Hard rules

1. **Stay inside the module you were asked to change.** Each module lives in `src/modules/<name>/` and has its own `CLAUDE.md`. Do not edit files in other modules. If a change elsewhere seems necessary, stop and explain what and why instead of doing it.
2. **No module imports another module's internals.** Modules may only import from `src/core/` public exports and from another module's `contract.ts`. The boundary lint enforces this; never disable or weaken it.
3. **One owner per piece of data.** Only the owning module writes a table (see ownership table in `docs/ARCHITECTURE.md`). Others read through contracts or react to events.
4. **Data, not code.** Prices, taxes, questions, images, appliance specs, clearance rules, tolerances, measurement prompts, drawing steps, room types, roles, permissions, stages, CRM triggers, suppliers and routing are data. Never hardcode business values or option lists in components or logic.
5. **Fail loudly, never silently.** No empty `catch` blocks, no default values that hide missing data (a missing price is never zero), no skipping unmatched records. Failures stop the step, write an alert to the alerts table and show in the UI until a person resolves them. Never show a success message that isn't true.
6. **Units.** Store every length as integer millimetres. Money as integer cents (CAD). Convert only for display.
7. **Never overwrite history.** Imports, approvals, quotes and measurements are versioned or snapshotted. Every write goes through the audit log.
8. **Approved versions are immutable.** Never modify an approved room snapshot. Corrections create new linked records.
9. **Permissions on everything.** Every screen and action checks the user's permissions via `core/permissions`. No role-name checks scattered in code.
10. **No fake integrations.** Mocked connectors must be labelled as mocked in code and UI.
11. **Ask, don't assume,** when a requirement isn't covered by the docs. Add open questions to `docs/DECISIONS.md`.

## Workflow

- Small, focused changes. One module per session where possible.
- Run lint, type-check and tests before saying a task is done. Report what was actually run.
- Update the module's `README.md` and `docs/DECISIONS.md` when behaviour or decisions change.
