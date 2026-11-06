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

### 2026-11-05: Base unit and room drawing
- **U-1 answered: the base unit is 1/64 inch.** Every length is stored as a whole number of 1/64ths. Feet, inches and mm appear only on screen and in the adapters, and a conversion that is not exact is refused. Decided by the owner before Phase 0, so room drawing can be built now.
  - Consequence: whole millimetres are not exact in 1/64 inch (1 mm ≈ 2.52/64 in). See U-2 below for how metric values are handled.
- **Room drawing (walls, doors, windows) is our own tool on react-konva**, inside the Designer module, drawn only from the master copy. Ideas for wall joins and openings may be ported from MIT projects, with attribution. No whole open-source editor is embedded, because each keeps its own room data in decimal numbers (P1, P6, rule 11). Research, checked on 2026-11-05:
  - pascalorg/editor: MIT, about 25k stars, React and react-three-fiber, under a year old. Kept as a reference and a possible 3D viewer later.
  - cvdlab/react-planner (MIT, about 1.5k stars, last push 2024) and furnishup/blueprint3d (MIT, about 2k stars, last push 2021): unmaintained.
  - laanlabs/openPlan3D: MIT, SvelteKit, so not our stack.
  - ekymo/homeRoughEditor: MIT, plain JavaScript; a reference for its wall and opening code.
  - konvajs/konva and react-konva: MIT, about 15k and 6k stars, actively maintained. Chosen.
  - Rejected: tldraw (commercial licence key), Sweet Home 3D (GPL, Java), kitchen-planner-3d (AGPL).
- **U-2 answered: metric values are rounded to the nearest 1/64 inch.** This is an owner exception to "refuse inexact conversions", for millimetre input only (appliance spec sheets, and ORDX if it uses mm). The most a value can move is 1/128 inch (about 0.2 mm). A tie rounds away from zero, so the result is always the same. The original mm value is kept next to the rounded one, so it can always be traced. Every other inexact conversion is still refused.
- **The stack in ARCHITECTURE "Stack" is confirmed** (the owner said "proceed" after being told the scaffold locks it in). Each part is installed only when the first code needs it.
- **A-1 answered: the angle convention.** Angles are whole numbers of hundredths of a degree (22.5° is 2250), counter-clockwise from the room's +X axis. Room coordinates have Y pointing up, as on paper, so 90° points up the plan. Stored angles run from 0 to 35999. Details are in `src/core/README.md`.
- **Slanted walls: corners are rounded.** A wall typed as a length and an angle that isn't 0°, 90°, 180° or 270° rarely ends on a 1/64" mark. Its corner is rounded to the nearest 1/64", and the typed length is kept with the wall (`entered_length`), as with the mm rule. The stored wall stays within about 1/90" of the typed length. Walls at 0°, 90°, 180° and 270° are exact.
- **Sureness tags (provenance) approved.** Every wall length, wall thickness, opening and obstacle dimension, and ceiling height records `rough` (from the client or intake), `measured` (entered on site) or `verified`. Entering a value never verifies it. This was PROPOSED in DATA_MODEL "core".
- **The room preview keeps its draft in the browser** (`localStorage`) until the platform master copy store exists. The screen says "saved in this browser only", and any storage failure is shown in red. Owner asked for something to try (2026-11-05).
- **Room drawing feedback (owner, 2026-11-05; BUILD_SPEC OA-11):**
  - Walls have no height of their own; the ceiling height is used. The "too tall" check now compares against the ceiling.
  - Standard sizes, recorded as data in `src/modules/designer/data/standard-sizes.json` (to move to Shop Settings when it exists):
    - wall thickness 5 1/2";
    - door 32" × 80";
    - window 36" wide × 48" high, sill 36";
    - passthrough 32" × 80".
  - A new room asks only for its name and ceiling height.
  - Doors, windows and passthroughs drop in at the standard size with one tap, centred roughly where tapped. They are then dragged or typed to size. This replaces "every size must be typed before it is created".
  - Standard sizes and the starting ceiling height are **rough**. A typed size becomes **measured**. A dragged position goes back to **rough**. Verifying is still a separate button.
