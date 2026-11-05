# Development

## Setup
- Node 22 or later.
- `npm install`
- Playwright needs a Chromium. Install it once with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_PATH` to an existing Chromium binary.

## Everyday commands
| Command | What it does |
|---|---|
| `npm run dev` | Runs the app at http://localhost:3000 |
| `npm run check` | **The gate before every push** (there is no CI). It runs each command below in order and stops at the first failure. |
| `npm run lint` | ESLint. Also enforces the dependency table and contracts-only (eslint-plugin-boundaries), core purity, no AI SDKs in core or adapters, no clock or randomness in core and adapter writers/readers, and no empty `catch` anywhere. |
| `npm run typecheck` | TypeScript, strict. |
| `npm run boundaries` | dependency-cruiser: a second, independent check of the dependency table, contracts-only, core's allowed packages and no AI SDKs in core or adapters. |
| `npm run vendor-names` | Fails if the CAD vendor's name or file format appears outside the allowed folders (CLAUDE.md rule 3). |
| `npm run test` | Vitest unit and golden tests (`src/**/__tests__/*.test.ts`). |
| `npm run test:e2e` | Playwright UI tests (`e2e/`), on an iPad landscape viewport. Starts its own dev server on port 3100 (`E2E_PORT` changes it). |

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
