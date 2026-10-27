# Phase 0b: Cabinet Vision discovery

Read CLAUDE.md, docs/BUILD_SPEC.md (sections 5.8, 8 and 11), docs/ARCHITECTURE.md and everything in samples/cabinet-vision/.

**Do not write app code.** Use small throwaway scripts in a scratch folder if they help you read the files, but don't commit them.

Write `docs/cabinet-vision/FORMAT_REFERENCE.md`, the ORDX format reference that the writer and reader will be built from. Cover:

1. **File structure:** what the ORDX file is (text, XML, other), its overall layout, and every element and field seen across the samples, with an example of each.
2. **Units and precision:** which length units ORDX uses, how many decimals, and how fractions appear. This feeds the base-unit decision (DECISIONS U-1).
3. **Rooms, walls and placement:**
   - how rooms and walls are described;
   - how a cabinet's position along a wall, its elevation and its rotation are expressed;
   - how islands and angled walls appear;
   - what is missing (spec Q2).
4. **Items:**
   - how a cabinet is identified (catalog entry name/ID);
   - width, height and depth;
   - options and selections (door style, finish, hardware, construction);
   - modifications (scribe, end panel…);
   - fillers, panels and moldings.
5. **Job-level data:** job and customer fields, and job-level defaults versus per-item overrides.
6. **IDs:** which IDs are stable across exports, and whether a renamed item keeps its ID. Use the v1/v2 pair.
7. **The catalog export:** its format, how entries and their parameters are listed, and what changes would look like between syncs.
8. **Engineered output:** the format of the cutlist and reports, and how each part traces back to a cabinet in the ORDX. This is the independent verification path (P7).
9. **Read-back options (spec Q3, and automatic per BUILD_SPEC OA-6):** ORDX export, the SQL database, or reports. For each, list what it contains, how fragile it is, and what access it needs (for example a helper app on the shop's computer). Give a recommendation for the owner to choose.
10. **Variation:** anything that differs between jobs or Cabinet Vision versions in ways that matter.
11. **Open questions:** everything the samples don't explain. List these; never guess them.

Use only the samples. Where a statement comes from general knowledge rather than the samples, label it "unverified".

Then add the open questions to docs/DECISIONS.md under a "Phase 0 findings" heading. Finally, report back in plain English:
- what looks easy;
- what looks risky;
- the read-back recommendation;
- the questions only the owner or a Cabinet Vision expert can answer.