- **Room drawing feedback, round 2 (owner, 2026-11-05):**
  - The scroll wheel zooms the plan, and a sideways scroll (or Shift + scroll) moves it left and right. Fit, + and − buttons sit on the plan.
  - Rough walls are drawn in a soft pastel red instead of a bright one. Labels stay a darker red so they can be read.
  - Doors, windows and passthroughs are placed the way other room planners do it (researched: IKEA's planner, Floorplanner, and an open-source editor's door tool). A ghost of the item follows the cursor and snaps onto the nearest wall, showing its distance to each end of the wall. The cursor changes, and a click places it exactly where the ghost was. Off a wall the cursor shows "not allowed" and a click does nothing.
- **Room drawing feedback, round 3 (owner, 2026-11-05):**
  - **Wall handles.** A selected wall shows a handle at each end and one in the middle, the way other planners do it (researched: Houzz Floor Planner, Coohom, Revit, ArchiCAD).
    - Dragging an end moves that corner, and every wall joined there follows. The corner snaps to other corners, whole inches, and to line up square with its walls.
    - Dragging the middle slides the wall sideways; it keeps its length and its joined walls stretch.
    - The move shows live while dragging and is saved on release as one undo step. Escape cancels it.
    - A wall whose length changes goes back to rough, with a notice.
    - A move that would shrink a wall to nothing, or put walls on top of each other, is refused.
  - **No walls on top of each other.** Drawing or typing a wall back over an existing one is refused with a reason. The owner's screenshot showed two walls doubled back on each other, which looked like odd shading.
  - **Problem walls get a dashed red outline**, not a translucent red glow (the glow looked like shading). Corners are mitred only where exactly two walls meet; anywhere else they get square ends.
  - **Notices float over the top of the plan** and can be dismissed. The plan no longer jumps down when one appears.
- **Room drawing feedback, round 4 (owner, 2026-11-05):**
  - **Less is more** (standing rule, recorded at the top of `docs/ux/UX_BRIEF.md`): always reduce clutter, and never add information "just in case". So the ?, ✎ and ✓ markers were removed from wall labels and status tags; the plan shows status by colour and the panel in words. No key or legend was added.
  - **Lengths are shown in inches and fractions of an inch only**, for example `68 11/16"`, never feet. Approximate lengths (slanted walls) are rounded to the nearest 1/16" and marked ≈. Feet are still accepted when typing.
  - **Changing a wall's length never changes the angle of the walls joined to it.** Dragging an end handle (or typing a length) moves that end along the wall's own line. The wall joined at that end moves across with it, keeping its angle and length, and the next wall stretches. Doors and windows stay where they are in the room, and a change that would cut through one is refused. Holding Option/Alt while dragging an end still moves the corner freely, to make an angled wall.
- **Room drawing feedback, round 5 (owner, 2026-11-05), checked against industry practice.** The review is in `docs/ux/INDUSTRY_REVIEW.md`, with its own owner questions. Standing rule: research the common apps before building any drawing or navigation behaviour.
  - **Navigation:**
    - The mouse wheel zooms at the cursor.
    - On a trackpad, two fingers move the plan and pinch zooms.
    - Ctrl/Cmd + scroll zooms.
    - Middle-button drag and Space + drag pan.
    - Fit: double-click the middle button, Shift+1, or the Fit button.
  - **Box select works like AutoCAD:** dragging left to right picks only walls fully inside the box; right to left picks anything it touches.
  - **Drawing walls:** while drawing, type a length and press Enter (Cabinet Vision, Mozaik). Right-click or Esc finishes.
  - **Walls are lettered A, B, C … in circles**, in drawing order. This is the kitchen-drawing convention, and it replaces the numbers everywhere, including check messages.
  - **Doors record their hinge end and swing side** (Core `SwingSchema`). They are shown and set as Left hand / Right hand and Swings in / out, judged from outside the door per the US handing convention.
    - The standard for a new door (hinged at its start side, swinging into the room) is PROPOSED in `standard-sizes.json`; the owner has not chosen it.
    - Doors saved earlier keep the swing they were drawn with.
  - **Doors and windows can be dragged along a wall or onto another wall**, and resized from end handles. A dragged position or size becomes rough.
