# Phase 1d: Cabinet Vision adapter, minimal writer (proof slice)

Read CLAUDE.md, docs/BUILD_SPEC.md (sections 5.8, 7, 8 and 9), docs/ARCHITECTURE.md, docs/cabinet-vision/FORMAT_REFERENCE.md, src/core/README.md and the catalog's contract.

Work only in `src/adapters/cabinet-vision/` and `golden/cabinet-vision/`.

1. Mapping data for the proof-slice catalog items and options → the shop's Cabinet Vision entries and parameters. Each mapping records the catalog version it was checked against, and its status is "unverified" until the owner confirms it.
2. Preflight checks (Core's check interface):
   - item or option has no mapping;
   - mapping is unverified or stale;
   - a field ORDX requires is empty.
3. The ORDX writer: a pure function (master copy + mapping snapshot) → file bytes.
   - It refuses to write, and lists every reason, if anything is missing or unmapped.
   - It never defaults a value.
   - Same input gives byte-identical output.
4. Golden cases in `golden/cabinet-vision/proof-slice/<case>/`: the master copy (from Core's fixtures), the expected ORDX, and a placeholder note for the engineered result that the owner will add after importing. A test runs every case and fails on any byte difference.
5. Write `golden/cabinet-vision/README.md`: step by step, in plain English, how the owner imports each file into Cabinet Vision, what to check, and how to record the result. Add an empty results table with columns case, imported OK?, manual fixes needed, notes.
6. Anything in the format reference marked as an open question that the writer needs: stop and ask. Don't guess.

Run `npm run check` and report what was run, including one deliberate break: change a mapping and show the golden test fail.
