# Build Plan

The phases are `docs/BUILD_SPEC.md` section 10. This file breaks them into sessions: one Claude Code session per row, then review, test and commit before the next. Rule of thumb: if a session wants to touch more than one module, split it.

"Owner" rows are done by you (and the shop), not by Claude.

## Phase 0: Discovery

**Exit:** format reference reviewed; open questions listed; read-back source chosen.

| # | Who | Step | Prompt / guide |
|---|---|---|---|
| 0a | Owner + shop | Gather 15–30 varied completed jobs with their ORDX exports and engineered outputs, plus the shop's catalog export and Cabinet Vision version | `samples/cabinet-vision/README.md` |
| 0b | Claude | Write the ORDX format reference and the read-back options from the samples. No app code. | `prompts/00-cabinet-vision-discovery.md` |
| 0c | Owner + a Cabinet Vision expert | Review the format reference, answer what you can, choose the read-back source, decide the base unit (U-1) | — |

## Phase 1: Proof slice (go/no-go)

**Exit:** test jobs (one wall of base cabinets, one door style) import into Cabinet Vision correctly with no manual fixes. **If not, stop and reassess.**

| # | Who | Step | Prompt |
|---|---|---|---|
| 1a | Claude | Scaffold the repo and its guardrails: folders, dependency rules, vendor-name check, purity checks, test runners. Can run alongside Phase 0. | `prompts/01-scaffold-and-guardrails.md` |
| 1b | Claude | Core: master copy schemas, base unit, angles, selection resolution, check interface, first layout checks. **Needs U-1 and A-1 decided.** | `prompts/02-core-master-copy.md` |
| 1c | Claude | Catalog, minimal: the proof-slice items as versioned data, plus the buildability checks | `prompts/03-catalog-proof-slice.md` |
| 1d | Claude | Cabinet Vision adapter, minimal: mapping data, preflight, deterministic writer, first golden cases | `prompts/04-ordx-writer-proof-slice.md` |
| 1e | Owner | Import the generated files into Cabinet Vision and record the go/no-go in `DECISIONS.md` | `golden/cabinet-vision/README.md` (written in 1d) |

## Phase 2: Read-back and compare

**Exit:** proof-slice jobs round-trip with zero unexplained discrepancies.

| # | Step |
|---|---|
| 2a | Reader for the chosen source (adapter) |
| 2b | Independent verification from Cabinet Vision's engineered output (adapter) |
| 2c | Comparer (pure, no vendor knowledge) |
| 2d | Test library runner, correction records, and the "fix ships only if every case passes" check |

## Phase 3: Expand coverage

**Exit:** the agreed coverage list passes; every fix has a test case.

Work through this list, one item type or feature per session, each adding golden cases: uppers, talls, corners, fillers, panels, islands, more door styles and options. The coverage list is agreed with the owner before starting. **The licensing and partner-program review (S-4) happens before this phase.**

## Phase 4: Catalog and shop onboarding

**Exit:** a shop's catalog can be mapped and kept in sync; stale mappings are detected.

Full Product Catalog with versions and the editor for it; catalog sync; mapping tools (AI drafts mappings, a person verifies them); Shop Settings with design rules.

## Phase 5: Designer

**Exit:** designers produce jobs that pass the gate and import cleanly.

Before this phase: a UX session that turns `docs/ux/UX_BRIEF.md` into screen specs and design tokens (C-2 must be decided). Then room capture, the visual editor (draws only from the master copy), live validation, and the ready-to-send gate screen.

## Phase 6: AI Design

**Exit:** AI drafts pass validation and need only light designer edits on typical jobs.

Design rules applied, draft generation, decision explanations, and the review flow with AI-placed items marked.

## Phase 7: Projects & Sales (can run in parallel with 3–6)

**Exit:** customers, quotes, pricing and status tracking work, and quotes are priced from the catalog.

Depends only on Core and Catalog. Its scope depends on the answers to E-1 to E-5 and C-3.

## Phase 8 (optional): Mozaik read-back

A Mozaik reader (from its SQLite export) plus a build sheet for entering the design by hand. No changes outside the new adapter.

## Prompts

Only the first prompts are written. The prompt for each later phase is written when that phase starts, from what earlier phases learned.
