# Phase 1b: Core and the master copy

Read CLAUDE.md, docs/BUILD_SPEC.md (sections 4, 5.2, 6 and 7), docs/ARCHITECTURE.md and docs/DECISIONS.md. **Stop and ask if U-1 (base unit) or A-1 (angle convention) is still open.**

Work only in `src/core/`.

1. Zod schemas for the master copy (spec section 6): Job, Room, Wall (openings, obstacles), PlacedItem, selections and modifications, plus `schema_version`. Everything is strict: an unknown or missing field is an error, never a default.
2. The base unit:
   - integer-only length type;
   - conversions to and from display units, and to and from the units the adapters need, which refuse inexact conversions rather than rounding silently;
   - tests for every increment the shop uses.
3. The angle convention, documented in `src/core/README.md`, with helpers and tests.
4. Selection resolution (item, then room, then job) returning the resolved values. Missing required values are reported, not filled in.
5. The check interface (check id, layer, `run(masterCopy, context) → Issue[]`, severity block/warn, plain-language message, item or wall reference) and a function that runs a list of checks.
6. The first layout checks for the proof slice:
   - items overlap;
   - an item extends past a wall end;
   - an item blocks an opening.
7. Two or three hand-written example master copies for the proof slice (one wall of base cabinets, one door style), saved as test fixtures. They must pass every check. One deliberately broken copy for each check must fail it.

Core must stay pure: no database, network, React, clock or randomness. Run `npm run check` and report what was run.
