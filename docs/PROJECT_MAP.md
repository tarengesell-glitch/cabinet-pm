# Project map

What actually runs, where each rule lives, which tests cover it, and what is still open. Read this before anything else in `docs/`. Keep it current: update it when what runs, where a rule lives or where a test lives changes. Last checked 2026-11-11 (after PRs #57 and #59, and the cabinet ends change).

## The live path: a saved job to the 3D view
1. **Saved job:** the shared database (Supabase, `src/app/sync/`) or a test-job file (`src/app/studio/test-data.ts`, the studio's "Test data" menu). Each room's master copy is kept by `src/modules/designer/ui/placeholder-store.ts`.
2. **Studio:** `src/app/studio/Studio.tsx` steps through the design choices (`intake` module), the room drawing, the design step and Customize. Each room's choices are read by intake's `roomDesignInputs` when a later step needs them, and handed on: the room kind to the drawing, the builder's preferences to the design step, the look to Customize.
3. **Design step:** `src/app/studio/AiStep.tsx` calls `draftRoom` (`designer/ui/placeholder-store.ts`), which runs the **placeholder builder**: `src/modules/designer/model/placeholder-draft.ts`. No AI is called; the animation is a placeholder.
4. **Into the master copy:** `designer/model/cabinets.ts` (`placeholderItems`) turns the layout into placed items, saved as an AI draft version.
5. **Customize and 3D:** `designer/ui/Customize.tsx` reads the placed items (`cabinetViews` in `cabinets.ts`) and draws them in `designer/ui/Stage3D.tsx` (three.js). Its one camera start is `fit()`.

**A fix goes in the module that owns the behaviour.** For layout or 3D problems in the studio that is the designer (steps 3 to 5); for design choices it is `intake`, for cabinet sizes `catalog`, for shop rules `shop-settings`, for saving and sync the app's `src/app/sync/` (see "Where the rules live"). If it's unclear which module owns it, ask.

## Placeholder, parked and unused code
| Code | Status |
|---|---|
| `src/modules/designer/model/placeholder-draft.ts` and `data/placeholder-draft.json` | **Live.** A placeholder for the AI design step (no AI), but it is what the app runs. |
| The AI step's animation (`src/app/studio/AiStep.tsx`) | Placeholder: no AI model is called. |
| `src/modules/ai-design/model/engine/` and `data/draft-rules.json` (the "AI layout builder") | **Parked.** Nothing in the app calls `draftLayout`; only its own tests. Don't change it or copy fixes into it unless the owner asks (DECISIONS 2026-11-11). Kept, not deleted. |
| `src/modules/ai-design/model/brief.ts` (the design brief) | Built and tested; not yet used by the app (no AI model is called). |
| Today, Tasks and Clients (`src/app/(office)/`) | Placeholders with demo data. |
| Modules with only a `CLAUDE.md`, README and `contract.ts` (approvals, comparer, purchasing, site-measure, client-messaging, job-notes, test-library, visual-library, appliances) | Not built yet. |
| The CAD adapter (`src/adapters/cabinet-vision/`) | Not built yet; waits for Phase 0 samples. |

## Where the rules live (the authoritative copy)
| Rule | File | Notes |
|---|---|---|
| Cabinet types, sizes, steps, options | `src/modules/catalog/data/catalog-v1.json` | The one source of cabinet sizes. |
| Shop design rules (PREF-, HARD-, CB-) | `src/modules/shop-settings/data/design-rules.json`, `design-rule-checks.json` | |
| Wall thickness, standard openings, door swing | `src/modules/designer/data/standard-sizes.json` | |
| Run depths, appliance widths, island sizes, what goes over a range, bathroom fixture sets | `src/modules/designer/data/layout-rules.json` | The 24" base depth appears twice here (`run_depths.base` and `room_sets.kitchen.base_depth`). |
| **Live builder:** which catalog part goes where, drawer levels, widths, hood and fridge clearances, fridge panel, island back panel, bathroom vanities | `src/modules/designer/data/placeholder-draft.json` | Has PROPOSED entries (see "Unresolved"). |
| Cabinet ends (`end_left` / `end_right`): the rule's values and which cabinet types get them | `placeholder-draft.json` "ends"; worked out only in `src/modules/designer/model/ends.ts` | Saved on each cabinet; the 3D view draws only what is saved. Left/right PROPOSED (END-1); corner cabinets unset (END-2). |
| 3D-only sizes (toe kick, counter, rough appliance shapes) | `placeholder-draft.json` "visual" | Visual only; never sent to the shop. A few small drawing sizes are in `Stage3D.tsx` itself. |
| Design choices (the intake questions and options) | `src/modules/intake/data/intake-v1.json` | The answers are the only saved copy. How other steps read them: `src/modules/intake/model/design-inputs.ts` (`roomDesignInputs`); add a new choice the builder or 3D view needs there. |
| Room and layout checks (walls, runs, items) | `src/core/layout/` | |
| Units (1/64 inch) | `src/core/units.ts` | |
| Module dependency table | `tools/architecture.cjs` (from `docs/ARCHITECTURE.md`) | |

**Duplicates to know about:** `ai-design/data/draft-rules.json` repeats the live builder's clearances, fridge height, part choices and drawer levels. Its drawer levels already differ from the live builder's (for "Maximum": the live builder uses all 3-drawer banks; the parked one uses two banks of 4, then more banks). For anything the app shows, `placeholder-draft.json` is the one that counts. Merging the two waits for the owner's call.

## Tests
| Area | Unit tests | Browser tests |
|---|---|---|
| Live builder | `designer/__tests__/placeholder-draft.test.ts` (uses `real-kitchen.ts`, an anonymised real kitchen) | `e2e/studio.spec.ts` ("the placeholder AI design lays out…", about 1 min) |
| 3D view | `designer/__tests__/stage3d.test.ts` | `e2e/studio.spec.ts` (checks that the 3D view appears) |
| Cabinet ends | `designer/__tests__/ends.test.ts` (the real kitchen's ends as before, layout changes, older designs, saving and opening again) | `e2e/studio.spec.ts` (an older design's ends set when asked) |
| Room drawing, runs, appliances | `designer/__tests__/editor.test.ts`, `layout.test.ts`, `room-master-copy.test.ts` | `e2e/room-drawing.spec.ts`, `e2e/rough-layout.spec.ts` |
| Design choices | `intake/__tests__/engine.test.ts`, `design-inputs.test.ts` (each room's design inputs as the studio read them before) | `e2e/intake.spec.ts` |
| Saving to the shared database, autosave | `src/app/sync/__tests__/job-sync.test.ts` | |
| Studio flow and test-job files | | `e2e/studio.spec.ts` |
| Office screens | | `e2e/office.spec.ts` |
| Core geometry, units, checks | `src/core/__tests__/` | |
| Catalog, shop settings, projects, platform | each one's `__tests__/` | |
| Parked AI layout builder | `ai-design/__tests__/engine.test.ts`, `split.test.ts` | |
| The live site's pages | | `e2e-static/deployed-site.spec.ts` (`npm run test:static`) |

Timings (measured 2026-11-10, one run in a cloud session): lint 3.9 s, typecheck 7.1 s, boundaries 1.2 s, vendor-names 0.2 s, unit tests 3.3 s, build 15.2 s, static-site test 7.9 s, browser tests 185.5 s (63 tests). Which to run when: `CLAUDE.md` "Checks".

## Unresolved (not authority until settled)
- **The fix for Open doors restarting** (PR #57, DECISIONS PR-57a) was not checked against the live autosave. It is tested in code (`stage3d.test.ts`), but no one has yet confirmed it on the live site with the real autosave running.
- **The filler beside a hood, up to 1 1/2"** (`placeholder-draft.json` `fill.flank_filler_max`, PR-57b): PROPOSED by a session, not approved by the owner.
- **Bathroom vanity choices** (`placeholder-draft.json` `cabinets.bath`, PR-57c): PROPOSED by a session, not approved by the owner.
- **The fridge panel as the Tall filler** (AD-6) and **the fridge's rough 70" height** (OA-4): PROPOSED.
- **Copying layout fixes into the parked AI layout builder:** deferred (DECISIONS 2026-11-11). Not to be picked up unless the owner asks. (Pull request #59 had already copied the round-2 hood fixes in, including the PROPOSED 1 1/2" filler as `draft-rules.json` `clearances.flank_filler_max`.)
- **Cabinet ends:** which side is "left" (END-1, PROPOSED); corner cabinets' ends (END-2, not set); an island's waterfall or detailed sides (END-3).
- **Cabinet ends, limitation:** the saved design doesn't record whether an end was set by the rule or by a person, so a person's choice equal to the rule's earlier value would be worked out again after a layout change. No screen sets ends yet; END-4 lists what manual end editing needs first.
- Every other open question: `docs/DECISIONS.md` "Open questions".

## Which doc answers what
| Question | Read |
|---|---|
| What the owner wants (authority) | `docs/BUILD_SPEC.md`, the sections for your area, and the owner amendments OA-1 to OA-10 at the top |
| What has been decided | `docs/DECISIONS.md`: search it for your topic. The latest **explicitly approved** decision that applies governs. A PROPOSED choice or an open question never overrides an approved rule, however recent. If it's unclear which decision applies, or whether it was approved, flag it (an open question, and say so in your report) rather than guess. The "Open questions" section is at the end. |
| Which module may import which | `docs/ARCHITECTURE.md` "Dependency rules" |
| Who owns which table | `docs/DATA_MODEL.md` |
| Build order and phases | `docs/BUILD_PLAN.md` |
| Screens and look | `docs/ux/UX_BRIEF.md` (UI work only) |
| The CAD file format | `docs/cabinet-vision/FORMAT_REFERENCE.md` once Phase 0 writes it; for now `docs/cabinet-vision/DESK_RESEARCH.md` (background only) |
| Commands, setup, adding a module | `docs/DEVELOPMENT.md` |
| What a module does today | its `README.md` |
