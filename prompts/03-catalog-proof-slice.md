# Phase 1c: Catalog, minimal (proof slice)

Read CLAUDE.md, docs/BUILD_SPEC.md (sections 5.3 and 7), docs/DATA_MODEL.md "catalog", docs/cabinet-vision/FORMAT_REFERENCE.md (for what the shop actually has; don't name the vendor in this module) and src/core/README.md.

Work only in `src/modules/catalog/`.

1. Schemas and seed data for **only the proof-slice items**: base cabinets in one door style. Include:
   - a stable ID;
   - width, height and depth ranges and increments;
   - supported options and required selections;
   - allowed modifications.

   Every value is labelled with its source: owner-stated (with date), taken from the shop's catalog export, or unknown. **Never make up a range or increment.** If a value is unknown, stop and list it for me.
2. A catalog version number, so a master copy records which version it was checked against.
3. Buildability checks using Core's check interface:
   - dimension out of range or off-increment;
   - invalid option combination;
   - required selection missing;
   - item not available to this shop.

   Each check has a passing and a failing test.
4. Expose the items and checks through `contract.ts` only.

Database tables can wait: keep the seed as versioned data files if that's simpler, and say which you chose. Run `npm run check` and report.
