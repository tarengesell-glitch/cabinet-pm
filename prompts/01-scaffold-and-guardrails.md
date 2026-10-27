# Phase 1a: Scaffold and guardrails

Read CLAUDE.md and everything in docs/. This is a new project with no app code.

Task: scaffold the repository and its guardrails only. No features.

1. Propose the stack from docs/ARCHITECTURE.md "Stack" and **wait for my confirmation before installing anything**.
2. Create the folder structure in docs/ARCHITECTURE.md "Folders":
   - `src/app`, `src/core`, `src/platform`;
   - each module under `src/modules/`;
   - `src/adapters/cabinet-vision`.

   Each module and adapter gets a `CLAUDE.md` (from `modules/_TEMPLATE/CLAUDE.md`, filled in from the spec's module map), a `README.md` and an empty `contract.ts`.
3. Enforce the dependency table in docs/ARCHITECTURE.md "Dependency rules" with eslint-plugin-boundaries **and** dependency-cruiser, including "contracts only". For each kind of rule, add a deliberately failing example and show that it fails. Then remove the example.
4. Add the other checks, each proven the same way (break it on purpose, show it fails, restore it):
   - the vendor-name check (the words and folders are in ARCHITECTURE);
   - no AI SDK imports in `src/core` or `src/adapters`;
   - no `Date.now`, `new Date()` without an argument, or `Math.random` in `src/core` or `src/adapters/*/writer` and `reader`;
   - no empty catch blocks anywhere.
5. Set up Vitest and Playwright with one trivial test each.
6. Add `npm run check`: lint, type-check, boundary checks, vendor-name check, tests. There is no CI yet, so this is the gate before every push.
7. Write docs/DEVELOPMENT.md: how to run, test, and add a module or an adapter.

Report exactly what you ran and the results, including each deliberate break.
