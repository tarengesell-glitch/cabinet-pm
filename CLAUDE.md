# CLAUDE.md: rules for every AI coding session

A cabinet design and CAD handoff platform for our own residential cabinetry sales. It runs intake and design, keeps every job in our own **master copy** format, and hands finished designs to the CAD program for engineering. **It does not engineer cabinets.** There is one manufacturing partner ("shop") today; the code must allow more.

## Read first, then only what the task needs
1. **`docs/PROJECT_MAP.md`**: what runs, what is placeholder or parked, where each rule lives, which tests cover it, what is unresolved, and which doc answers what.
2. The `CLAUDE.md` and `README.md` of the module you are changing.
3. Only the doc sections your task touches; search `docs/DECISIONS.md` rather than reading it whole.

When docs disagree, `docs/BUILD_SPEC.md` wins, then the latest **explicitly approved** decision in `docs/DECISIONS.md` that applies. A PROPOSED choice or open question never overrides an approved rule. If it's unclear which applies, flag it; don't guess.

**The app runs the designer's placeholder builder** (`src/modules/designer/model/placeholder-draft.ts`), so layout fixes go there. The AI layout builder (`src/modules/ai-design/model/engine/`) is parked: don't change it or copy fixes into it unless the owner asks.

## A typical small fix
1. Find the module that owns the behaviour (`docs/PROJECT_MAP.md`). Example: a layout or 3D problem in the studio is the designer's. If it's unclear or spans modules, ask first.
2. Read that module's `CLAUDE.md` and README, and the decisions on that topic.
3. Change that module, with a test, running the "while working" checks.
4. Update docs only if the change is meaningful (see "Docs").
5. Run `npm run check` on the final code, then open the pull request.

## Hard rules
1. **Stay in the module you were asked to change.** You may also update `docs/` and its README to record the change. If code elsewhere needs changing, stop and explain.
2. **Dependencies point inward** (`docs/ARCHITECTURE.md`); modules import each other only through `contract.ts`. Never weaken the boundary checks.
3. **Only the adapter knows the vendor:** "Cabinet Vision" and "ORDX" appear only in `docs/` and the `cabinet-vision/` folders of `src/adapters/`, `helpers/`, `golden/` and `samples/`. The catalog uses our own IDs.
4. **The master copy is the single source of truth.** The editor draws only from it; pricing reads the catalog and the master copy, never the CAD program.
5. **One owner per table** (`docs/DATA_MODEL.md`).
6. **Data, not code.** Sizes, options, mappings, rules, prices, roles and statuses are data with a recorded source. Never hard-code or invent one.
7. **Fail closed, fail loudly.** Anything missing, unmapped, out of range or ambiguous blocks the step with a plain reason: no empty `catch`, no silent defaults, no skipped records, no false success. Failures leave an alert until a person resolves it.
8. **Translation is deterministic:** the writer and reader use no AI, clock or randomness.
9. **Never guess how the CAD program behaves.** If the samples and format reference don't answer it, add an open question to `docs/DECISIONS.md` and stop. The format reference (`docs/cabinet-vision/FORMAT_REFERENCE.md`) is written in Phase 0 and doesn't exist yet; `DESK_RESEARCH.md` beside it is background, not authority.
10. **Every translator fix comes with a golden test**, and ships only if the whole golden library passes.
11. **Units:** lengths are exact integers of 1/64 inch (`src/core/`); convert only at the edges and refuse inexact conversions (millimetre input rounds, keeping the original). Money is integer cents, CAD.
12. **Never overwrite history.** Versions are kept, a sent version is frozen, every write is audited.
13. **Permissions:** every screen and action checks `can(user, permission)`; never role names.
14. **No fake integrations:** a mocked connector says so in code and UI.
15. **Ask, don't assume:** add uncovered requirements to `docs/DECISIONS.md` as questions.
16. **Keep unresolved things unresolved:** a PROPOSED choice or an unchecked fix stays marked as one until the owner approves it or it is checked.

## Checks
- **While working:** `npm run lint`, `npm run typecheck`, `npm run boundaries`, `npm run vendor-names`, `npm run test` (about 16 s together), plus the one browser test file for a screen you changed (`npx playwright test e2e/<file>.spec.ts`).
- **Before merging:** `npm run check` on the final code (about 3 min 40 s; it is the only gate, there is no CI). If you change code afterwards, re-run the focused checks for that change, then `npm run check` again.
- **Docs-only change:** no `npm run check`; check each changed doc and link by hand.
- **Breaking a check on purpose** (show it fails, then restore it) is for new guardrails: boundary or lint rules, the vendor-name check, golden tests. Not for ordinary new tests.
- Report what you ran. Details and timings: `docs/DEVELOPMENT.md`.

## Docs
Update docs only when something meaningful changes: behaviour the owner can see, a rule or number, a module's `contract.ts`, or the workflow. Decisions and PROPOSED choices go in `docs/DECISIONS.md`; module behaviour in its README; what runs and where rules or tests live in `docs/PROJECT_MAP.md`. Refactors, test-only changes and small fixes within existing behaviour need none.

## Branches
Merging into `main` deploys the live site. Work on a branch from the latest `main` (restart it from `main` if it was already merged), open a pull request, and merge it yourself only after the checks above pass. Never push straight to `main`. Delete the branch after merging. Report the checks run and the pull request link.

## Reports
The owner, Taren, is not a programmer: plain English, short, only the questions that matter.

`AGENTS.md` (written by Next.js) points to Next.js's own docs; read them when you touch Next.js itself (routing, config, build).
