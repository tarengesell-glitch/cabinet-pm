# Current requirements

What the product must do **today**, by topic. Each line says whether the owner approved it and whether it is built, and points to its evidence: a `BUILD_SPEC.md` section, an owner amendment (OA-n), or a dated entry in `DECISIONS.md`, where the owner's words and the reasons are kept. **Start here, not in the history.** Open `DECISIONS.md` only to read the evidence for one line, or to record something new.

Last checked against `DECISIONS.md` and the code: 2026-11-11.

## How to read this

**Which rule wins** (owner, 2026-11-11; DECISIONS "How current requirements are read"):
1. **An explicitly approved owner decision governs its topic.** Approved means the owner said yes: `BUILD_SPEC.md`'s text, its owner amendments (OA-n), and entries under DECISIONS "Decided" that are not marked PROPOSED. A decision entry also records how a session built it (files, mechanisms); that detail describes the build, it doesn't add business requirements.
2. **A later approved decision that changes an earlier requirement replaces it, including the spec's own text.** The spec is not edited; what was replaced is listed under "Spec text that has been replaced" below. "BUILD_SPEC wins" means it wins over the documents derived from it (ARCHITECTURE, DATA_MODEL, BUILD_PLAN, module READMEs, prompts), over PROPOSED choices and over code. It does not win over the owner's own later, approved change to it.
3. **PROPOSED choices, open questions and code are never authority.** Code that is built is not approved because it runs. An approved requirement stays required while it is unbuilt.
4. **If this file disagrees with the evidence it cites, the evidence wins.** Fix this file in the same pull request and say so in the report.
5. **If it's unclear** which approved decision applies, whether something was approved, or two approved decisions conflict: don't choose. Add an open question to DECISIONS and flag it in the report.

**Status words.** Approval: **Approved** (with its evidence), **PROPOSED** (a session's choice waiting for the owner), **Open** (no answer yet; the question's ID is in DECISIONS "Open questions"). Build: **Built**, **Partly built**, **Placeholder** (runs, but stands in for the real thing), **Parked** (kept, not run), **Not built**. The two are independent: PROPOSED-but-built and Approved-but-not-built are both normal.

**Keeping it current.** Root `CLAUDE.md` "Docs": a changed requirement is edited in place here, with its evidence added to DECISIONS in the same pull request (never two current versions); a change in build status updates its status here.

## Spec text that has been replaced

| `BUILD_SPEC.md` says | Now | Evidence |
|---|---|---|
| §2: photorealistic rendering out of scope | In scope; its form is open (R-1) | OA-3 |
| §6: base unit "a candidate is 1/64 inch" | 1/64 inch; mm input rounds to the nearest 1/64" with the original kept | DECISIONS 2026-11-05, U-1, U-2 |
| §6 Wall: `height` | No wall height; walls are as high as the ceiling | OA-11 |
| OA-11: new walls start 5 1/2" thick | Interior walls start 4 1/2" thick | DECISIONS 2026-11-09 "Owner updates after trying a real job (round 3)" |
| §6 PlacedItem: "room coordinates for islands" | Every item stands on a wall; islands and peninsulas stand on floating walls | DECISIONS 2026-11-05 round 8; 2026-11-08 "Placed cabinets in the master copy" |
| §3: selections (stage 3) after room capture (stage 2) | The design choices (intake) come before the room drawing | DECISIONS 2026-11-08 "Visual intake", "The design studio" |
| §7: design rules "warn by default; each shop can promote rules to block" | Each confirmed rule says what the design tool does: won't let it be drawn, error to fix, or suggestion. Whether they stop the push is open (see "What blocks at each stage") | DECISIONS 2026-11-08 "Design rules reviewed" (S-6) |

**Departures that are only PROPOSED** (the spec still governs until the owner says yes): `rotation` is not stored on placed items; `offset` is measured on the wall's centre line (both DECISIONS 2026-11-08 "Placed cabinets in the master copy").

## Requirements by topic

