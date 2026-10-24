Read CLAUDE.md and everything in docs/. This is a new, empty project.

Task: scaffold the repository and its guardrails only. No features.

1. Propose the stack from docs/ARCHITECTURE.md and wait for my confirmation before installing anything.
2. Create the folder structure in ARCHITECTURE.md with empty modules, each with CLAUDE.md (from modules/_TEMPLATE), README.md and an empty contract.ts.
3. Set up TypeScript strict, ESLint with eslint-plugin-boundaries, and dependency-cruiser so cross-module imports fail. Add a deliberately failing example test proving the rule works, then remove it.
4. Add an ESLint rule or check that flags empty catch blocks.
5. Set up Vitest and Playwright with one trivial test each.
6. Add a CI script: lint, type-check, boundary check, tests.
7. Write docs/DEVELOPMENT.md: how to run, test, and add a module.

Report exactly what you ran and the results.
