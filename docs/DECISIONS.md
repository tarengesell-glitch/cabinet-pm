# Decisions

Add new decisions at the bottom of the right list, with the date. Only the owner (Taren) decides. A PROPOSED item stays open until the owner says yes.

## Decided

### 2026-10-27: The Cabinet Vision build spec (`docs/BUILD_SPEC.md` v0.1)
- The platform does sales, intake and design: room capture, selections, an AI first draft, and a visual editor. Cabinet Vision engineers the job and makes the production files. This replaces the 2026-10-24 plan, where Mozaik was the design tool.
- Our master copy is the single source of truth for every job (P1).
- Cabinet Vision is the first CAD target. We write its ORDX import file, read the engineered job back, and compare.
- The product stays independent of any CAD vendor. Only the Cabinet Vision adapter knows it exists (P2, G4).
- Size ranges, options, mappings and design rules are data (P3).
- Fail closed: anything missing, unmapped, out of range or ambiguous blocks the step (P4, G5).
- AI writes the translators and drafts designs. Translation itself is ordinary, repeatable code (P5).
- The editor draws only from the master copy (P6).
- At least one read-back check uses Cabinet Vision's own engineered output (P7).
- Build order: test translation first. Phases 0 and 1 end in a go/no-go before the editor and AI are built.
- Out of scope for v1: engineering cabinets, CNC output, cutlists, machining, a Mozaik push, and photorealistic rendering.
- Mozaik may come back later as read-back only (Phase 8).

### 2026-10-27: Owner answers and the fuller workflow (BUILD_SPEC "Owner amendments" OA-1 to OA-10)
- **A shop is a manufacturing partner: today one Hutterite colony; possibly more colonies later.** In-house only: "We will not sell this software to other people, it will only be used for our own sales." (Answers S-0.)
- The tool's job is to remove manual drawing. Rough inputs, the visual intake and the design rules produce a well-designed room, with **photorealistic viewing** and **live pricing**. No parametrics, construction or sheet optimization.
- **Photorealistic viewing is in scope.** This reverses the spec's section 2.
- The push to Cabinet Vision happens once, and only when four things are true:
  - the client has signed off the design;
  - the appliances are confirmed;
  - the site is measured;
  - the job is paid.
- The library sync and the job read-back are **automatic loops**.
- In scope:
  - the conversation tally (email, texts, meeting transcripts);
  - automated client reminders with a deadline ticker;
  - automatic ordering of materials, doors, counters, handles and add-ons when a job goes into production.

### 2026-11-05: The design software outline (BUILD_SPEC OA-11 to OA-16, `docs/intake/design-workflow.md`)
- The designer's home screen shows the next three days of meetings, with "Add a client" and "Add a task". Tasks belong to clients.
- Customer intake can be started by the designer and finished by the customer (self-intake link), or the other way round.
- Uploaded plans and hand sketches are read into rooms, which the designer confirms. They are rough inputs; the site measure still confirms them.
- Room types, room shapes and cabinet positions come from libraries that designers can add to. Cabinet layouts come from a fixed premade list.
- The room-by-room loop is where the tool recommends a design; the client accepts or declines each change. No price is shown there.
- A live 3D view from layout onwards; an AI-made photorealistic render on demand (answers part of R-1).
- The estimate is exact, from formulas, and first appears in the fine-tune step.
- Interior materials: white melamine (basic), woodgrain Prestige maple melamine (upgraded), melamine matching the exterior (premium). Answers IK-6.
- Exterior materials come from Tafisa's melamine line; handles from Richelieu.
- The database is the Supabase project "closet-builder" in the Gesell/Gray organization. How it is used is open (CL-1).

