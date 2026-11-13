# Project map

Navigation: what actually runs, where each rule's data and code live, and which tests cover it. **What the rules are, whether they are approved and what is open** is in `docs/REQUIREMENTS.md`. Keep this map current: update it when what runs, where a rule lives or where a test lives changes. Last checked 2026-11-12.

## The live path: a saved job to the 3D view
1. **Saved job:** the shared database (Supabase, `src/app/sync/`) or a test-job file (`src/app/studio/test-data.ts`, the studio's "Test data" menu). Each room's master copy is kept by `src/modules/designer/ui/placeholder-store.ts`.
2. **Studio:** `src/app/studio/Studio.tsx` steps through the design choices (`intake` module), the room drawing, the design step and Customize. Each room's choices are read by intake's `roomDesignInputs` when a later step needs them, and handed on unchanged as the designer's `DesignChoices`: the room kind to the drawing, the whole record to the design step and to Customize.
3. **Design step:** `src/app/studio/AiStep.tsx` calls `draftRoom` (`designer/ui/placeholder-store.ts`), which runs the **placeholder builder**: `src/modules/designer/model/placeholder-draft.ts`. No AI is called; the animation is a placeholder. The design choices reach it as the designer's `DesignChoices`, which `designer/model/choices.ts` checks before use (`layoutPreferences` for the builder, `islandPanelsOf` for the 3D view). A new choice is added to intake's data, `roomDesignInputs` (`intake/model/design-inputs.ts`), `DesignChoices` and the code that uses it; the studio doesn't change.
4. **Into the master copy:** `designer/model/cabinets.ts` (`placeholderItems`) turns the layout into placed items, saved as an AI draft version.
5. **Customize and 3D:** `designer/ui/Customize.tsx` reads the placed items (`cabinetViews` in `cabinets.ts`) and draws them in `designer/ui/Stage3D.tsx` (three.js); each cabinet's doors, drawers and shelves are laid out by `designer/model/fronts.ts`. The Cabinet tab is `designer/ui/CabinetEditor.tsx` (sections edited by `model/sections.ts`); every change goes through `editItems` in `cabinets.ts`, also used by the 3D view's drag handles. Its starting view and the fixed views (each wall, the island) are in `designer/ui/camera-views.ts`.

**Each piece of a change goes in the module that owns it.** For layout or 3D problems in the studio that is the designer (steps 3 to 5); for design choices it is `intake`, for cabinet sizes `catalog`, for shop rules `shop-settings`, for clients `projects`, for saving and sync the app's `src/app/sync/` (see "Where the rules live"). A change that needs several modules changes each of them, through their contracts (root `CLAUDE.md` "Working across modules").

## Placeholder, parked and unused code
| Code | Status |
|---|---|
| `src/modules/designer/model/placeholder-draft.ts` and `data/placeholder-draft.json` | **Live.** A placeholder for the AI design step (no AI), but it is what the app runs. |
| The AI step's animation (`src/app/studio/AiStep.tsx`) | Placeholder: no AI model is called. |
| `src/modules/ai-design/model/engine/` and `data/draft-rules.json` (the "AI layout builder") | **Parked.** Nothing in the app calls `draftLayout`; only its own tests. Don't change it or copy fixes into it unless the owner asks (DECISIONS 2026-11-11). Kept, not deleted. |
| `src/modules/ai-design/model/brief.ts` (the design brief) | Built and tested; not yet used by the app (no AI model is called). |
| Today and Tasks (`src/app/(office)/`) | Placeholders with demo data. |
| Clients (`src/app/(office)/clients/`) | **Live.** Real clients from the shared database (`customers`, owned by `projects`, `src/modules/projects/model/customers.ts`), then the demo clients, labelled. New client adds a real one. Jobs aren't records of their own yet: a client's ID is the job's key. |
| Modules with only a `CLAUDE.md`, README and `contract.ts` (approvals, comparer, purchasing, site-measure, client-messaging, job-notes, test-library, visual-library, appliances) | Not built yet. |
| The CAD adapter (`src/adapters/cabinet-vision/`) | Not built yet; waits for Phase 0 samples. |

## Where the rules live (the data and code the app reads)
| Rule | File | Notes |
|---|---|---|
| Cabinet types, sizes, steps, options | `src/modules/catalog/data/catalog-v2.json` (current; `catalog-v1.json` kept as published) | The one source of cabinet sizes. A change is a new version file. |
| Shop design rules (PREF-, HARD-, CB-) | `src/modules/shop-settings/data/design-rules.json`, `design-rule-checks.json` | |
| Wall thickness, standard openings, door swing | `src/modules/designer/data/standard-sizes.json` | |
| The library choices Customize offers for bases, and the drawer inserts | `src/modules/designer/data/library-presets.json`, `drawer-inserts.json`, read by `designer/model/library.ts` | Each choice is a catalog cabinet with its front and interior. |
| How a sink, dishwasher or fridge can look (colours, bowls, faucet, fronts) | `src/modules/designer/data/appliance-looks.json`, read by `designer/model/appliance-looks.ts` | Saved on each appliance placement. Colours are for drawing. |
| Door sizes drawn in 3D (pair over 20", stacked over 48") | design rule CB-FACT-16 in `shop-settings/data/design-rules.json`; the standard top drawer in `placeholder-draft.json` "visual" | Laid out by `designer/model/fronts.ts`. |
| Run depths, appliance widths, island sizes, what goes over a range, bathroom fixture sets | `src/modules/designer/data/layout-rules.json` | The 24" base depth appears twice here (`run_depths.base` and `room_sets.kitchen.base_depth`). |
| **Live builder:** which catalog part goes where, drawer levels, widths, hood and fridge clearances, fridge panel, island back panel, bathroom vanities | `src/modules/designer/data/placeholder-draft.json` | Has PROPOSED entries (see "Unresolved"). |
| Cabinet ends (`end_left` / `end_right`): the rule's values and which cabinet types get them | `placeholder-draft.json` "ends"; worked out only in `src/modules/designer/model/ends.ts` | Saved on each cabinet; the 3D view draws only what is saved. Left/right PROPOSED (END-1); corner cabinets unset (END-2). |
| Placeholder heights and 3D drawing sizes (where uppers start, the fridge's rough height, toe kick, counter, rough appliance shapes) | `placeholder-draft.json` "visual" | **Not all visual only:** `upper_bottom` and `appliances.fridge_height` also set saved cabinet heights and elevations (`REQUIREMENTS.md` "Known discrepancies"). A few small drawing sizes are in `Stage3D.tsx` itself. |
| Design choices (the intake questions and options) | `src/modules/intake/data/intake-v1.json` | The answers are the only saved copy. How other steps read them: `src/modules/intake/model/design-inputs.ts` (`roomDesignInputs`); add a new choice the builder or 3D view needs there. |
| Room and layout checks (walls, runs, items) | `src/core/layout/` | |
| Units (1/64 inch) | `src/core/units.ts` | |
| Module dependency table | `tools/architecture.cjs` (from `docs/ARCHITECTURE.md`) | |

**Duplicates to know about:** `ai-design/data/draft-rules.json` repeats the live builder's clearances, fridge height, part choices and drawer levels. Its drawer levels already differ from the live builder's (for "Maximum": the live builder uses all 3-drawer banks; the parked one uses two banks of 4, then more banks). For anything the app shows, `placeholder-draft.json` is the one that counts. Merging the two waits for the owner's call.

## Tests
| Area | Unit tests | Browser tests |
|---|---|---|
| Live builder | `designer/__tests__/placeholder-draft.test.ts` (uses `real-kitchen.ts`, an anonymised real kitchen) | `e2e/studio.spec.ts` ("the placeholder AI design lays out…", under 1 min) |
| Customize's cabinet edits, sections, drag maths | `designer/__tests__/cabinet-edits.test.ts`, `fronts.test.ts` | `e2e/studio.spec.ts` (the Cabinet tab and the sink's looks), `e2e/cabinet-handles.spec.ts` (dragging a handle) |
| 3D view | `designer/__tests__/stage3d.test.ts`, `camera-views.test.ts` (the fixed views' framing) | `e2e/studio.spec.ts` (checks that the 3D view appears); pictures by eye: `npm run views` (`views/capture.spec.ts`, docs/DEVELOPMENT.md) |
| Cabinet ends | `designer/__tests__/ends.test.ts` (the real kitchen's ends as before, layout changes, older designs, saving and opening again, ends set by hand) | `e2e/studio.spec.ts` (an older design's ends set when asked) |
| Room drawing, runs, appliances | `designer/__tests__/editor.test.ts`, `layout.test.ts`, `room-master-copy.test.ts` | `e2e/room-drawing.spec.ts`, `e2e/rough-layout.spec.ts` |
| Design choices | `intake/__tests__/engine.test.ts`, `design-inputs.test.ts` (each room's design inputs as the studio read them before), `design-inputs-status.test.ts`; the designer's checks of them: `designer/__tests__/choices.test.ts` | `e2e/intake.spec.ts` |
| Saving to the shared database, autosave, clashes | `src/app/sync/__tests__/job-sync.test.ts` (against the store's MOCKED in-memory database; live-database access depends on the session's environment, `docs/DEVELOPMENT.md`) | |
| Clients (real records) | `src/modules/projects/__tests__/customers.test.ts` | `e2e/office.spec.ts` (demo clients only: browser tests run without the database) |
| Database rules (versions, audit, staff only) | tested against the real project in rolled-back transactions (`src/platform/README.md`), not in `npm run test` | |
| Studio flow and test-job files | | `e2e/studio.spec.ts` |
| Office screens | | `e2e/office.spec.ts` |
| Core geometry, units, checks | `src/core/__tests__/` | |
| Catalog, shop settings, projects, platform | each one's `__tests__/` | |
| Parked AI layout builder | `ai-design/__tests__/engine.test.ts`, `split.test.ts` | |
| The live site's pages | | `e2e-static/deployed-site.spec.ts` (`npm run test:static`) |

**Seen once, not reproduced:** `e2e/studio.spec.ts` "every room is in the room bar…" failed once in a full `npm run check` (a Claude cloud session, 2026-11-11): after a room-bar click the intake still showed the main bath's question, not the kitchen's review. It then passed 6 times on its own and in every later full run. Cause unknown; if it fails again, look at the room switch, not the test's timing.

Commands and timings: `docs/DEVELOPMENT.md`. Which to run when: root `CLAUDE.md` "Checks".

## Unresolved
Open questions and PROPOSED choices are listed with each topic in `docs/REQUIREMENTS.md`, and in full in `docs/DECISIONS.md` "Open questions". Data entries marked PROPOSED in the files above stay PROPOSED until the owner approves them.

## Which doc answers what
Each doc has one job. Link to it rather than repeating it.

| Question | Read |
|---|---|
| The rules every session follows, checks to run, workflow | root `CLAUDE.md` |
| What runs, where code, data and tests live | this file |
| **The current requirement** on a topic, its approval and build status, what blocks at each stage | `docs/REQUIREMENTS.md` |
| The owner's original spec and amendments OA-n (authority, as amended) | `docs/BUILD_SPEC.md` |
| Why something was decided, the owner's words, the open questions, history | `docs/DECISIONS.md` (search for the ID or date) |
| Which module may import which | `docs/ARCHITECTURE.md` "Dependency rules" |
| Who owns which table | `docs/DATA_MODEL.md` |
| Build order and phases | `docs/BUILD_PLAN.md` |
| Commands, setup, adding a module | `docs/DEVELOPMENT.md` |
| What a module does today, in detail | its `README.md` |
| Screens and look | `docs/ux/UX_BRIEF.md` (UI work only) |
| The kitchen design-choice outline and its open questions | `docs/intake/kitchen.md` |
| The CAD file format | `docs/cabinet-vision/FORMAT_REFERENCE.md` once Phase 0 writes it; for now `docs/cabinet-vision/DESK_RESEARCH.md` (background only) |