### Scope
- In-house only; a shop is a manufacturing partner (one colony now, more possible). **Approved** (OA-1). Built for one shop.
- Remove manual drawing: rough inputs + design choices + design rules → a well-designed room with photorealistic viewing and live pricing; no parametrics, construction or sheet optimization. **Approved** (OA-2, OA-3). Partly built: the 3D view is not photorealistic (R-1 open); pricing not built.
- The platform doesn't engineer cabinets; construction comes from the shop's library. **Approved** (§1; DECISIONS 2026-11-08 "Design rules reviewed").
- Only the CAD adapter knows the vendor. **Approved** (P2, G4). Enforced by `npm run vendor-names`.

### Units and geometry
- Lengths are whole 1/64"; inexact conversions refused, except mm input, which rounds with the original kept. **Approved** (U-1, U-2). Built (`src/core/units.ts`).
- Angles in hundredths of a degree, counter-clockwise from +X. **Approved** (A-1). Built (`src/core/README.md`).
- Slanted walls: corners rounded to 1/64", typed length kept. **Approved** (2026-11-05). Built.
- Money in integer cents, CAD. **Approved** (earlier plan). Not built (no prices yet).

### Room drawing (designer)
- Our own drawing tool, drawn only from the master copy. **Approved** (2026-11-05). Built.
- Measurements shown and typed are inside measurements; walls stored by centre line. **Approved** (2026-11-09 round 3). Built.
- Standard sizes: interior wall 4 1/2"; door 32" × 80"; window 36" × 48", sill 36"; passthrough 32" × 80". **Approved** (2026-11-05, 2026-11-09 round 3). Built (`designer/data/standard-sizes.json`).
- Two size states, unmeasured and confirmed; only Confirm confirms. **Approved** (2026-11-05 round 7). Built.
- Floating walls for islands and peninsulas. **Approved** (2026-11-05 round 8). Built.
- Drawing and navigation behaviour (handles, snaps, zoom, box select, lettered walls, door handing). **Approved** (2026-11-05 rounds 2 to 9). Built; the details are in `src/modules/designer/README.md`.
- A new door's starting hinge and swing. **PROPOSED** (`standard-sizes.json`).
- Standing rules: research the common apps before building drawing or navigation behaviour; "less is more", no information "just in case". **Approved** (2026-11-05 rounds 4 and 5; top of `docs/ux/UX_BRIEF.md`).