### 2026-11-05: The editor shows intent; Cabinet Vision makes it accurate (BUILD_SPEC OA-17)
- We are **not** building a construction-accurate editor. The editor shows the design, the intent and the look, and lets the designer change every setting of every cabinet.
- How a cabinet is drawn being built (part thicknesses, joinery, reveals, gaps, exact interior details) only has to look right.
- The translator (the "interpreter") sends an ORDX file **plus UCS parameter values** to Cabinet Vision. Cabinet Vision and our UCSs turn that into the accurate construction drawing.
- So the master copy holds **exact settings**, and those are what get translated and compared on read-back. The picture is a likeness drawn from them (P6 still holds: the picture draws only from the master copy).
- Our UCS library (`cabinet-vision-ucs` repo) becomes part of the translation: each editor setting that Cabinet Vision has no built-in parameter for needs a UCS that reads it.

### 2026-11-05: What stays exact (answers EX-1)
- **Exact:** where each cabinet sits on its wall, its overall width, height and depth, and every setting the designer chooses.
- **A likeness only:** how the box is drawn being built.

### 2026-11-05: The interpreter knows our UCS rules (BUILD_SPEC OA-18)
- The platform knows what each of our UCSs does. The editor shows the effect, the interpreter sends only the trigger setting, and the read-back checks the effect appeared.
- Each UCS's effects are written in its header in the `cabinet-vision-ucs` repo. The platform reads them from there and never retypes them.
- The storage is PROPOSED (ARCHITECTURE "Knowing what our UCSs do"): automatic effects in the catalog, linked to UCSs by the adapter.

### 2026-11-05: Designers can't change values a UCS sets (answers UE-1)
- A value set by one of our UCSs is shown in the editor as automatic and can't be edited. A different value needs a new setting and a UCS change.

### 2026-11-05: The design flow, first price, drawers, payment and re-measuring (BUILD_SPEC OA-19)
- **The flow:**
  1. intake of the client's wishes and the designs they like (the image selector, `docs/intake/kitchen.md`, plus usage questions and must-haves);
  2. **the walls are drawn** (rough: from the uploaded plans or sketch, or drawn by hand). This comes after the designs they like, "so that they're excited";
  3. the fixed appliance and fixture locations are marked;
  4. the runs of cabinets are marked;
  5. **the AI draws a first pass**: "here's what we recommend building";
  6. the client and designer fine-tune it, cabinet by cabinet.
- **Dropped:** the room shape picker, the cabinet-position presets and the preset layouts (OA-13), and the "grows as designers add to it" libraries. The old closet-builder step-by-step flow is no longer the model.
- **The first price** appears with the AI's first pass, and stays live from then on.
- **Drawers:** whatever drawer level the customer picked in the intake is the default the AI uses. Nothing defaults to Maximum.
- **"Paid" for the push means paid in full.** The gate has one condition, "paid in full", set by a person (or later by a payment connector). Nothing else depends on how payment works, so deposits or a payment tool can be added later without changes elsewhere. Answers PAY-1.
- **After the site measure:** if the price changes by **less than 5%**, the client pays the original signed price. Trivial design changes don't need a new sign-off.
- **Trivial (answers MC-1):** "just realigning and resizing existing cabinets without any change to the functionality." The platform compares the signed version with the measured version. No new sign-off, and the signed price stands, when all of these hold:
  - the price changes by less than 5% (up or down);
  - no item of any kind is added or removed, **fillers and end panels included**;
  - nothing the client chose changes: door style, colours, materials, handles and their position, inserts, the drawer level, doors vs drawers, or the number of drawers in a cabinet;
  - each cabinet's width changes by no more than 3", and its height and depth don't change, **except** a "to the ceiling" height that only follows the measured ceiling: that is trivial as long as the cabinets get no more than 3" shorter (answers H-3, 2026-11-05).

  Otherwise the client sees the changes and signs again (with the new price if it moved 5% or more). Either way the client gets a short "here's what changed after measuring" note. The 5%, the 3" and the list are data (`remeasure_rules`).
