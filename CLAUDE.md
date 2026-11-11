# CLAUDE.md: rules for every AI coding session

A cabinet design and CAD handoff platform for our own residential cabinetry sales. It runs intake and design, keeps every job in our own **master copy** format, and hands finished designs to the CAD program for engineering. **It does not engineer cabinets.** There is one manufacturing partner ("shop") today; the code must allow more.

## Read first, then only what the task needs
1. **`docs/PROJECT_MAP.md`**: what runs, what is placeholder or parked, where each rule's data and code live, and which tests cover it.
2. **`docs/REQUIREMENTS.md`**, the section for your topic: the current requirement, whether it is approved and built, what is still open, and what blocks at each stage.
3. The `README.md` of each module you change (and its `CLAUDE.md` for anything module-specific).

`docs/DECISIONS.md` is the history and approval evidence: search it for an ID or date that the requirements cite; don't read it to find today's rule.

**Which rule wins** (full version: `docs/REQUIREMENTS.md` "How to read this"): the owner's explicitly approved decisions govern, and a later approved change replaces what it changes, even in `docs/BUILD_SPEC.md`. The spec wins over derived docs, PROPOSED choices and code. PROPOSED choices, open questions and existing code are never authority. If it's unclear, flag it; don't guess.

**The app runs the designer's placeholder builder** (`src/modules/designer/model/placeholder-draft.ts`), so layout fixes go there. The AI layout builder (`src/modules/ai-design/model/engine/`) is parked: don't change it or copy fixes into it unless the owner asks.

## A typical change
1. Find the current requirement (`docs/REQUIREMENTS.md`) and the code that owns the behaviour (`docs/PROJECT_MAP.md`).
2. Change every module the requested behaviour needs (see "Working across modules"), with a test, running the "while working" checks.
3. Update docs only if the change is meaningful (see "Docs").
4. Run `npm run check` on the final code, then open the pull request.

## Working across modules
- **Do what the requested behaviour needs, wherever it lives.** Crossing a module folder needs no approval. Keep each piece in the module that owns it.
- **Keep the boundaries:** imports only through `contract.ts` and only as the dependency table allows (`docs/ARCHITECTURE.md`). Adding to a contract is routine. Removing or changing an existing export is allowed when every consumer is updated in the same pull request and the report lists them.
- **Stop and ask first** when the change would need a business decision (next section), a change to the dependency table or ARCHITECTURE, a new module or table, or destructive data handling (deleting or rewriting saved data, a migration that changes existing rows).

## Decisions you make, and decisions you don't
- **Yours (routine engineering; mention them in the report):** where code goes within the rules, structure and naming, refactors needed for the change, how to test, wiring up an approved behaviour, error-message wording, performance, additive contract changes.
- **The owner's** (add an open question to `docs/DECISIONS.md`, mark any stand-in PROPOSED, and ask): any size, clearance, option, price, role, status or rule value; what blocks or only warns; anything new the client or designer sees beyond what was asked ("less is more", `docs/ux/UX_BRIEF.md`); a change to an approved requirement; handling of real client data.
- **The shop's** (through the owner): which library part or template to use, size limits, construction, and how the CAD program behaves (rule 9).

## Hard rules
(Numbered: other docs and code cite them by number.)
1. **Change what the requested behaviour needs, keeping each piece in the module that owns it** ("Working across modules"). Crossing a folder needs no approval; changing the dependency table, adding a module or table, or destructive data handling does.
2. **Dependencies point inward** (`docs/ARCHITECTURE.md`); modules import each other only through `contract.ts`. Never weaken the boundary checks.
3. **Only the adapter knows the vendor:** "Cabinet Vision" and "ORDX" appear only in `docs/` and the `cabinet-vision/` folders of `src/adapters/`, `helpers/`, `golden/` and `samples/`. The catalog uses our own IDs.
4. **The master copy is the single source of truth.** The editor draws only from it; pricing reads the catalog and the master copy, never the CAD program.
5. **One owner per table** (`docs/DATA_MODEL.md`).
6. **Data, not code.** Sizes, options, mappings, rules, prices, roles and statuses are data with a recorded source. Never hard-code or invent one.
7. **Fail closed, fail loudly.** Anything missing, unmapped, out of range or ambiguous blocks the step with a plain reason: no empty `catch`, no silent defaults, no skipped records, no false success. Failures leave an alert until a person resolves it. What blocks at each stage: `docs/REQUIREMENTS.md`.
8. **Translation is deterministic:** the writer and reader use no AI, clock or randomness.
9. **Never guess how the CAD program behaves.** If the samples and format reference don't answer it, add an open question to `docs/DECISIONS.md` and stop. The format reference (`docs/cabinet-vision/FORMAT_REFERENCE.md`) is written in Phase 0 and doesn't exist yet; `DESK_RESEARCH.md` beside it is background, not authority.
10. **Every translator fix comes with a golden test**, and ships only if the whole golden library passes.
11. **Units:** lengths are exact integers of 1/64 inch (`src/core/`); convert only at the edges and refuse inexact conversions (millimetre input rounds, keeping the original). Money is integer cents, CAD.
12. **Never overwrite history.** Versions are kept, a sent version is frozen, every write is audited.
13. **Permissions:** every screen and action checks `can(user, permission)`; never role names.
14. **No fake integrations:** a mocked connector says so in code and UI.
15. **Ask, don't assume:** add uncovered requirements to `docs/DECISIONS.md` as open questions.
16. **Keep unresolved things unresolved:** a PROPOSED choice or an unchecked fix stays marked as one until the owner approves it or it is checked. Never mark something approved because it is built.
17. **Real client details** (names, emails, phones, addresses) never go in code, tests, commits, pull requests or docs: the repository is public.

## Checks
- **While working:** `npm run lint`, `npm run typecheck`, `npm run boundaries`, `npm run vendor-names`, `npm run test`, plus the one browser test file for a screen you changed (`npx playwright test e2e/<file>.spec.ts`).
- **Before merging:** `npm run check` on the final code (it is the only gate; there is no CI). If you change code afterwards, re-run the focused checks for that change, then `npm run check` again.
- **Docs-only change:** no `npm run check`; check each changed doc, link and path by hand.
- **Breaking a check on purpose** (show it fails, then restore it) is for new guardrails: boundary or lint rules, the vendor-name check, golden tests. Not for ordinary new tests.
- Report what you ran. Commands, timings and setup: `docs/DEVELOPMENT.md`.

## Docs
Each doc has one job (the list: `docs/PROJECT_MAP.md` "Which doc answers what"). Update docs only when something meaningful changes: behaviour the owner can see, a rule or number, a module's `contract.ts`, or the workflow. A new or changed decision goes in `docs/DECISIONS.md` **and** its line in `docs/REQUIREMENTS.md`; module behaviour in its README; what runs and where code, data and tests live in `docs/PROJECT_MAP.md`. Link to the authoritative place instead of repeating it. Refactors, test-only changes and small fixes within existing behaviour need none.

## Branches
Merging into `main` deploys the live site. Work on a branch from the latest `main` (restart it from `main` if it was already merged), open a pull request, and merge it yourself only after the checks above pass. Never push straight to `main`. Delete the branch after merging. Report the checks run and the pull request link.

## Reports
The owner, Taren, is not a programmer: plain English, short, only the questions that matter.

`AGENTS.md` (written by Next.js) points to Next.js's own docs; read them when you touch Next.js itself (routing, config, build).