- **Room drawing, round 6 (owner, 2026-11-05):**
  - **Wall status colours stay** (pastel red / amber / green). The owner calls them a helpful "fail loudly" signal. Drawings for clients will use standard grey walls (drafting convention) when that view is built.
  - **Click a wall's length on the plan to type a new one** (Revit, Chief Architect). It works like typing it in the side panel: the far end moves along the wall, and joined walls keep their angles.
- **Room drawing, round 7 (owner, 2026-11-05):**
  - **Two states for sizes: unmeasured (pastel red) and confirmed (black, as in CAD programs).** These replace rough / measured / verified. Typing or dragging a size never confirms it; only the Confirm button does. A confirmed wall whose length changes goes back to unmeasured, with a notice. Rooms saved with the old states convert: verified becomes confirmed, everything else becomes unmeasured.
  - **The "Type the next wall" card is removed.** It was added without the owner asking. Walls are drawn on the plan, with lengths typed while drawing or on the plan.
  - **Measurement chains on walls with doors or windows:** corner → opening edge, opening width, … → corner, with the overall length on a second line. Researched in cabinet makers' planning guides; see `docs/ux/INDUSTRY_REVIEW.md`.
- **Room drawing, round 8 (owner, 2026-11-05):**
  - **Floating walls for islands and peninsulas**, carried over from closet-builder's owner decision A-21 (2026-10-09). The owner pointed to it.
    - A floating wall is an invisible wall: a line with a position and direction, no thickness, not part of the room's outline, which cabinets can stand against on both faces. One kind serves islands and peninsulas.
    - In Core, a wall has `kind: 'room' | 'floating'`. A floating wall has no thickness and no doors, windows or obstacles.
    - On the plan it is a thin dashed line, with no unmeasured/confirmed colour, because its position is a design choice, not a site measurement.
    - Drawn with the "Floating wall" tool, one line at a time, or by switching an existing wall in its panel.
  - **Bug fixed: drawing more walls after some exist.** Starting to draw made the toolbar wrap onto a second line, which moved the plan about 20 px under the cursor, so walls started in the wrong place and missed snaps. The toolbar is now always one line, and the drawing holds its position if the plan area changes size.
  - **New walls snap onto existing walls**, not just their corners: CAD's "nearest" object snap. A wall can start or end anywhere along another.
- **Room drawing, round 9 (owner, 2026-11-05): edge scrolling.** While drawing walls or dragging a handle, a cursor within 40 px of the plan's edge scrolls the plan that way, faster nearer the edge, as AutoCAD, SketchUp and Figma do. The wall or drag being made follows the cursor. It stops when the cursor moves back in.
- Room capture is pulled ahead of Phase 5 (BUILD_PLAN). Order: scaffold (1a), then Core walls and openings, then the Designer drawing screen.