- **Home screen and tasks stay, as a placeholder.** Low priority; built late.
- **Everything else on the Design Software page stands** (answers WF-1): the client form, the self-intake link, plan reading, the 3D view, cabinet-by-cabinet editing after the AI pass, the AI render, formula pricing.

### 2026-11-05: Pricing reference, cabinet heights, a new database (BUILD_SPEC OA-20)
- **The old pricing spreadsheet is a logic reference only.** Its figures are never hard-coded or depended on, and the spreadsheet isn't stored in the repo. Its logic and the requirements it implies are in `docs/pricing/legacy-pricing-logic.md`. Answers PR-1.
- **Cabinet heights:** 7', 8', 9', 10', or a number of inches below the ceiling, where that number depends on the crown moulding type. The heights and each crown's allowance are data. Answers H-1 and IK-4 (our reading of "inches down" is H-2).
- **A new Supabase project** for this tool, in the Canada region (as decided earlier). It is not created yet: it's created when the build starts (Phase 1a), with your OK. closet-builder's project is left alone. Answers CL-1.

### 2026-11-05: Heights to the ceiling, partners, install, counters (answers H-2, PRC-1 to PRC-3)
- **Cabinet heights:** the standard options are 7', 8', 9' and 10', each with its own parameters (data). **"To the ceiling"** uses the room's actual ceiling height minus the chosen crown moulding's allowance (for example, a 3" crown means 3" below the ceiling). It is not rounded to one of the standard heights.
- **Builder and design partners** are priced here, with their discounts. Each partner's price level is data; a job's partner sets its level. Retail clients have their own level.
- **Keep install, rounding and taxes** (as data: install rule, rounding per room, GST/PST by province).
- **Counters are designed into the job and priced from our own rates** (by material, edge and size, as catalog data), not typed in per job.
- The spreadsheet's apparent mistakes are noted and left for later.

### Still in force from the earlier plan (2026-10-24 and before)
- Modular monolith with enforced module boundaries; one owner per table; data, not code.
- Fail loudly: alerts persist until a person resolves them with a note. Never show false success.
- Money in integer cents (CAD).
- A permission framework from day one. Owner, admin and designer roles first; more roles are added as data.
- Full change history and audit log from day one. History is never overwritten.
- Hosting: Netlify + Supabase (Canada region).
- CRM and accounting are swappable connectors (later).
- Quotes freeze the prices and tax used.
- Multi-user locking: one editor at a time, others read-only. Locks release when the session drops; managers can override.

### Replaced on 2026-10-27
- ~~(spec section 2, P6) The editor is dimensionally exact; what the designer sees is exactly what will be translated.~~ The settings are exact and are what's translated; the construction drawing in the editor is a likeness (OA-17, 2026-11-05).
- ~~Mozaik is the design source of truth; this tool can't write to Mozaik.~~ The master copy is the source of truth; Cabinet Vision is the target.
- ~~Lengths in integer mm.~~ The base unit is open (U-1).
- ~~Mozaik data captured from the SketchUp export and job files; manual upload, then a Windows desktop uploader; upload matches confirmed by a person.~~ Dropped. A Mozaik reader may come back in Phase 8, from its SQLite export.
- ~~Guided Mozaik drawing.~~ Replaced by the AI draft and the visual editor.
- ~~Build starts with the quick quote, after the foundation.~~ Build starts with Phase 0 discovery and the Phase 1 proof slice.
- ~~(OA-13, 2026-11-05) Room setup from room shape, cabinet-position and preset-layout libraries that grow as designers add to them.~~ Replaced the same day by OA-19: intake → appliances and fixtures → cabinet runs → AI first pass.
- ~~(2026-10-24) closet-builder is kept for reference only; no code is carried over.~~ Reopened as C-1, because a visual editor and room capture are back in scope.

## Open questions

