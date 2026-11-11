# Development

## Setup
- Node 22 or later.
- `npm install`
- Playwright needs a Chromium. Install it once with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_PATH` to an existing Chromium binary.

## Trying the app
`npm run dev`, then open http://localhost:3000 (Today), http://localhost:3000/studio (the design studio), http://localhost:3000/intake or http://localhost:3000/rooms/preview (the standalone previews).

**Where work is kept.** The live site saves the studio's work to the shared database (Supabase, `src/app/sync/README.md`) for signed-in staff. A build without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (for example a developer's machine or the automated tests) keeps work in the browser only and says so on screen, with a labelled preview user. The standalone `/intake` and `/rooms/preview` pages are browser-only everywhere. Saving and sync rules are tested with the store's MOCKED in-memory database (`src/app/sync/__tests__/job-sync.test.ts`). Whether a session can also reach the live database depends on its environment: on 2026-11-09 the app's live connection couldn't be reached from a Claude cloud session (network policy), while the Supabase connector could. If yours can't, the owner checks the fix on the live site.

Stop `npm run dev` (Control + C) before `npm run check`: Next.js allows only one dev server per project folder, and the browser tests start their own.

## Everyday commands
| Command | What it does |
|---|---|
| `npm run dev` | Runs the app at http://localhost:3000 |
| `npm run check` | **The gate before merging** (there is no CI). Run it on the final code. It runs each command below in order and stops at the first failure. |
| `npm run lint` | ESLint. Also enforces the dependency table and contracts-only (eslint-plugin-boundaries), core purity, no AI SDKs in core or adapters, no clock or randomness in core and adapter writers/readers, and no empty `catch` anywhere. |
| `npm run typecheck` | TypeScript, strict. |
| `npm run boundaries` | dependency-cruiser: a second, independent check of the dependency table, contracts-only, core's allowed packages and no AI SDKs in core or adapters. |
| `npm run vendor-names` | Fails if the CAD vendor's name or file format appears outside the allowed folders (CLAUDE.md rule 3). |
| `npm run test` | Vitest unit and golden tests (`src/**/__tests__/*.test.ts`). |
| `npm run build` | The production build, exactly as Netlify runs it: plain web pages in `out/`. In the gate so a merge never breaks the live site. |
| `npm run test:static` | Serves `out/` the way Netlify does (`scripts/serve-static.mjs`) and opens the pages in a browser (`e2e-static/`). Catches a build that would show "Page not found" on the live site. |
| `npm run test:e2e` | Playwright UI tests (`e2e/`), on an iPad landscape viewport. Starts its own dev server on port 3100 (`E2E_PORT` changes it). |
| `npm run views` | Pictures of the 3D view, for looking at by eye; **not** part of `npm run check` (below). |

## Which checks when
Measured 2026-11-10 in a cloud session, one run each:

| Check | Time | During a change | Before merging |
|---|---|---|---|
| `lint` | 3.9 s | yes | yes |
| `typecheck` | 7.1 s | yes | yes |
| `boundaries` | 1.2 s | yes | yes |
| `vendor-names` | 0.2 s | yes | yes |
| `test` (unit, 357 tests) | 3.3 s | yes | yes |
| `build` | 15.2 s | when you change pages, routing or config | yes |
| `test:static` | 7.9 s | with `build` | yes |
| `test:e2e` (63 browser tests) | 185.5 s | only the file for the screen you changed: `npx playwright test e2e/studio.spec.ts` (studio, about 1 min alone); `room-drawing`, `rough-layout`, `intake`, `office` likewise | yes |

`npm run check` runs all of them in order (about 3 min 40 s). When to run what, and when to break a check on purpose: root `CLAUDE.md` "Checks".

## Pictures of the 3D view (`npm run views`)
Takes pictures of the anonymised real kitchen (`src/modules/designer/__tests__/real-kitchen.ts`) at fixed camera views: `overall` (the 3D view's starting view), each room wall straight on (`wall-A` to `wall-E`) and `island` (from behind one end). They land in `test-results/views/<view>.png`. About 2½ minutes; starts its own dev server on port 3200 (`VIEWS_PORT` changes it).

- **When:** after a change to the layout, the cabinet ends or the 3D drawing, to see the result without dragging the camera; and to compare before and after (run it on both, the file names stay the same). Look for the hood's clear space and equal uppers, finished ends (end panels to the floor), toe kicks, and one counter per stretch.
- **What it checks:** that each view draws without a problem, and that two captures of the same view are identical (the same framing every time). It checks no measurement: the unit tests do (`designer/__tests__/`).
- **How:** `views/capture.spec.ts` leaves the drawn room (no cabinets) in the browser and opens the test page `/test/views/?view=…`, which runs the real design step (`draftRoom`) and shows that view (`RoomViews`). The 3D view sets `data-view` on its box once a frame at that view is drawn, so nothing waits a set time. The camera positions are in `src/modules/designer/ui/camera-views.ts`. On the live site the test page shows only a note.

## Where the rules live
- `tools/architecture.cjs`: the dependency table from `docs/ARCHITECTURE.md`, written as data. Both `eslint.config.js` and `.dependency-cruiser.cjs` read it, so the two checks can't drift apart. Change it only when ARCHITECTURE changes, and never to make a violation pass.
- `scripts/check-vendor-names.mjs`: the vendor-name check and its allowlist.

## Imports
- Use the `@/` alias for `src/` (for example `@/core/index`, `@/modules/catalog/contract`).
- Another module is imported only through its `contract.ts`. The app may also import a module's `ui/index.ts(x)`.
- Inside a module, files import each other freely.

## Adding a module
1. Add the module to `docs/ARCHITECTURE.md`: the folder list and the dependency table. Add its tables to `docs/DATA_MODEL.md`. This needs the owner's yes in `docs/DECISIONS.md`.
2. Add its name to `MODULES` in `tools/architecture.cjs`, and its row to `MODULE_RULES`.
3. Create `src/modules/<name>/` with:
   - `CLAUDE.md`, copied from `modules/_TEMPLATE/CLAUDE.md` and filled in;
   - `README.md`;
   - `contract.ts`.
4. If other modules may import it, add its name to their rows in `tools/architecture.cjs`.
5. Prove the new rules work:
   - add a file that imports something the module may not import;
   - run `npm run lint` and `npm run boundaries`, and confirm both fail;
   - delete the file and run `npm run check`.

## Adding an adapter (another CAD target)
1. Create `src/adapters/<name>/` with `CLAUDE.md`, `README.md` and `contract.ts`.
   - Every adapter gets the same rules automatically: core, platform and the catalog contract only, no AI SDKs.
   - A `writer/` or `reader/` folder (or `writer.ts` / `reader.ts`) also gets the no-clock, no-randomness rule.
2. Create `golden/<name>/` and `samples/<name>/`.
3. The vendor-name check only knows about the current vendor. A new vendor's name needs its own pattern and allowed folders in `scripts/check-vendor-names.mjs`, recorded in `docs/DECISIONS.md`.

## Adding a connector
Create `src/connectors/<name>/contract.ts`. Connectors may import core and platform only. A mocked connector must say it is mocked in code and in the UI.

## The live site (Netlify)
- `netlify.toml` tells Netlify how to build: `npm run build` on Node 22, then publish the `out/` folder as plain web pages. No Next.js server is involved.
- Netlify deploys from `main`, so every merge into `main` updates the live site (root `CLAUDE.md` "Branches").
- The pages are public to anyone with the address, and their code reaches every visitor's browser (so no real client details in code). The data is not in the pages: it is in the shared database, readable only by signed-in staff (`src/platform/README.md`). Netlify's settings hold the database address and publishable key.