### Rough layout: cabinet runs and appliances
- Run types; run ends 3" clear of openings; corner snaps at 0, 3, 6, 9"; island depths 15/27/36/42/48"; appliance tray widths; 9" minimum run. **Approved** (2026-11-06, 2026-11-07). Built (`designer/data/layout-rules.json`).
- Over a range or cooktop the designer chooses Cabinet, Appliance hood or Millwork hood; a new one starts as Appliance hood. **Approved** (2026-11-09 round 3). Built.
- Bathroom-type rooms: toilet, vanity sinks, tub, shower; runs start base-only and 21" deep. **Approved** (2026-11-09 round 3). Built. Other room types use the kitchen's tray: **PROPOSED**.
- New-run defaults (base + upper, 24" deep; island 72" × 36"). **PROPOSED** (Open questions, "rough layout").
- The hood matches the width of the range under it. **Assumed, still to confirm** (2026-11-06).
- Corner cabinet legs on the drawing. **Open** (AD-4).

### Design choices (intake)
- The intake comes first, one question at a time with pictures; the room drawing opens only when every room's choices are finished. **Approved** (2026-11-08). Built.
- The questions and options. **Approved** as listed in `docs/intake/kitchen.md` "Owner decisions from the prototype". Built (`intake/data/intake-v1.json`). Colour, hardware and insert lists are samples (IK-3, IK-7, IK-9 open); pictures are placeholders.
- No "not sure" answer; "not applicable" only for a follow-up ruled out by an earlier answer, with a reason. **Approved** (2026-11-09 "AI design brief: owner answers"). Built in the design brief (`ai-design`, not used by the app yet).
- The intake's rough ceiling height starts the room drawing. **Approved** (IK-17). Built.
- Design choices → catalog options (door style, colours, handles): no mapping yet, so drafts show them as missing. **Approved** (2026-11-09 "AI designer: how it works"). Built as findings.
- Intake permissions reuse `room.view` / `room.edit`. **PROPOSED** (IK-16 open).

### Catalog
- 50 cabinet types from the shop's library; templates that stretch; 1/16" width step; standard sizes; smallest widths 8" / 12"; door, drawer, shelf, end, filler and sink-base rules; three door styles. **Approved** (2026-11-07 "The cabinet catalog"). Built (`catalog/data/catalog-v1.json`).
- Size limits other than the standard size. **Open** (CAT-1): only the standard size passes.
- Hinge side. **Open** (CAT-2).
- One item for door-count variants; stable option codes; unknown values stored as unknown. **PROPOSED**.

### Design rules (shop-settings)
- 82 carried-over rules: 78 confirmed, 4 declined; construction values come from the shop's library. **Approved** (2026-11-08 "Design rules reviewed"). Data in `shop-settings/data/design-rules.json`.
- Each confirmed rule's design-tool behaviour: won't let it be drawn (9), error to fix (2), suggestion (36). **Approved** (same entry). Partly built: five rules are checked (`shop-settings/README.md`); "won't let it be drawn" rules must refuse the edit.
- Islands line up within 5" (DR-1), fixtures fully in line (DR-2), walkway measurement (DR-4). **Approved** (2026-11-09). DR-3 (how close counts as centred): **Open**.

### The live layout builder (the design step)
The app's design step runs the designer's **placeholder** builder (no AI): **Approved** as a placeholder (2026-11-08) and as the builder layout fixes go into (2026-11-11). Its numbers are in `designer/data/placeholder-draft.json`.
- Corners where runs overlap: the L-shaped corner cabinet, never a blind corner. **Approved** (2026-11-10). Built.
- Every island gets a finished back panel. **Approved** (2026-11-10). Built.
- The dishwasher touches the sink base, flush, under one counter (HARD-005). **Approved** (2026-11-10). Built.
- **Hood:** 2" clear each side of an appliance or millwork hood, also when the range stands in a run of its own; the uppers either side are one width (PREF-019, HARD-007); the base beside the range lines up with the upper above. **Approved** (2026-11-10, both rounds). Built (`clearances.hood_side`).
- **Hood:** when one side is a little longer, up to 1 1/2" becomes a filler at that side's far end. **PROPOSED** (PR-57b). Built (`fill.flank_filler_max`).
- The cabinet over a fridge comes down to 2" above it. **Approved** (2026-11-10). Built. The fridge's 70" height is a rough placeholder until its spec is confirmed: **PROPOSED** (OA-4).
- A 3/4" panel, 26" deep, full height, each side of every fridge, never skipped. **Approved** (2026-11-10). Built. Which shop part: **Open** (AD-6; PROPOSED the Tall filler).
- Widths are made to fit: equal cabinets on the 1/16" step, a filler only where a space is too narrow. **Approved** (2026-11-10 round 2). Built. The 36" largest width is the prototype's placeholder value.
- Nothing is skipped: an appliance that runs into a corner or past its run is drawn and reported. **Approved** (2026-11-10). Built.
- Applied finished ends to the floor; toe kicks in the door colour; one counter per stretch; island panels as chosen. **Approved** (2026-11-10 round 2). Built.
- Uppers and talls reach the client's cabinet height, never above the ceiling. **Approved** (2026-11-08 "Placeholder office screens…", Customize feedback, "Heights"). Built.
- Where uppers start (54" above the floor). **Open** (AD-5). Placeholder value: `visual.upper_bottom`. **Despite the "visual" label, it sets saved cabinet positions** (see "Known discrepancies").
- Bathroom vanity choices. **PROPOSED** (PR-57c). Built.
- Drawer levels per intake choice. Prototype recipe, not a reviewed rule.
- The builder and the 3D view read the design choices through one interpretation (intake `roomChoices`, checked by the designer); the intake's answers stay the only copy. An unknown drawer level stops the design step and "Re-draft this run" with the reason and replaces nothing; an unknown island panel is drawn plain only as a stand-in, with a notice. **Approved** (2026-11-11 "Design choices read in one place"). Built. Other unknown choice values: **Open** (DC-1). A "choices changed since drafting" notice: deferred.

### Cabinet ends
- Unfinished beside a wall or cabinet (filler at every wall); applied finished at an open end by default; finished by request. **Approved** (2026-11-07, CB-FACT-10). Built (`designer/model/ends.ts`).
- One saved end decision per cabinet; the 3D view draws only what is saved. **Approved** (2026-11-11). Built. How ends are worked out again after a layout change is a session's mechanism with a recorded limitation (END-4).
- Which side is left. **PROPOSED** (END-1). Corner cabinets' ends: **Open** (END-2). Island waterfall or detailed sides: **Open** (END-3). Manual end editing: requirements recorded in END-4, partly PROPOSED; not built.

### 3D view and Customize
- Draws only from the master copy (P6); a visual approximation is acceptable (§5.5). **Approved**. Built.
- Camera moves, zooms toward the pointer and turns around a double-clicked point; brighter light; a selected cabinet gets a gold tint and tight outline. **Approved** (2026-11-10). Built.
- Open doors stays open while the autosave runs. **Approved** (2026-11-10 round 2). Built. **Owner-confirmed on the live app, 2026-11-11** (the owner's own use; there is no automated test with the real autosave; PR-57a).
- Customize: change a cabinet's type within its kind or its width (the neighbour gives or takes); approve one or all after a confirmation. **Approved** (2026-11-08). Built. What this approval counts for: see "What blocks at each stage".
- The Checks tab runs the catalog's checks only. **PROPOSED** (2026-11-08).

### AI design
- How it is to work: code builds several valid layouts; Claude chooses and explains and never types coordinates; the client's choices, walls, openings and runs are fixed; appliances move at most 24" along their own wall, each move explained; runs on Netlify Functions. **Approved** (2026-11-09 "AI designer: how it works"). Not built: the AI layout builder is **Parked** (2026-11-11; don't change it unless the owner asks); the design brief is built but unused.
- A moved appliance needs no separate client re-confirmation (AD-2); walkway trade-offs (PRIN-005, PRIN-013). **Approved** (2026-11-09).
- The ranking ladder, the judge's instructions, the "Not reviewed by AI" label. **PROPOSED**.

### Saving, sync and history
- Live work does not live only in a browser: the shared database is Supabase **cabinet-pm**, Canada. **Approved** (2026-11-09, AD-3). Built.
- Saving is automatic, with no Save button; the header says "Saved to the shared database", "Saving…" or "Not saved" in red with the reason. **Approved** (2026-11-09 step 0b). Built (`src/app/sync/`).
- When two people save the same job, the first save lands; the second is stopped and nothing is overwritten; on reopening they choose the saved copy or keep theirs as another version. **Approved** (step 0b). Built.
- Versions are never changed, every write is audited, alerts close only with a note. **Approved** (earlier plan; step 0a). Built in the database.
- Without the database settings (a developer's machine, the automated tests), work stays in the browser and says so. **Approved** (step 0b). Built.
- The browser keeps a working copy kept in step with the database; a failed save retries every second or two, shown in red, without a database alert; the standalone `/intake` and `/rooms/preview` stay browser-only. **PROPOSED** (step 0b). Built.
- One editor at a time. **Approved** (earlier plan). Not built; per job or per room is **Open** (E-6).
- A sent version is frozen. **Approved**. Not built (nothing is sent yet).

### Sign-in, permissions and clients
- Sign-in by an emailed link, invited staff only. **Approved** (step 0b). Built.
- Every screen and action checks `can(user, permission)`; roles are data. **Approved**. Built (`src/platform/permissions/roles.json`). The permission names given to each role (`room.*`, `client.*`): **PROPOSED**.
- Real client details live only in the database, never in code, commits, pull requests or docs. **Approved** (2026-11-09 "Real clients live only in the database"). Built.
- Clients lists real clients from the database, then labelled demo clients; New client refuses a missing name, an unreachable primary contact, or an invalid email or phone; no one can delete a client; every change is audited. **Approved** (same entry). Built (`projects/model/customers.ts`, `src/app/(office)/clients/`). A household with one or two contacts: **PROPOSED**.
- Today and Tasks. **Placeholder** on demo data (2026-11-08).
- Jobs as records of their own. Not built (BUILD_PLAN 7a): a client's ID is the job's key.

### Pricing
- Live pricing in the design; priced from the catalog and the master copy, never from the CAD program; prices per running inch, kept apart from cabinet data; fillers at a fixed price; quotes freeze prices and tax. **Approved** (OA-3, §5.3, §5.10, 2026-11-07, earlier plan). Not built: the screen says pricing is not connected.
- Pricing structure (regions, partners, adjustments). **Open** (E-3, C-3).

### Approval, the push and the CAD file
- A designer approves an AI draft before it can pass the gate. **Approved** (§5.7, §7). Not built.
- The push happens once, when the client has signed off, the appliances are confirmed, the site is measured and the job is paid; on confirmed dimensions and appliance specs. **Approved** (OA-4, OA-5). Not built.
- The writer is deterministic and refuses missing or unmapped values; every translator fix comes with a golden test. **Approved** (§5.8, §8). Not built: waits for the Phase 0 samples (CV-3 to CV-12 open).
- Library sync and read-back run automatically. **Approved** (OA-6). Not built (CV-1 open).

## What blocks at each stage

Only what approved decisions say. "Not decided" items must be flagged, not invented; until decided, a session keeps today's behaviour and says so.

| Stage | Blocks (approved) | Shown, doesn't block (approved) | Not decided |
|---|---|---|---|
| **Editing a draft** (room drawing, Customize) | An inexact length (other than mm); walls on top of each other or shrunk to nothing; a change that cuts through a door or window (2026-11-05). The placed-item checks: on a wall, fits along it, under the ceiling, clear of openings, no overlaps (2026-11-08 "Placed cabinets"). The 9 "won't let it be drawn" design rules (2026-11-08). A new client with no name, no reachable contact, or an invalid email or phone (2026-11-09). | Unmeasured sizes (pastel red). "Error to fix" rules (2) and suggestions (36, the running list of preferences that could be improved) (2026-11-08). The sink-off-centre notice (2026-11-07). A save that fails or clashes is shown in red; a clash stops saving until the person chooses (2026-11-09). | What an "error to fix" stops besides being shown (the code gives these rules severity *block*). |
| **Previewing** (the design step and the 3D view) | A drawer level that isn't one of its options stops the design step and re-drafting a run, with the reason (2026-11-11). | A missing design choice is said in the design's notes, never filled in (2026-11-08). Nothing is skipped: problems are drawn and reported (2026-11-10). Unmapped choices (door style…) show as missing (2026-11-09). A draft that fails checks is returned with its issues listed, not hidden (§5.7). An island panel the 3D view can't show is drawn plain as a stand-in, and Customize says so (2026-11-11). | Which problems stop a preview from being made at all, rather than drawn with a note. Today's builder refuses some rooms (for example a cabinet height below where uppers start); that is code, not policy. |
| **Approving** | The designer's approval of an AI draft is required before the gate (§5.7, §7). The client signs off an exact version (OA-5). | — | Whether a designer may approve (one cabinet, or "approve all") while blocking findings are open; whether Customize's approve is the gate's designer approval; sign-off per room or per job (E-1); re-signing after the site measure changes sizes (SM-1). |
| **Pricing** | Prices come only from the catalog and the master copy; a missing or unmapped price fails closed with a reason, never a default (P4, rule 7). | — | Whether live pricing shows a partial total with the missing items listed, or no total; the pricing structure (E-3, C-3); the drawer level's cost (IK-14). |
| **Exporting** (the push) | Every §7 layer: layout, buildability (size out of range, missing required selection, invalid option), translation preflight (no or stale mapping, an empty required field), designer approval. The four push conditions (OA-5). Every value the design depends on confirmed (OA-4; DATA_MODEL "core"). The writer refuses any missing or unmapped value (§5.8). Items outside tested coverage go to manual review (§9). | — | Whether design-rule findings ("error to fix", suggestions) stop the push (S-6 was answered for the design tool only); the measuring tolerance (SM-1); what "paid" means (PAY-1); the CAD questions CV-1 to CV-12. |

## Known discrepancies (docs or data vs. code)
- **`placeholder-draft.json` "visual" is not drawing-only.** Its note says "never sent to the shop", but `upper_bottom` and `appliances.fridge_height` set the saved elevation and height of uppers, hoods and the cabinet over the fridge (`designer/model/placeholder-draft.ts`, `upperTopOf` in `model/cabinets.ts`). Both values are placeholders with open questions (AD-5, OA-4). The data note is unchanged (documentation-only pull request); correct it with the next designer code change.
- **No screen writes alerts yet.** The alerts table and `raiseAlert` exist (`src/platform/README.md`), but no app code calls `raiseAlert`: failures are shown on screen, not left as alerts (hard rule 7). Known gap, not a decision.