### Needed before Phase 1 code
- **CV-1 Where does Cabinet Vision run, and who works in it?** Is it on a computer at the colony, operated by colony staff, or with you? How reliable is that computer's internet? The automatic library sync and read-back (OA-6) need something running on that computer. Phase 0's samples also come from there.
- **U-1 Base unit (spec Q5).** The intake uses feet (7', 8', 10'), so the shop looks imperial. Options:
  - 1/64 inch (the spec's candidate);
  - millimetres (the earlier plan);
  - nanometres (closet-builder). It holds both mm and 1/64 inch exactly (1/64 in = 396,875 nm), but area numbers grow too large.

  Recommendation: decide once Phase 0 shows which units and precision ORDX uses.
- **A-1 Angle convention.** Proposed for Phase 1: degrees as integers or fixed decimals, counter-clockwise, measured from the room's +X axis. Confirm or change.
- **PROPOSED:**
  - the `core/` / `platform/` split, and the master copy stored as versioned JSON with the named writers (ARCHITECTURE);
  - dimension provenance and appliance placements added to the master copy (DATA_MODEL "core").

### From the owner's workflow (2026-10-27)
- **CV-2 More than one colony.** Will each colony have its own Cabinet Vision library (so its own catalog mappings), or will all colonies share one library? And does each have its own prices?
- ~~**SM-1**~~ Answered 2026-11-05 (OA-19): see the trivial-change rule in decisions.
- ~~**PAY-1**~~ Answered 2026-11-05: paid in full, with no other dependencies.
- **R-1 Photorealistic.** A realistic 3D view the client can turn in the browser, or rendered still images (slower, more realistic), or both? This is the most expensive part of the editor; the answer sets its cost.
- **DL-1 Deadline ticker.** How is the "everything in by" date worked out? From the colony's production lead time (as data) and the promised delivery date? Who sets the delivery date?
- **PO-1 Automatic ordering.** Who places the orders (you or the colony), which suppliers, and how does each take orders (email, portal, API)? Do "materials" mean sheet goods sent to the colony?
- **MSG-1 Channels.** Which email (Gmail?), which texting service, and which meeting tool's transcripts? Do reminders go by text, email or both?
- **IK-1 to IK-7** Kitchen intake questions, in `docs/intake/kitchen.md`.

### From the design software outline (2026-11-05)
Details and context for each: `docs/intake/design-workflow.md`.
- ~~**EX-1**~~ Answered 2026-11-05 (see decisions).
- **CV-3 How UCS values get into Cabinet Vision (owner's expectation recorded, to be proven in Phase 0).** UCSs run on every rebuild, so they will apply automatically to an imported job (this is documented in the `cabinet-vision-ucs` repo). The owner expects the imported cabinet settings to trigger the UCS rules "as long as there's some sort of relation". Phase 0 finds out which relation works:
  - **Route A:** the ORDX file sets our `MT_` settings directly on each cabinet, and the UCSs read them;
  - **Route B:** the ORDX file can't carry them, so each UCS works the setting out from something ORDX does carry (for example the cabinet's catalog entry, its sizes or its material).

  Whichever works is proven with the before-and-after sample pair, and each setting's route is recorded in its mapping. Until then, nothing assumes either route (CLAUDE.md rule 9).
- ~~**UE-1**~~ Answered 2026-11-05 (see decisions).
- **UE-2 The first UCS export: not needed yet.** We're designing the workflow and architecture now. The export is needed only when the adapter's effect links are built against real UCSs (Phase 1d at the earliest, if the proof slice uses any UCS; otherwise Phase 3).
- ~~**MC-1**~~, ~~**MD-1**~~, ~~**WF-1**~~ Answered 2026-11-05 (see decisions).
- ~~**PR-1**~~, ~~**H-1**~~, ~~**CL-1**~~ Answered 2026-11-05 (OA-20).
- ~~**H-2**~~ Answered 2026-11-05 (see decisions).
- ~~**H-3**~~ Answered 2026-11-05: a "to the ceiling" height that only follows the measured ceiling is trivial if the price moves less than 5% and the cabinets get no more than 3" shorter.

### From the old pricing spreadsheet (2026-11-05)
Details: `docs/pricing/legacy-pricing-logic.md`.
- ~~**PRC-1**~~, ~~**PRC-2**~~, ~~**PRC-3**~~ Answered 2026-11-05 (see decisions).

### From the spec (section 11)
- **S-1** Which Cabinet Vision versions do target shops run, and does ORDX behave the same across them?
- **S-2** How much room placement and elevation detail does ORDX keep on import?
- **S-3** Which read-back source is most reliable: ORDX export, SQL database, or reports? If it's the database or files on the shop's computer, do we need a small helper app there?
- **S-4** Is there a Cabinet Vision or Cyncly partner program with documentation or support? Licensing and terms must be reviewed before Phase 3.
- **S-5** = U-1.
- **S-6** Which design rules block and which only warn, by default?

### Earlier plan features: keep, defer or drop?
- **E-1 Room states.** Mostly answered by OA-5: the push needs sign-off, appliances, measure and payment, tracked as separate gate conditions. Still open: are these tracked per room or per job? Is invoicing tracked here or only in accounting?
- ~~E-2 Client approval~~ Answered (OA-5): the client signs off before the push.
- **E-3 Pricing structure.** The earlier plan had price lists per manufacturing partner, chosen by region, plus tax per province. The spec says pricing reads from the catalog. Are regions and partners still part of this?
- ~~E-4 Site measuring~~ Answered (OA-5): the site must be measured before the push.
- **E-5** Answered for the visual intake, appliances, the conversation tally, reminders and ordering (all in). Still open: CRM (or do the reminders replace it?) and accounting triggers. Live pricing probably replaces the separate quick quote; confirm.
- **E-6 Locking unit:** job or room?

### Carried over from closet-builder
- **C-1 Reuse.** closet-builder already has pieces that match parts of this spec:
  - room geometry, including "floating walls" for islands and peninsulas (its A-21);
  - a 3D view and a wall elevation view;
  - integer-unit handling;
  - a cabinetry knowledge base (`docs/cabinetry-intelligence/`) that already separates hard design limits from preferences. That is close to the spec's block-vs-warn design rules, and could seed Shop Settings.

  Should any of these be ported (Phase 4–6), or should this project start clean?
- **C-2 Look and feel.** closet-builder has an owner-approved design system (Geist and Newsreader fonts, its own tokens, 2026-10-07/08). `docs/ux/UX_BRIEF.md` has a different palette. Which one applies here?
- **C-3** closet-builder decisions (its `docs/architecture.md` Part 1, 2026-10-08 to 10-10) that differ from this plan. Each needs a yes or no here:
  - **Price list:** one price list, priced per inch by cabinet type, plus % adjustments and flat add-ons (A-1, A-7). Compare E-3.
  - ~~Shops~~ Answered (OA-1): a Hutterite colony. Is it the same Biesse shop closet-builder was written for?
  - **Freezing:** frozen at full payment, except changes that don't touch the design; truly frozen once files are sent to the shop (A-8, A-9, A-11). The spec freezes at "sent".
  - **Payments:** a deposit to commit and the balance before production, through a third-party payment tool (A-8). Compare PAY-1.
  - **Customer change approval:** text and email with a tap to approve, daily reminders, and a decline notifies the designer (A-10). This fits OA-8's reminders and SM-1.
  - **Batches:** a customer can have several batches over the years, each priced as its own project (A-4). Is a job a batch?
  - **Prospects:** customers can sign up themselves and do their own intake (A-3, A-15, A-16).

### Still open from earlier
- CRM choice; QuickBooks vs Xero.
- What clients see, if a client portal is built.
- Tech stack confirmation (ARCHITECTURE "Stack").
- The Comparer's strict tolerance: the values, and whether they are per dimension or per item.
