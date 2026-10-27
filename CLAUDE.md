# CLAUDE.md: rules for every AI coding session

You are working on a cabinet design and CAD handoff platform for a residential cabinetry business. It runs sales, intake and design in its own software, keeps every job in our own **master copy** format, and hands finished designs to Cabinet Vision (through its ORDX import) for engineering and production, then reads the result back and checks it. **This platform does not engineer cabinets.**

It is used only for our own sales, never sold. The manufacturing partner (a "shop") is a Hutterite colony: there is one today, and the code must allow more.

The spec's owner amendments (OA-1 to OA-10, at the top of `docs/BUILD_SPEC.md`) add:
- the visual intake;
- photorealistic viewing and live pricing;
- a push gated on client sign-off, confirmed appliances, a site measure and payment;
- automatic library sync and read-back;
- a conversation tally;
- client reminders;
- automatic ordering.

**The UCS library is a separate repo, and read-only from here.** The shop's Cabinet Vision UCS library lives in the `cabinet-vision-ucs` repo. A session on this repo may attach it with read access only, to look up UCS settings for mappings and expected results. Never commit, push or open a pull request to it from a session on this repo; if it looks wrong, say so and stop. Platform code never reads it at runtime.

Before any work, read:
- `docs/BUILD_SPEC.md` (the owner's spec; authority);
- `docs/ARCHITECTURE.md`;
- `docs/DATA_MODEL.md`;
- `docs/DECISIONS.md`;
- `docs/BUILD_PLAN.md`.

For any UI work, also read `docs/ux/UX_BRIEF.md`. For anything touching the adapter, also read `docs/cabinet-vision/FORMAT_REFERENCE.md`.

When docs disagree, `docs/BUILD_SPEC.md` wins. Then the "Decided" list in `docs/DECISIONS.md`. Anything marked PROPOSED is not authority. Say so when you find a conflict.

## Hard rules

1. **Stay inside the module you were asked to change.** Each module has its own `CLAUDE.md`. If a change elsewhere seems necessary, stop and explain what and why instead of doing it.
2. **Dependencies point inward** (spec P2). Follow the dependency table in `docs/ARCHITECTURE.md`. Modules import each other only through `contract.ts`. The boundary checks enforce this; never disable or weaken them.
3. **Only the adapter knows the vendor.** The words "Cabinet Vision" and "ORDX" never appear outside `src/adapters/cabinet-vision/`, `helpers/cabinet-vision/`, `golden/cabinet-vision/`, `samples/cabinet-vision/` and `docs/`. The catalog uses our own IDs, never CAD codes.
4. **The master copy is the single source of truth** (P1). The editor draws only from it (P6). Pricing reads from the catalog and the master copy, never from Cabinet Vision.
5. **One owner per piece of data.** Only the owning module writes a table (`docs/DATA_MODEL.md`).
6. **Data, not code** (P3). Size ranges, increments, options, invalid combinations, mappings, design rules, prices, roles, permissions and statuses are data with a recorded source. Never hard-code them, and never make one up.
7. **Fail closed, fail loudly** (P4). Anything missing, unmapped, out of range or ambiguous blocks the step with a plain-language reason. That means:
   - no empty `catch`;
   - no silent defaults (a missing price is never zero; a missing option is never "the usual one");
   - no skipped records.

   Failures write an alert that stays until a person resolves it. Never show a success that isn't true.
8. **Translation is deterministic** (P5). The writer and reader are ordinary code: no AI calls, no clock, no randomness. The same input gives the same bytes. AI drafts designs and writes code; it never translates at runtime and never changes mappings without review.
9. **Never guess how Cabinet Vision behaves.** If the samples and format reference don't answer it, add an open question to `docs/DECISIONS.md` and stop.
10. **Every translator fix comes with a golden test case**, and ships only if the whole golden library passes (spec section 8).
11. **Units.** Every length is an exact integer in the base unit defined in `src/core/`. Convert only at the edges (display and adapters), and refuse inexact conversions. Until the base unit is decided (DECISIONS U-1), write no length code. Money is integer cents, CAD.
12. **Never overwrite history.** Master copy versions, sent files, returned jobs, quotes and test runs are versioned. A version that has been sent is frozen. Every write goes through the audit log.
13. **Permissions on everything.** Every screen and action checks `can(user, permission)` from `src/platform/`. Never check role names in code.
14. **No fake integrations.** Mocked connectors are labelled as mocked in code and UI.
15. **Ask, don't assume,** when the docs don't cover a requirement. Add the question to `docs/DECISIONS.md`.

## Workflow

- Small, focused changes. One module per session where possible.
- Run `npm run check` before saying a task is done (once the scaffold exists). There is no CI, so this is the gate before every push. Report what was actually run.
- For every new check or rule, break it on purpose, show that it fails, restore it, and say so in the report.
- Update the module's `README.md` and `docs/DECISIONS.md` when behaviour or decisions change.
- The owner, Taren, is not a programmer. Write reports and questions in plain English, short, with only the questions that matter.