### 2026-11-06: Rough layout: cabinet runs and appliances (owner, from the clickable mockup, rounds 1 to 4)
After walls, doors and windows, the person marks where cabinetry goes and where the appliances will likely sit, in about a minute. It is not placing cabinets: the AI draft (OA-3) fills the runs later. Researched against IKEA, Lowe's, Mozaik AutoFill, Coohom and Archisketch; the owner chose "tap a wall / drag along a wall" for runs and an appliance tray, and dropped layout-shape templates and a work-triangle hint.
- **Who uses it:** a designer or salesperson on an online call, and the client on their own. It must explain itself and work with a mouse and with touch.
- **Run types:** base only, upper only, base + upper, base + upper + pantry, all pantry. A run can be split so parts have different types; the two parts share a divider that moves both.
- **Where runs snap:** run ends stay **3" clear of doors, passthroughs and windows**. Where a run meets the run on the next wall, its end snaps into the corner or **3", 6" or 9" clear** of that run's front.
- **Corner cabinets:** where runs on two walls meet in the corner, a corner cabinet is needed: base where both have bases, upper where both have uppers. Shown, not stored.
- **All pantry stays clear of windows:** the stretch in front of a window, plus 3" either side, becomes base cabinets.
- **Islands:** floating walls (A-21) with a run on them. Island depths: **15", 27", 36", 42", 48"**.
- **Appliance tray and standard widths:** fridge 36"; range 30" or 36"; cooktop 30" or 36"; wall oven 30"; sink 32"; bar sink 24"; dishwasher 24"; microwave 24"; wine fridge 24". Ranges and cooktops always come with a hood. Appliances are only placed by the person (drag, or tap then tap the plan); nothing drops in on its own.
- **Appliance rules:** a sink dropped near a window centres under it. Placing a sink adds a dishwasher right beside it when the plan has none yet; the dishwasher can be moved to the sink's other side and moves with the sink. A fridge gets a full 24"-deep upper above it. An appliance dropped on a bare wall gets a short run under it.
- **Controls match the wall drawing:** click selects, Shift+click adds, Delete removes, Ctrl/Cmd+Z undoes, Esc cancels, scroll zooms, Space+drag pans, Alt stops snapping, click a length to type it. Run and island options sit in a "Cabinet runs" frame on the right; appliance options pop up next to the appliance.
- **Still to confirm:** the hood is assumed to match the width of the range or cooktop under it.
- **Built into the room preview** as the "Cabinets & appliances" tool (2026-11-06). Walls are stored by their centre line, so cabinets stand against the inside face and stop at the inside corners; corner gaps are measured from the inside corner.

### 2026-11-05: Where the work lives and deploys
- `main` is the main branch. Netlify deploys the live site from it, so every merge is a deploy.
- **The site is built as plain web pages** (Next.js `output: 'export'` into `out/`), which Netlify serves directly. The first deploy (PR #4) showed Netlify's "Page not found" on `/rooms/preview`. Most likely Netlify's Next.js support didn't handle this Next.js version. Every page today runs in the browser, so no server is needed. `npm run check` now serves `out/` like a static host and opens the pages (`npm run test:static`). Revisit when the first server-side feature arrives (database, sign-in, API): it will need Netlify's Next.js support or another approach.
- **Owner direction (not yet final):** the UCS library and the import-file (adapter) work will almost certainly be brought into this repo instead of living in `cabinet-vision-ucs`. So the earlier proposal to keep the UCS library in its own read-only repo (branch `claude/admiring-bardeen-593xx5`) was **not** merged. Until the move is decided and planned, `cabinet-vision-ucs` stays where it is. Before the move, decide which folder it goes in; the vendor-name check (rule 3) must allow that folder.

### Replaced on 2026-10-27
- ~~Mozaik is the design source of truth; this tool can't write to Mozaik.~~ The master copy is the source of truth; Cabinet Vision is the target.
- ~~Lengths in integer mm.~~ The base unit is 1/64 inch (U-1, answered 2026-11-05).
- ~~Mozaik data captured from the SketchUp export and job files; manual upload, then a Windows desktop uploader; upload matches confirmed by a person.~~ Dropped. A Mozaik reader may come back in Phase 8, from its SQLite export.
- ~~Guided Mozaik drawing.~~ Replaced by the AI draft and the visual editor.
- ~~Build starts with the quick quote, after the foundation.~~ Build starts with Phase 0 discovery and the Phase 1 proof slice.
- ~~(2026-10-24) closet-builder is kept for reference only; no code is carried over.~~ Reopened as C-1, because a visual editor and room capture are back in scope.

## Open questions

### Needed before Phase 1 code
- **CV-1 Where does Cabinet Vision run, and who works in it?** Is it on a computer at the colony, operated by colony staff, or with you? How reliable is that computer's internet? The automatic library sync and read-back (OA-6) need something running on that computer. Phase 0's samples also come from there.
- ~~**U-1 Base unit (spec Q5).**~~ Answered 2026-11-05: 1/64 inch (see "Decided").
- ~~**U-2 Metric values.**~~ Answered 2026-11-05: rounded to the nearest 1/64 inch (see "Decided").
- ~~**A-1 Angle convention.**~~ Answered 2026-11-05 (see "Decided").
- **PROPOSED (from the Phase 1a scaffold, 2026-11-05).** These are technical readings of ARCHITECTURE where the table was silent. They are built this way and the checks enforce them:
  - `app` may import `core`, `platform`, and adapter and connector `contract.ts` files, as well as module contracts and `ui/index`. It is the composition root that wires "send" to the adapter.
  - `visual-library` may import only `platform` and the catalog contract, exactly as the table says, so not `core`. "Item IDs only" is not checked by a tool; it is in the module's `CLAUDE.md`.
  - The vendor-name check also allows the root `CLAUDE.md`, `README.md` and `prompts/`, which are project documents like `docs/`. Lock-file integrity hashes are ignored, because random letters could spell the format name.
  - Only the parts of the stack that the scaffold uses are installed. Supabase, Drizzle, Tailwind, shadcn/ui and react-konva come with the first code that needs them.
- **PROPOSED (room preview, 2026-11-05):**
  - The starting permissions are `room.view` and `room.edit` for owner, admin and designer (`src/platform/permissions/roles.json`).
  - A mocked preview user and preview shop stand in until sign-in and shops exist, and are labelled on screen.
- **PROPOSED (rough layout, 2026-11-06):** mockup defaults the owner used without changing, kept in `src/modules/designer/data/layout-rules.json`:
  - new runs start as base + upper, 24" deep (upper only 12"); uppers on a base + upper run are drawn 13" deep; island runs start as base only; nothing shorter than 9" is made;
  - "Add island" makes a 72" × 36" island;
  - a fridge or wall oven is kept out from in front of a window; a wall oven dropped on a bare wall gets an all-pantry run.
- **PROPOSED:**
  - the `core/` / `platform/` split, and the master copy stored as versioned JSON with the named writers (ARCHITECTURE);
  - ~~appliance placements added to the master copy (DATA_MODEL "core").~~ Decided 2026-11-06 with the rough layout (see "Decided"). Dimension provenance was approved on 2026-11-05.

### From the owner's workflow (2026-10-27)
- **CV-2 More than one colony.** Will each colony have its own Cabinet Vision library (so its own catalog mappings), or will all colonies share one library? And does each have its own prices?
- **SM-1 Measuring after sign-off.** The client signs off on a design drawn from rough dimensions; the site measure may then change sizes. The earlier plan (2026-10-24) said small within-tolerance differences are absorbed without client re-approval or repricing. Does that still hold? If so, what tolerance? Above it, does the client re-sign?
- **PAY-1 "Paid".** Does "paid" mean paid in full, or a deposit? closet-builder had a deposit to commit and the balance before production. Which payment tool?
- **R-1 Photorealistic.** A realistic 3D view the client can turn in the browser, or rendered still images (slower, more realistic), or both? This is the most expensive part of the editor; the answer sets its cost.
- **DL-1 Deadline ticker.** How is the "everything in by" date worked out? From the colony's production lead time (as data) and the promised delivery date? Who sets the delivery date?
- **PO-1 Automatic ordering.** Who places the orders (you or the colony), which suppliers, and how does each take orders (email, portal, API)? Do "materials" mean sheet goods sent to the colony?
- **MSG-1 Channels.** Which email (Gmail?), which texting service, and which meeting tool's transcripts? Do reminders go by text, email or both?
- **IK-1 to IK-7** Kitchen intake questions, in `docs/intake/kitchen.md`.

### From the spec (section 11)
- **S-1** Which Cabinet Vision versions do target shops run, and does ORDX behave the same across them?
- **S-2** How much room placement and elevation detail does ORDX keep on import?
- **S-3** Which read-back source is most reliable: ORDX export, SQL database, or reports? If it's the database or files on the shop's computer, do we need a small helper app there?
- **S-4** Is there a Cabinet Vision or Cyncly partner program with documentation or support? Licensing and terms must be reviewed before Phase 3.
- ~~**S-5**~~ = U-1, answered 2026-11-05.
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
  - room geometry, including "floating walls" for islands and peninsulas (its A-21). *Answered for floating walls (owner, 2026-11-05):* the idea is carried over; see "Room drawing, round 8";
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
- ~~Tech stack confirmation (ARCHITECTURE "Stack").~~ Confirmed 2026-11-05.
- The Comparer's strict tolerance: the values, and whether they are per dimension or per item.
