# Decisions

Add new decisions at the bottom of the right list, with the date. Only the owner (Taren) decides. A PROPOSED item stays open until the owner says yes.

**Finding the current rule without reading the history:** start at `docs/PROJECT_MAP.md` (what runs, where each rule lives, what is unresolved), then search this file for your topic. Entries are dated. On a topic, the latest **explicitly approved** decision that applies governs. A PROPOSED choice or an open question never overrides an approved rule, however recent. If it's unclear which decision applies, or whether it was approved, flag it (an open question, and say so in your report) rather than guess. Older entries are kept as history, not rewritten.

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

### 2026-11-11: Cabinet ends saved on each cabinet (owner: "one authoritative finished-end decision, shared by the saved design and the rendering")
- **Built (designer):** the decided ends rule (2026-11-07 "The cabinet catalog", CB-FACT-10, and round 2 2026-11-10) is worked out once, in `src/modules/designer/model/ends.ts`, from data in `data/placeholder-draft.json` "ends", and saved on each cabinet as the catalog's `end_left` / `end_right`. The 3D view draws only what is saved, and the counter overhangs only past a saved finished end (HARD-011). Before, the 3D view worked ends out while drawing and the saved design had none. On the real kitchen the 3D view is unchanged (every shape compared before and after).
- **After a layout change** only ends that still follow the rule are worked out again; an end that differs is kept. **Older designs** aren't changed on opening: Customize lists cabinets with no saved ends and sets them only when someone asks; ends that differ from the layout (for example after the room drawing changed) are listed the same way.
- A Finished end (by request) is drawn like an applied one: the 3D view is a visual approximation.
- **Not decided, so not set or PROPOSED:** END-1 (which side is left), END-2 (corner cabinets' ends), END-3 (an island's waterfall or detailed sides). See Open questions.

### 2026-11-11: The live builder, and less routine work per change (owner, chat, 2026-11-11)
- **The app runs the designer's placeholder builder** (`src/modules/designer/model/placeholder-draft.ts`, `data/placeholder-draft.json`). Layout fixes the owner can see go there; other fixes go in the module that owns the behaviour (`docs/PROJECT_MAP.md`).
- **The AI layout builder is parked** (`src/modules/ai-design/model/engine/`, `data/draft-rules.json`). Nothing in the app runs it. It is kept, not deleted, and not changed unless the owner asks for work on it. **Deferred:** copying the placeholder's later layout fixes into it. Not to be picked up automatically. (The round-2 hood fixes were already copied in by pull request #59, merged the same day before this decision; that work stays as it is.) Why: the 2026-11-10 fixes were built twice the same day (pull requests #54 and #55), once in code nothing runs.
- **Less routine per change.** Sessions read `docs/PROJECT_MAP.md` and the module's own notes, then only the doc sections the task needs, instead of the whole doc set. Docs are updated when behaviour, a rule, an interface or the workflow changes, not every time. Quick checks (about 16 s) while working; the full `npm run check` (about 3 min 40 s) on the final code before merging, and again if code changes after it. Breaking a check on purpose is for new guardrails, not every new test. Details in root `CLAUDE.md` and `docs/DEVELOPMENT.md`.
- Module notes said "only edit files inside this folder", while the root asked for doc updates outside it. Now: code stays in the module; recording the change in `docs/` and the module README is allowed.
- Root `CLAUDE.md` pointed to `docs/cabinet-vision/FORMAT_REFERENCE.md`, which doesn't exist yet (Phase 0 writes it from real samples). It now says so.

### 2026-11-10: Fixes after trying a real job, round 2 (owner, chat, 2026-11-10)
The owner tried the placeholder design on a real kitchen and sent pictures. Decided and built (designer: `data/placeholder-draft.json`, `model/placeholder-draft.ts`, `ui/Stage3D.tsx`, `ui/Customize.tsx`; intake: the room look now carries the island panel choices; studio: tells the placeholder which rooms are bathrooms):
- **"Widths are custom and made to fit the space."** No more 3" steps with fillers: each space is split into equal cabinets on the catalog's 1/16" step. A filler only where a space is too narrow for a cabinet. A sliver under 1/16" (a run that doesn't land on the step) is left open and the notes say so.
- **The uppers either side of a hood are the same width, by adjusting the base cabinets.** The uppers are one width; the base cabinet beside the range is sized so its outer edge lines up with the upper above. The hood's 2" clear space now applies when the range stands in a run of its own (it didn't, which is why the real job had no clear space and a filler beside the hood). PROPOSED (this session): when one side is a little longer, up to 1 1/2" is a filler at that side's far end, so each side stays one cabinet.
- **Applied finished ends go to the floor.** Every end with nothing beside it (beside a range, an island's ends) is covered from the floor to the top, flush with the doors.
- **Toe kicks match the colour of that cabinet's doors.**
- **No counter breaks.** Each stretch of touching base cabinets has one counter at one height (a filler or the dishwasher opening was a different height, which made the breaks).
- **The island's panels look as chosen** in the design choices: "Matching door panels" draws door panels on the back, lined up with the cabinets in front; shiplap, detailed and waterfall sides likewise.
- **3D view:** brighter; the camera moves, zooms toward the pointer and turns around a double-clicked point; Open doors no longer repeats (the autosave's re-render was rebuilding the view). **Not yet checked on the live site with the real autosave** (tested in code only; see Open questions, PR-57).
- **Bathrooms use the vanity cabinets**, so Customize offers vanity types there, not the kitchen's. PROPOSED: Vanity, drawer over doors for most (there is no doors-only vanity), the vanity sink, the vanity filler, and 3-drawer vanities for Maximum drawers.
- **The AI layout builder takes this on too** (`src/modules/ai-design/model/engine/build.ts`, 2026-11-11; nothing runs it yet): the hood's clear space and equal uppers are worked out for the whole wall, so a range in a base-only run of its own between two base + upper runs gets them, and the base beside the range is cut to line up with the upper above. The PROPOSED 1 1/2" filler at the longer side's far end is in its `data/draft-rules.json` "clearances.flank_filler_max", PROPOSED as here. It already made widths on the catalog's step.
  (Pull request #59 copied this into the parked builder on 2026-11-11, before the 2026-11-11 parking decision was merged. Any further copying is deferred; see that entry.)

### 2026-11-10: Fixes after trying a real job (owner, chat, 2026-11-10)
The owner compared the placeholder AI design with the 3D drawing on a real kitchen and listed seven problems. Decided and built (designer module: `data/placeholder-draft.json`, `model/placeholder-draft.ts`, `model/cabinets.ts`, `ui/Stage3D.tsx`):
- **Corners where runs overlap default to the L-shaped 90-degree corner cabinet,** never a blind corner. Lazy Susan or no answer: the catalog's Corner base (36" x 36"); double shelf: Corner base, adjustable shelves. The wall ending at the corner stops where the L's other leg starts. The 3D view draws both corner cabinets (base and upper) as an L with a door on each inside face; before, it drew them as one deep box. This replaces the placeholder's blind corner when no insert was chosen.
- **An island's back is always covered by a finished back panel:** the catalog's Island back panel, on the far side of the island's line, as long as the run. The 3D view draws it from the floor, so the toe kicks no longer show from behind, and the island counter runs over it.
- **The dishwasher:**
  - It is drawn as a plain stainless door, flush with the cabinet doors, under one continuous counter. Before, it had a cabinet door drawn on it, was 3/4" proud of the run, and had its own deeper counter.
  - Every counter now has the same front line: the base cabinets' depth plus the overhang.
  - The opening also touches the sink base (HARD-005). Before, a sink base wider than its sink overlapped the dishwasher by 2".
  - The dishwasher was then also drawn a second time as a loose appliance box in the same place. That was the flicker on its back. A cabinet now counts as holding an appliance when it holds the appliance's middle.
- **A hood gets 2" clear on each side** (owner: "2\" each side"), and the uppers either side of a hood, or of the cabinet over the cooking, are the same width (PREF-019, HARD-007). This applies to appliance and millwork hoods, not to a cabinet over the range.
- **The cabinet over a fridge comes down to 2" above the fridge** (owner: "should only have 2\" of clearance over a fridge"). The fridge height is still the drawing's rough 70" until its spec is confirmed (OA-4).
- **A fridge always has a full-height, full-depth panel on each side:** 3/4" thick, 26" deep ("26\" to go past the depth of adjacent counters"), from the floor to the cabinets' top line. A panel that has no room (against a wall or corner) is reported in the design's notes, never skipped. Which shop part it is is open (AD-6).
- **Selected cabinets** show a gold tint and a tight outline only. The see-through box around a selection stuck out of the island's back, and looked like a fault in the drawing.
- **Nothing is skipped any more.** An appliance that pokes past its run, or into a corner cabinet, used to be dropped from the draft without a word (a 1/64" tolerance). It is now drawn, and a note says how far it runs in and to move it. A sink base and dishwasher that would run into a corner are moved clear, and a note says by how much.
- **The AI layout builder takes these on too** (`src/modules/ai-design/model/engine/`, 2026-11-10; nothing runs it yet): L-shaped corners with no corner insert chosen, 2" clear each side of an appliance or millwork hood with equal uppers either side (PREF-019), the cabinet over a fridge from 2" above it, a 26"-deep full-height panel each side of every fridge (a block, never skipped, when there's no room), and an Island back panel on every island. The numbers are in its `data/draft-rules.json` "clearances". PROPOSED there, as in the placeholder: the Tall filler as the fridge panel (AD-6) and the fridge's rough 70" height (OA-4).

### 2026-11-09: AI design brief: owner answers (chat, 2026-11-09)
The design brief (`src/modules/ai-design/`, PR #29) asked three questions. The owner's answers:
- **No "not sure" answers.** The intake questions don't let the client answer "not sure". The brief refuses one if it is ever sent. "Not sure" is removed from the intake answer statuses (DATA_MODEL "intake").
- **"Not applicable" is an answer status.** It is for a follow-up question that an earlier answer ruled out (for example "which knob?" when the client chose all handles), and it carries a reason. Main questions can't be marked not applicable.
- **Walkways (PRIN-005, PRIN-013), as written in the AI designer's draft instructions:**
  - when lining up and walkway width pull against each other, lining up wins as long as the walkway stays over 36" (PRIN-013);
  - below 36", and when centring or alignment pulls against walkway width (PRIN-005), the AI explains the trade-off and the designer decides.
- The rest of the AI designer's draft instructions are still PROPOSED.

### 2026-11-09: AI designer: how it works (owner, plan review in chat, 2026-11-09)
The owner's goal: lock in the wall measurements, openings, cabinet runs, room drawing and every design choice as the canvas, then fill the whole room with real cabinets at exact coordinates, weighed against every design rule. It is "fast fill" for the entire project, not one gap.

- **Mandatory, never changed by the draft:** every design choice the client made, wall lengths, openings, and where the cabinet runs go.
- **Appliances may move up to 24" along their own wall,** only to improve the design, and every move is explained. They never move to another wall. The 24" will be data with this decision as its source.
- **Ordinary code for as much as possible; AI only for what it is good at:** taste, judgement, trade-offs, comparing options, fact-checking that every requirement is met, and explanations. So:
  - code builds several complete, valid layouts per room;
  - Claude picks between them and writes the notes;
  - Claude never types coordinates.
- **The AI call runs on Netlify Functions**, with the key kept in Netlify's settings. Designers in any browser, anywhere, call the same function. The site stays plain pages.
- **Live work must not live only in a browser.** The shared master copy store on Supabase is built **before** the AI designer, on the Supabase project **cabinet-pm** in Canada (see AD-3).
- **Design choices → catalog options** (door style, colours, handles): left as blockers for now. Drafts show "door style missing" and similar until that mapping exists.
- **IK-15 closed:** the design brief now reads the intake's own handover and keeps no copy of the questions (`src/modules/ai-design/README.md`). The brief's format is now 2.
- **PROPOSED (this session, not owner-decided):**
  - the ranking ladder used to shortlist layouts and as the fallback when the AI can't be reached: hard rules never broken, then the fewest broken preferences of the strongest wording;
  - the AI judge's instructions;
  - the "Not reviewed by AI" label when the call fails.

### 2026-11-09: Owner updates after trying a real job (round 3)
The owner tried the studio on a real job and asked for seven changes. The answers:
- **Island end panels:** two new side-panel choices, "Plain gable" (3/4") and "Deep plain gable" (1 1/2"). *Built (intake).*
- **Top trim:** a "None" choice. *Built.*
- **Light valance:** a "None" choice, with "Hidden" kept. With None or Hidden, no valance colour is asked. *Built.*
- **Measurements on walls are inside measurements,** wall face to wall face. The plan showed, and typing set, the walls' centre-line length, which is why the ensuite didn't add up. *Built:*
  - the plan's wall labels, the door and window measurement chains, the placing ghost and the side panel all show inside lengths;
  - a typed length is the inside length;
  - walls are still stored by their centre line, so the checks, the layout builder and the future export are unchanged.

  Lengths typed while *drawing* a new wall are still centre-line lengths. Once the wall is joined, its label shows the inside length, and typing on it sets that.
- **Interior walls are 4 1/2"**, not 5 1/2". *Built:*
  - the standard is now 4 1/2";
  - a room that still started new walls at the old 5 1/2" default takes the new one;
  - every existing wall in the database was changed to 4 1/2" as a new version of its room.
- **Distances while placing islands and appliances:** to the ends of the wall, the opposing wall, and the other things on the same wall. *Built:*
  - a selected appliance, including while it is dragged, shows its distance each way along its wall (to the inside corner, or the nearest appliance, door or window) and, on a room wall, from its front to the opposing wall's face;
  - a selected island shows the distance from each of its four sides to the nearest wall face.
- **Over a range or cooktop**, the designer chooses Cabinet, Appliance hood or Millwork hood, on the appliance. A new one starts as Appliance hood. *Built:*
  - the choice is saved on the appliance in the master copy; a range or cooktop saved before this has an appliance hood, which is what it already had (this replaces "ranges and cooktops always come with a hood", 2026-11-06);
  - the appliance's pop-up offers the three choices, and the plan label, the 3D view and the Customize list follow it. The tray now says "Range" and "Cooktop";
  - the layout builder leaves an appliance or millwork hood's space open and centred (HARD-007); a millwork hood is also reported, because the catalog has no millwork hood yet;
  - a cabinet is a short upper with no shelf (`upper_no_shelf`), centred on the appliance and hung from the top line. Owner confirmed (2026-11-09): this is the cabinet the shop uses there. The 30" clear above the cooking surface (HARD-008) is reported as not checked: there is no counter height in the data yet.
- **Bathroom-type rooms:**
  - the tray offers a toilet (30"), a vanity sink (20"), a double vanity sink (60"), a tub (60") and a shower (48");
  - runs start base-only and 21" deep, for the 20 3/4" vanities.

  *Built:*
  - the studio tells the drawing which kind of room it is, from the design choices' own bathroom grouping;
  - a toilet, tub or shower stands on the floor: no run is made under it, and the "appliances on runs" check leaves it out;
  - **PROPOSED:** other room types use the kitchen's tray until the owner says otherwise.

 (owner asked to add a real client)
- **The repository is public on GitHub, and the site's code reaches every visitor's browser.** So real client details (names, emails, phones, addresses) are **never** written in code, commits, pull requests or docs. That includes the demo-client file. They live only in the shared database (`customers`, owned by projects), where only signed-in staff can read them.
- **The table:** `customers` (`supabase/migrations/20261109000004_customers.sql`).
  - Staff can read, add and change clients. No one can delete one.
  - Every add and change writes an audit row with the old and new values. Who added a client, and when, can't be changed.
  - Tested against the real project in rolled-back transactions; all 10 checks passed. Letting any signed-in account read clients was tried on purpose (rolled back): a non-staff account then saw the client, so that test catches it.
- **The screens:**
  - **Clients** lists real clients first, then the demo clients, still labelled.
  - **New client** (owner: yes) adds one. It needs the database, and it is refused with reasons when the name is missing, the primary contact can't be reached, or an email or phone isn't valid.
  - Real clients open at `/clients/view/?id=…`, because the site is plain pages.
  - "Start a design" opens the client's job, keyed by the client's ID until jobs have their own records (BUILD_PLAN 7a).
- **The first real client** was added straight into the database through the connector, recorded as added by the owner's account.
- **PROPOSED (this session, not owner-decided):**
  - permissions `client.view` and `client.add` for owner, admin and designer;
  - a client has a household name plus one or two contacts, each with a name, an email and a phone.

### 2026-11-09: AI designer: layout builder (plan step 3)
- **Built:** `src/modules/ai-design/model/engine/` (README "The layout builder"). It is ordinary code that fills a room with catalog cabinets at exact positions. It makes several options, each checked with the same checks as a human design and scored against the confirmed rules. Its data is `src/modules/ai-design/data/draft-rules.json`, each entry with its source.
- **Appliance moves:** 24" at most, along their own wall, and only for a reason:
  - centring the sink under its window (PREF-023);
  - the least move that clears a fixed cabinet (function first, PRIN-011).

  On the example kitchen, the builder moves the sink and dishwasher 3 1/2" to fit the dishwasher beside the corner cabinet, and the range 8 1/4" to clear the corner cabinet's leg.
- **Checked:** every option passes every Core layout check. The catalog's only findings are the door style (left missing, owner 2026-11-09) and the corner cabinets' hinge side (CAT-2).
- **Broken on purpose, then restored:**
  - a dishwasher 1" from the sink;
  - ignoring the 24" limit;
  - uppers over the range.

  Each made its test fail.
- **PROPOSED (this session, not owner-decided), on the owner's review page:**
  - **corner cabinets:** Lazy Susan uses the L-shaped corner base, and Double shelf uses the L-shaped base with adjustable shelves;
  - **upper height:** 30" and 36" uppers are both offered as options, and the AI judge picks;
  - **drawer levels:** the "moderate" and "maximum" cabinets that aren't drawer banks get a drawer over doors;
  - **the ranking ladder:**
    1. fewest blocks;
    2. the client's choices;
    3. owner strength words, strongest first ("extremely strong", "very strong", "strong", "a scored penalty", others);
  - **reading PREF-021:** more than one one-off width in a run of three or more cabinets counts as "random";
  - **cabinets beside a range or fridge space:** they get an applied finished end, with no extra 3/4" left;
  - **islands:** cabinets stand on one side, backs on the island's line;
  - **uppers:** they hang from the client's cabinet height, so their bottom height follows from the cabinet's standard height. No rule sets the space above the counter.
- **New open questions:**
  - **AD-4:** a 36" L-shaped corner base is longer than the 24" corner square the room drawing shows. Should the drawing show the corner cabinet's real legs, so appliances aren't placed in them?
  - **AD-5:** how far above the counter should uppers start? No rule says. Today it follows from the cabinet height and the upper's standard height.
- **Still open, and limiting the builder:**
  - **CAT-1:** filler, tall and drawer-bank sizes. Leftovers under 8" and short pantry runs can't be filled.
  - **CAT-2:** hinge side.
  - **AD-1:** the fridge upper's depth.
  - **DR-3:** how close counts as centred for an island fixture.

### 2026-11-09: Room geometry moved to Core (AI designer plan, step 2)
- The room drawing's geometry (where cabinets can stand along a wall, corner cabinets, where uppers go, door and window clearances) moved unchanged from `designer/model/layout.ts` to Core (`src/core/layout/room-geometry.ts`). The AI designer may not import the designer, and two copies could disagree.
- Core takes its numbers as inputs (rule 6): the opening clearance, the upper band's depth, the shortest run, and which appliances get their own upper. The designer passes them from its `layout-rules.json`, keeping the same function names, so no screen changed.
- **Checked:**
  - all 302 existing tests pass unchanged, with 9 new Core tests;
  - ignoring wall thickness made 15 tests fail across Core and the designer;
  - letting uppers run over windows made 4 fail.
- **PROPOSED (this session, not owner-decided):** the layout numbers stay the designer's data for now. The AI designer will receive them from the app, which composes both. If more modules need them, they move to shop settings.

### 2026-11-09: The shared database, step 0b: sign-in and the studio (owner answers, chat, 2026-11-09)
- **Saving is automatic** (owner). There is no Save button. A change is saved to the database a second or two after the person stops, as a new version. The studio's header always says "Saved to the shared database", "Saving…" or, in red, "Not saved", with the reason in a banner.
- **The demo clients stay as the jobs** (owner) until real client and job records exist (BUILD_PLAN 7a). They are still labelled as demo clients.
- **Sign-in is by an emailed link** (recommended to the owner, who asked what suits customers signing themselves up later):
  - there is no password to set or forget, so it is also the easiest way for a stranger to make an account;
  - today only invited staff get in;
  - when the customer side is built, sign-up opens for customers only, with a customer role, and the database lets each customer see only their own designs.
- **When two people save the same job:** the first save lands. The second is stopped and told, and nothing is overwritten. When they reopen the job, they choose:
  - use the saved copy;
  - or keep theirs, which is saved as one more version, so the history keeps both.
- **Live database mode:**
  - the studio, Today and Clients need a signed-in staff member;
  - the job is opened from the database before any screen reads it;
  - work that was only in a browser is moved into the database the first time it is opened.
- **Not connected:** a build without the database settings (a developer's machine, the automated tests) keeps work in the browser only and says so in the header, with the labelled preview user.
- **Tested against the real database:** the new table (`intake_answer_versions`) and the room filing were checked with the same rolled-back tests. The sign-in gate was checked in a build with the live settings: signed out, only the sign-in card shows.
- **The live connection can't be reached from Claude's sessions** (network policy). The first real sign-in and save are tried on the live site.
- **PROPOSED (this session, not owner-decided):**
  - the browser keeps a working copy, so the screens work as before, and `src/app/sync/` keeps it in step with the database;
  - a room's version is saved with the summary and origin of its own latest history entry (for example "Moved the sink", AI or designer);
  - the thickness new walls start at is not saved and goes back to the standard size on another browser;
  - a save that fails for a moment (network) is retried every second or two and shown in red. It doesn't raise a database alert, which would flood the list; a clash stops saving until the person chooses;
  - the standalone previews (`/intake`, `/rooms/preview`) stay browser-only and say so.

### 2026-11-09: The shared database, step 0a (owner: "live work shouldn't live solely in a browser")
- Built in the Supabase project **cabinet-pm** (Canada, AD-3). The tables are in `supabase/migrations/` and were applied through the Supabase connector:
  - `staff`, `shops` (the colony shop, with the catalog's ID);
  - `master_copy_versions`;
  - `audit_log`, `alerts`.
- The rules are enforced in the database and tested against the real project (`src/platform/README.md`):
  - versions are never changed;
  - two saves from the same version can't both land;
  - only staff see or save anything;
  - every write is audited;
  - alerts are resolved only with a note.
- Supabase's own security check is clean.
- **PROPOSED (this session, not owner-decided):**
  - **Sign-in is by an emailed link, invite only.** The owner invites each person in the Supabase dashboard and adds them to the `staff` table with their roles. No passwords, and no one can sign themselves up.
  - **The database checks only "is this person staff".** Which role may do what stays data in `roles.json`, checked by `can()` in the app, so roles are still changed in one place.
  - **Customers and jobs are not tables yet** (projects, BUILD_PLAN 7a). A version is filed by its job ID only.
  - `@supabase/supabase-js` 2.118.0 is installed, pinned to that exact version.

### 2026-11-08: The design studio (owner: "the design choices flow seems to work well, so let's integrate that into the actual code", Kitchen Studio prototype, https://claude.ai/artifact/Tkd2r8vTUswCs3ioJnGjqg)
- **C-2 answered: the look is the prototype's**, which is closet-builder's owner-approved design system: navy (#1A3045) to act or show "you are here", gold (#D4B57F) for what is selected, Newsreader for headings, Geist for everything else, light only. The owner asked for "the more polished UI of the artifact". The tokens live once, in `src/platform/design-system/tokens.css`; the palette in `docs/ux/UX_BRIEF.md` Part 4 is replaced. The owner's wall colours (pastel red unmeasured, black confirmed) stay.
- **The design studio (`/studio`)** puts one job's steps in a row along the top: Design choices · Room drawing · AI design · Customize, with the job's rooms as chips under them, as in the prototype. Clicking a room chip switches rooms in either step.
  - Design choices come first. **Room drawing opens only when every room's choices are finished** (the prototype's rule). A finished room offers "Add another room" or "Start laying out room dimensions".
  - **AI design and Customize are shown but can't be opened** ("Not built yet"); the prototype's mocked AI draft and 3D customizer are not carried over.
  - **The room drawing is the live tool**, with all its controls and behaviour, restyled to the prototype's look. The owner: "implement the functionality, controls, and UX of the live room drawing tool, but with the more polished UI of the artifact". The prototype's own drawing code is not used.
  - **Each room of the design choices has its own drawing**, kept in this browser under that room's ID. The standalone pages `/intake` and `/rooms/preview` still work on their own.
- **IK-17 answered (owner, 2026-11-08: "yes"): the intake's rough ceiling height starts the room drawing.** A studio room with no drawing yet starts at once, named as in the design choices, with that ceiling height marked unmeasured (no "Start a room" form). "Match the kitchen" follows the kitchen. The app passes the height through the contracts (`roughCeiling` in intake, `StudioRoom` in designer), so the dependency table is unchanged. The heights are data: each ceiling option in `intake-v1.json` records its feet.
- **A room counts as drawn** (✓ in the room bar) once it has room walls and cabinet runs and no problems (owner, 2026-11-08: "yes").
- PROPOSED (this session, not owner-decided): without `?job=`, the studio opens a single preview job, labelled as such with the mocked user and shop.

### 2026-11-08: Placed cabinets in the master copy (owner: "start with the cabinets in the master copy … an actual room drawing needs to be built with true to life coordinates that can be used in a Cabinet Vision ORDX file. Please research an ORDX file structure first")
- **Research first.** Desk research is in `docs/cabinet-vision/DESK_RESEARCH.md`. The vendor's pages couldn't be opened from this session (network), so everything there comes from search summaries and is unverified. It found that the import files place a cabinet by **wall number + offset from the wall's start + elevation (floor to the bottom of the cabinet)**, that walls join where their points match, and that ORDX is XML following each object's Properties, with several rooms per file. The exact ORDX structure is not public; it needs the install's sample file and the shop's exports (CV-3).
- **Core schema 2: PlacedItem** (BUILD_SPEC section 6). Each room has `items`; each item has our catalog ID, width, height and depth, and a position in the same terms as the import file:
  - `wall_id` and `side` (left or right of the wall's direction; on a room wall it must be the room's side);
  - `offset` along the wall's line from its start corner, `elevation` from the floor to the bottom of the box, and `setback` from the wall face.
  - All are exact whole 1/64" values, true room positions, so the writer never has to round (a 1/64" value is at most six decimal places of an inch).
  - Islands and peninsulas stand on floating walls (A-21), so every item is wall-referenced; there is no free "room coordinates" placement.
- **Selections:** `job_selections`, `room_selections` and `item_selections` (our option codes), resolved item, then room, then job (`resolveSelections`). Nothing is filled in.
- **Origin:** who placed an item (`ai` or `designer`), who last changed it, and whether a designer approved it as it is.
- **New checks (all block):** Core's `layout.items-on-wall`, `items-fit-along-wall`, `items-under-ceiling`, `items-clear-openings` (only where an item's height overlaps the opening's: a base under a window is fine), `items-overlap` (in 3D, also round corners); the catalog's buildability checks over every placed item (`catalog.placed-items`), with resolved selections. Each was broken on purpose in a test and shown to fail.
- **The placeholder AI step now writes placed items into the room's master copy** (job status `ai_draft`, history origin `ai`, saying no AI was used). Customize reads and saves the master copy; the 3D view, run strips and checks are worked out from it every time. The browser-only placeholder design is gone.
- **Rooms saved before** are upgraded when they load: no cabinets, no selections. **The preview shop now carries the catalog's shop ID** ("The colony shop", mocked), so the catalog can check the preview's cabinets; rooms saved with the old stand-in ID are moved over.
- **PROPOSED (this session, not owner-decided):**
  - `offset` is measured on the wall's centre line from its start point, like openings, runs and appliances. If the import file measures from a face or an inside corner (CV-5), the writer converts; that is exact on square walls and is an open question on slanted ones.
  - The placeholder's cabinets count as AI-placed (`placed_by: ai`), because they stand in for the AI draft; the history says no AI was used.
  - Appliances stay as wall placements, not catalog items; hoods are worked out from them, not stored.
  - BUILD_SPEC's `rotation` field is not stored: a wall-placed item faces away from its wall, which `side` says.
  - The customize Checks tab shows every finding, including required choices (door style, ends) the placeholder doesn't fill in: they are real blockers until the intake's choices are mapped to catalog options.

### Phase 0 desk research: open questions (2026-11-08)
From `docs/cabinet-vision/DESK_RESEARCH.md`. Only samples from the shop, the install's sample ORDX, or a Cabinet Vision expert can answer them. The writer is not started until they are.
- **CV-3** The real ORDX structure: element and attribute names for job, room, wall, cabinet, position, size and options; which fields are required.
- **CV-4** How walls are numbered, and whether a wall is given by start and end points or by direction and length.
- **CV-5** Where "Offset from Wall Start" is measured from (centre line, inside face, or the inside corner), and whether wall points are on the centre line or a face.
- **CV-6** Whether a cabinet can stand off the wall (our setback), and the field for it.
- **CV-7** What the wall face suffix means, and how a cabinet on the far side of a wall is written.
- **CV-8** Units and decimals. *Narrowed 2026-11-09 (the official ORDX help page, pasted by the owner):* shapes are written with `unit="mm"`, and part values read like mm. Writing mm is exact for us (1/64" = 0.396875 mm exactly), with six decimal places. Still open: whether room, wall and cabinet values are mm too, and how many decimals are read.
- **CV-9** How islands and peninsulas are written.
- **CV-10** How corner cabinets are positioned.
- **CV-11** Whether Elevation includes the toe kick.
- **CV-12** Whether the format differs between Cabinet Vision versions, and which version the shop runs (spec Q1).
- Also: the `cabinet-vision-ucs` repo may already hold some of this. This session wasn't allowed to open it.
- **2026-11-09:** the owner pasted the official "ORDX Format" help page (Cabinet Vision 2026). It covers part overrides, shapes and parameter types, and points to the sample file in the install (`\Support\Sample ORDX\`). It doesn't cover rooms, walls or cabinet placement, so CV-3 to CV-7 and CV-9 to CV-11 stay open. The owner will send more ORDX files. Recorded in `docs/cabinet-vision/DESK_RESEARCH.md`.

### 2026-11-08: Placeholder office screens, AI design and customize (owner: "add in placeholder Today, Tasks, Clients, and a placeholder AI design animation (with no actual AI design) which then once it's done gets us into the cabinet customization screens")
- **Today, Tasks and Clients** are built as in the Kitchen Studio prototype, inside its app frame (white top bar, side menu that folds). They are **placeholders on demo data** (`src/app/demo-data.ts`, the prototype's made-up clients, calls and tasks), labelled on screen. Ticked and added tasks last only until the page is closed. Joining a call is mocked and says so. The start page (`/`) is now Today.
  - Each demo client has one design job; "Start a design" opens the studio for it (`/studio/?job=<client>`), and its answers, drawings and design are kept in this browser under that job. The client page shows the job's rooms and how far each has got.
- **The AI design step is a placeholder.** An animation runs room by room while a fixed recipe from the prototype lays out each room; when every room is done it moves on to Customize by itself. **No AI is called.** The recipe's numbers are data (`src/modules/designer/data/placeholder-draft.json`, marked PLACEHOLDER); the cabinet types and their sizes come from the catalog. It reads the drawer level, corner insert and garbage choice from the intake; a missing answer is said in the design's notes, never filled in.
- **The customize screens** follow the prototype: a settings pane (Room · Run · Cabinet · Checks) beside a studio-lit 3D view, 40/60. Click a cabinet in 3D or in its run to select it; change its type (within its kind, from the catalog) or width (the cabinet beside it gives or takes the difference); approve it, or approve all after a confirmation. Doors open and close. Checks show the catalog's size checks. Live pricing says it is not connected (no prices exist yet, P-1).
- **PROPOSED (this session, not owner-decided):**
  - ~~**The placeholder design is not in the master copy.**~~ Replaced 2026-11-08: the placeholder now writes placed items into the master copy (see "Placed cabinets in the master copy").
  - The placeholder recipe lives in the Designer module, not AI Design, because AI Design may not import the Designer and Core can't hold its result yet. It is to be replaced by AI Design's real drafts.
  - The customize Checks tab runs only the catalog's size checks, against the colony's catalog (the preview shop has none of its own). Door style, hinge side and other per-cabinet choices aren't carried by the placeholder, so they aren't checked yet.
  - Visual-only numbers for the 3D view (toe kick, counter thickness, upper height off the floor, rough appliance sizes) are in the same placeholder data file, marked as drawing-only and never sent to the shop.
  - The 3D view uses three.js (ARCHITECTURE "Stack"), without react-three-fiber.

- **Customize feedback (owner, 2026-11-08, from screenshots):**
  - **Heights.** Uppers and tall cabinets now reach the client's cabinet height from the design choices (7′, 8′, 10′ or to the ceiling), never above the ceiling, so their tops line up. The cabinet height options record their feet in `intake-v1.json`; "To the ceiling" is marked as such. With no cabinet height chosen, uppers are the catalog's standard height, and the design's notes say so.
  - **The white "star" marks are gone from the 3D view.** They were the dashed marks on cabinets the placeholder put down, and there were too many. Those cabinets are still marked in the panel (a dashed dot in the run strips, "Placed by the placeholder" on the cabinet) and counted in "N placements to review".
  - **Uppers on a cut-away wall are hidden with the wall**, so they no longer seem to float over the room.
  - **A selected cabinet glows gold in 3D** and is outlined, and the Cabinet tab opens with a picture of it.
  - **The panel is drawn, not just written:** each cabinet type has a small front picture (doors, drawers, pull-outs, from the catalog's front data), the run strips show those pictures, the width has − and + buttons in the placeholder's step with the row drawn above it, and the Room tab shows the finishes as swatches.
  - **Checks list each finding once**, with how many cabinets it covers. Only widths are checked; heights and depths in the placeholder are drawing-only.
- **Test data (owner: "save the Design choices and Room Drawing info I've inputted so that I don't have to go through those choices every single time").** Work was already kept in the browser, but separately for each job, so a new client's job started empty. The studio's "Test data" menu now saves a job (answers, drawings and designs) as a test start, loads it into any job (with fresh room IDs, after a confirmation), and downloads or loads it as a file.

### 2026-11-08: Design rules reviewed (owner, design rules review page and chat, 2026-11-07/08)
The owner answered every carried-over design rule on a review page (https://claude.ai/artifact/7vv6Emc6tQgevJ3Pt2Sp8L). The answers are in `src/modules/shop-settings/data/design-rules.json`, each in the rule's note with its date. 82 rules remain: **78 confirmed, 4 declined**, none left unanswered.
- **How the rules are used (owner, 2026-11-07):** the AI designer gets the confirmed rules, the room's walls and cabinet runs, and the client's intake preferences, and drafts the best-fit design and layout. It needs no stop-or-warn setting. That setting matters only in the design tool, when a designer's own change breaks a rule. Broken preferences go on **a running list of design preferences that could be improved**. This replaces S-6's "block or warn" framing.
- **Design tool, per rule:**
  - **Won't let it be drawn (9):** runs overlapping (corner cabinets intersect by design), runs past their wall, gaps between cabinets, the cooktop clearances, the countertop into an appliance opening, anything that opens hitting something, the cabinet over the fridge centred on it, and whatever is over a cooktop centred on it. Owner: "The tool wouldn't even allow it to be drawn".
  - **Error to fix (2):** known site conditions, crown setting the ceiling gap.
  - **Suggestion (36):** every confirmed preference, including the 42" maximum width (HARD-016).
- **Construction stays with the shop's library** (owner: "We will not set our own construction rules in this tool, rather we will use the CV and shop construction rules"). Declined: the 1/8" gap rule as our own rule (CB-A-05) and the 3 7/8" toe kick (use the library's). Door gaps and shelf spacing (CB-FACT-16, CB-FACT-13) are kept for drawing in the visual tool, but the library is the authority: if its numbers differ, the library wins.
- **Visual options mapped to the library:** the 1 1/2" fillers and ends upgrade is a visual upgrade in this tool, mapped to a construction rule in the shop's library. Fronts are drawn grain-matched, and the shop sets its cut list to match.
- **Other answers:**
  - the cooktop clearances apply to the visual tool and to the measurements sent to Cabinet Vision;
  - the stone fabricator and the shop count as one, so the countertop rules stand. The 1/4" projection into an appliance opening applies only to freestanding ranges;
  - crowns set the gap when a ceiling height, cabinets to the ceiling and a crown are chosen;
  - the storage, kitchen and clearance preferences are confirmed as true.
- **Declined:** grain carrying across connected cabinets (PREF-010) and U-shaped vanity drawers (PREF-034: "I'm not sure how we'll program this parametrically").
- **Conflicts settled:**
  - closet-builder's room and run limits are deleted ("it's convoluted");
  - its corner rule now covers only how facing closet runs snap when a run is dragged in the layout step. Kitchen corners keep corner cabinets.

### 2026-11-08: Visual intake (owner, clickable prototype rounds 1 to 8, 2026-11-07/08)
The kitchen outline (`docs/intake/kitchen.md`) was turned into a clickable prototype with placeholder pictures (https://claude.ai/artifact/MW4uLq1CX3qvoejeeaPadW) and reviewed by the owner. It is built at `/intake` (`src/modules/intake/`). The full list of decisions is in `docs/intake/kitchen.md`, "Owner decisions from the prototype". In short:
- **The intake comes before the room drawing** (walls, openings, cabinets and appliances). The home page lists it first, and its last screen leads on to the room drawing.
- **One question at a time with large pictures**, a running summary, and a review per room. Pictures are placeholders until real photos exist.
- **Choices are filtered by earlier answers:** for example, the colour tones are shown in the chosen material and door.
- **Colours are one step:** cabinets (primary), base cabinets, island cabinets (only with an island), counter, and an optional secondary colour with where it goes. Trim and valance colours match the primary or secondary colour, or another standard colour.
- **Defaults the owner set:** no secondary colour; base cabinets match; the island matches the cabinets, or the base cabinets once those differ; 1 of each organizer; inserts in other rooms start at none. No other defaults.
- **Hardware:** handles only, knobs only, handles on doors with knobs on drawers, or knobs on doors with handles on drawers.
- **Garbage and recycling:** yes or no; then under the sink or a dedicated cabinet, and how many slide-outs.
- **Other rooms** (14 types, each once per job) can do one of four things:
  - match an earlier room;
  - coordinate with it (suggested designs from a preset database);
  - contrast with it (likewise);
  - start from scratch.

  The second room is based on the kitchen. From the third room on, matching an earlier room is the recommended path, and coordinate and contrast use a room the client picks. Each room gets its own heights (with "match the kitchen" offered) and its own inserts.
- **Linked rooms:** changing a choice that other rooms match forces a choice: "Match currently linked rooms" (they change too), change only this room (the others keep their design and stop matching), or cancel.
- **PROPOSED (this session, not owner-decided):**
  - the intake uses the room drawing's permissions (`room.view` to see, `room.edit` to answer) until it has its own (IK-16);
  - a typed ceiling height that isn't on a 1/64" mark is refused with a reason, as rule 11 requires (for example 6.3", which is 403.2/64");
  - the suggested designs are worked out from the room they are based on until the preset database exists (IK-13).

### 2026-11-07: Design rules from closet-builder (owner: "bring in all the cabinet design rules")
The owner asked for closet-builder's design rules (layout, spacing, symmetry, aesthetic) to be brought in. They are in `src/modules/shop-settings/data/design-rules.json`: 83 rules, each with its closet-builder ID, the owner's words and date, any lengths, and a status here.
- **12 confirmed** for this platform, because the owner already confirmed them here: smallest widths (8"/8"/12"), the door rules, the ideal 14–16" door, evenly spaced shelves, the 1/16" width step and 3/4" fillers, ends (applied finished at an open end, filler at a wall), fillers as real parts, the dishwasher touching the sink base, the sink centred under a window, the top drawer line carrying across, and the two sign-off gates (appliances confirmed, site measured).
- **2 conflict** with decisions made here, which win: closet-builder's corners (the longest run takes the corner, no corner cabinet) and its closet room limits (12" shortest run, 10–36" deep, 48" tallest minimum).
- **69 are candidates:** carried over but not yet confirmed for this shop. They include the symmetry and alignment preferences and principles (equal widths either side of a focal point, near enough becomes exact, which lines matter most, judge the fronts not the boxes), the 24–32" ideal cabinet width, one cabinet up to 38" rather than two, the 42" maximum, walkways 42–48", islands lining up with runs, the 30" above a cooktop, countertop overhangs, the 3 7/8" toe kick, crowns setting the ceiling gap, and the kitchen and storage defaults.
- **Not imported:** box construction (the shop's library and software engineer it), pricing, closet configurations and the unverified industry standards. The file lists them with the reason.
- **PROPOSED (this session, not owner-decided):** closet-builder's own statuses are kept beside the new one, so a rule it had only as PROPOSED or RAW is still visibly unconfirmed. No rule is applied by the software yet; which ones block and which only warn is still S-6.

### 2026-11-07: The cabinet catalog, from the shop's own Cabinet Vision library (owner, library review)
The colony's Cabinet Vision install (`Solid_11.zip`, catalog "New Catalog") was read and every template put to the owner on a review page. The owner answered the General and "Templates to keep" tabs; the specialty items on the other two tabs are left out for now ("a lot of specialty items which we'll likely end up re-engineering"). Catalog version 1 is built from those answers: `src/modules/catalog/data/catalog-v1.json`, 50 cabinet types.
- **The library holds templates, not fixed products:** example layouts, sizes and construction that stretch to any width, height and depth. The stored size is only the example.
- **Width step 1/16".** One cabinet with a left/right (hinge side) choice, not separate left and right items.
- **Standard sizes:** base height 34 3/4" (the size the shop's library uses most); depths: upper 12", tall 26", vanity 20 3/4". Base depth 23 3/4" is the library's.
- **Smallest cabinet:** 8" for uppers and door-only base cabinets, 12" for cabinets with drawers (confirms closet-builder HARD-015; replaces an earlier 10").
- **Door rules (closet-builder, confirmed):** a door over 20" becomes a pair; a door over 48" tall splits into stacked doors; 1/16" edge gap; each door of a pair is 1/8" short of half; ideal door 14–16". **Over 40 1/4" a section splits into two cabinets with three doors** (42" = 28" two-door + 14" one-door), so a cabinet with doors is at most 40 1/4" wide.
- **Drawers:** the standard top drawer front is 6 13/16" and lines up across cabinets; a single top drawer becomes two side by side when the cabinet is wider than 36". The handle on a door or pull-out below a drawer sits at the height of the middle drawer's handle in a three-drawer bank, not centred.
- **Shelves are evenly spaced.**
- **Ends** are a setting on each cabinet: Unfinished beside a wall or cabinet (with a filler at every wall); an open end gets an Applied finished end by default, or a Finished end by request.
- **Fillers** are cut to fit, a fixed price (not per inch), 3/4" wide by default.
- **Sink base default:** full-height doors with a skirt front, plywood, cut-out bottom and back, with loose full panels to cover the side the plumbing doesn't use. A false drawer front or a tip-out tray is an upgrade. Vanity sinks follow the same rules; the false drawer front on the vanity sink with side drawers applies to that one only.
- **Door styles to start:** shaker with a 2 1/4" frame, slim shaker with a 1" frame, slab.
- **Prices** are per running inch, set later, and kept completely separate from cabinet data.
- **The angled end cabinets are bases** and get a toe kick like every other base.
- Removed: the fluted fillers, the accessible cabinets, the medicine cabinet over a false drawer, the hood shelf, the closet wall cabinet, the hair dryer pull-out and the Altima job items.
- **PROPOSED (this session, not owner-decided):**
  - Templates that differ only by example size or by door count are one catalog item, because door count follows the width rule (for example "Base 1 Door" and "Base 2 Doors" are one "Base, doors"). Left and right versions are one item with a "Left or right version" choice.
  - Option codes (`door_style`, `end_left`…) are stable codes rather than UUIDs; item IDs are UUIDs.
  - Values not known yet are stored as unknown. A cabinet at its standard size passes; any other size in a direction with an unknown limit or step is refused with that reason.
  - The catalog names its shop with a new ID for "The colony shop" until the platform has a shops table.
  - The construction rules above (doors, drawers, handles, shelves, sinks) belong to Shop Settings as design rules. They are recorded here and on each item's notes, not yet as rules the software applies.
  - Buildability checks take one placed cabinet at a time, because the master copy has no placed cabinets until step 1b-items.

### 2026-11-06: Rough layout: cabinet runs and appliances (owner, from the clickable mockup, rounds 1 to 4)
After walls, doors and windows, the person marks where cabinetry goes and where the appliances will likely sit, in about a minute. It is not placing cabinets: the AI draft (OA-3) fills the runs later. Researched against IKEA, Lowe's, Mozaik AutoFill, Coohom and Archisketch; the owner chose "tap a wall / drag along a wall" for runs and an appliance tray, and dropped layout-shape templates and a work-triangle hint.
- **Who uses it:** a designer or salesperson on an online call, and the client on their own. It must explain itself and work with a mouse and with touch.
- **Run types:** base only, upper only, base + upper, base + upper + pantry, all pantry. A run can be split so parts have different types; the two parts share a divider that moves both.
- **Where runs snap:** run ends stay **3" clear of doors, passthroughs and windows**. Where a run meets the run on the next wall, its end snaps into the corner or **3", 6" or 9" clear** of that run's front.
- **Corner cabinets:** where runs on two walls meet in the corner, a corner cabinet is needed: base where both have bases, upper where both have uppers. Shown, not stored.
- **All pantry stays clear of windows:** the stretch in front of a window, plus 3" either side, becomes base cabinets.
- **Islands:** floating walls (A-21) with a run on them. Island depths: **15", 27", 36", 42", 48"**.
- **Appliance tray and standard widths:** fridge 36"; range 30" or 36"; cooktop 30" or 36"; wall oven 30"; sink 32"; bar sink 24"; dishwasher 24"; microwave 24"; wine fridge 24". Ranges and cooktops always come with a hood (replaced 2026-11-09: the designer chooses a hood, millwork hood or cabinet; see round 3). Appliances are only placed by the person (drag, or tap then tap the plan); nothing drops in on its own.
- **Appliance rules:** a sink dropped near a window centres under it. Placing a sink adds a dishwasher right beside it when the plan has none yet; the dishwasher can be moved to the sink's other side and moves with the sink. A fridge gets a full 24"-deep upper above it. An appliance dropped on a bare wall gets a short run under it.
- **Controls match the wall drawing:** click selects, Shift+click adds, Delete removes, Ctrl/Cmd+Z undoes, Esc cancels, scroll zooms, Space+drag pans, Alt stops snapping, click a length to type it. Run and island options sit in a "Cabinet runs" frame on the right; appliance options pop up next to the appliance.
- **Still to confirm:** the hood is assumed to match the width of the range or cooktop under it.
- **Round 5 fixes (owner, 2026-11-06):** a selected door or window no longer shows its distance from the wall's start (it is placed by dragging, and the plan's measurement chain shows where it is), and a door shows no sill height. The upper corner cabinet is drawn as an L along both walls, as deep as the uppers, matching the base corner's reach.
- **Round 5: one step-by-step panel (owner, 2026-11-06, from the round 5 mockup).** Researched against Cedreo, Floorplanner, RoomSketcher, IKEA and NN/g: revisitable steps, not a locked wizard.
  - The top toolbar is gone. The right panel is an accordion of four steps: **1 Walls · 2 Openings · 3 Cabinets & islands · 4 Appliances**. A step's options open directly under it, steps already visited show a tick, and there are no Next or Back buttons.
  - **Walls:** Select | Room wall | Floating wall (Draw walls and Floating wall merged). **Openings:** Door | Window | Passthrough tiles (the three Add tools merged).
  - Picking something on the plan opens the step it belongs to, with its options there.
  - Undo and redo sit on the plan beside zoom and Fit, on every step.
  - Islands show their size while being dragged and snap to the depth list; dragged over a floating wall with nothing on it, an island snaps onto that wall.
  - The appliance tray has line icons. On a phone the panel is a bottom sheet that folds down to see the plan.
- **Round 6 (owner, 2026-11-06):**
  - **Dragging fixed.** A drag that starts at a wall now goes the way it's moving: along the wall draws cabinets, out into the room makes an island (it used to try to draw a run of zero length and do nothing). Grabbing cabinets and dragging them along the wall slides them, keeping their length, with their appliances (it used to only extend them).
  - **Checks sit in the header:** one line ("No problems found" or "N problems"); the list drops down from it and opens by itself when a new problem appears.
  - **"What gets saved" is removed** from the screen (it was a build-checking tool: the raw master copy, with Download and Load).
  - **Click the measurement beside a door or window** to type a new distance: the opening slides over, keeping its width.
- **Round 7 (owner, 2026-11-07):**
  - **Drag from a corner.** A drag that starts in a corner (where two walls' cabinet zones meet, even on top of the first wall's run) goes along whichever wall it follows, drawing a run on that wall from the corner. It used to make an island whenever the drag went across the wall that was picked first.
  - **No tiny cabinet beside a window.** When a run that stops at (or just past) a window's 3" clearance is made all pantry, the sliver of base left before the window (3" when split at the window's edge) is not made: it joins the run beyond it, already in front of the window, or, with nothing there, is left as the 3" gap. It stays only if an appliance stands on it.
  - **No tiny upper beside a window either** (follow-up, from the owner's screenshot). The base + upper run in front of a window, between two pantries, was still drawing a 3" upper either side of the window. Uppers now skip windows and leave out any piece shorter than the minimum run (9"), the same rule as base pieces. The base cabinets still run the whole length.
  - **9" minimum run approved** (owner, 2026-11-07): no base or upper piece shorter than 9" is made. No longer PROPOSED.
  - **Run options pop up on the plan,** next to the selected run, the same way as an appliance's (type, length, depth, Split, Delete; an island's depths). The side panel keeps only the how-to and Add island. The pop-up never covers the selected run; it takes the spot beside it (outside the wall, in front of it, or to the side of the room) that covers the least of the other cabinets and the room. Both pop-ups have a × to close them.
  - **A sink can sit off centre under a window** (owner, 2026-11-07). Dropped from the tray near a window, it still centres. Dragged, it stays where it is put, and snaps to the window's centre only when brought within 3" of it (more when zoomed out, so it is easy to hit); Alt/Option turns that off. The 3" is a pointer setting, not a business value.
  - **Notice when a sink is NOT centred** (owner, 2026-11-07). A sink in front of a window but off centre shows a yellow notice saying by how much ("…it is 8" off centre."). A centred sink shows no notice (it used to say "Centred under the window.").
  - **Click an open step to fold it.** Clicking the open step's heading in the right panel closes it.
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
  - new runs start as base + upper, 24" deep (upper only 12"); uppers on a base + upper run are drawn 13" deep; island runs start as base only;
  - "Add island" makes a 72" × 36" island;
  - a fridge or wall oven is kept out from in front of a window; a wall oven dropped on a bare wall gets an all-pantry run.
- **PROPOSED:**
  - the `core/` / `platform/` split, and the master copy stored as versioned JSON with the named writers (ARCHITECTURE);
  - ~~appliance placements added to the master copy (DATA_MODEL "core").~~ Decided 2026-11-06 with the rough layout (see "Decided"). Dimension provenance was approved on 2026-11-05.

### From the catalog (2026-11-07)
- **CAT-1 Size limits not known yet.** For most cabinet types the catalog only knows the standard size. Each needs, from the shop: the smallest and largest **height** and **depth**, and the steps they change in; the largest width of drawer-only cabinets; and the width limits of corner cabinets, talls, fillers, panels and shelves. Until then only the standard size passes. `src/modules/catalog/README.md` lists them by item.
- **CAT-2 Hinge side.** A cabinet whose width makes one door needs a hinge side. Should the hinge side be asked only then (a rule from the door width), or always?

### From the design-rule checks (2026-11-08)
Five confirmed rules are now checked in the design tool (HARD-014, PREF-011, PREF-012, PREF-013 and PREF-023; see `src/modules/shop-settings/README.md`).
- ~~**DR-1 Islands lining up (PREF-012).**~~ Answered 2026-11-09: "if it's within 5 inches of lining up, the design should strongly try to line it up by resizing and placing cabinets." Recorded as the rule's `line_up_within`.
- ~~**DR-2 Fixtures in line (PREF-013).**~~ Answered 2026-11-09: "a strong preference that they are 100% lined up". There is no "roughly": any miss is a suggestion.
- **DR-3 Island fixture centred (PREF-014).** Partly answered 2026-11-09: "if it's close to being centred, it should be 100% centred. It's better that it's off centre than being simply just close to being centred." **Still open: what distance counts as "close"?** For example, is it the same 5" as islands lining up (DR-1)? Until then PREF-014 is not checked.
- ~~**DR-4 Walkways (PREF-011).**~~ Answered 2026-11-09: measured from the countertop edge; the 36" and 42" minimums also apply between cabinets and a bare wall.
- **PROPOSED (this session, not owner-decided):**
  - HARD-014 is checked as "an all-pantry run stands in front of a window", from the owner's rough-layout rule (2026-11-06). Only actual overlap counts; the 3" clearance stays a drawing rule in the designer.
  - PREF-023 flags any sink in front of a window that is not exactly centred, the owner's own notice rule (2026-11-07). Only `sink` counts, not the bar sink.
  - The countertop edge for walkways is the run's front plus PREF-008's 1" overhang. The run's depth is taken as reaching the cabinet fronts. Every run with base cabinets has a countertop, except all pantry; islands get the 1" on both sides. Seating overhangs on islands are not in the rules yet.
  - The 48" walkway maximum applies only between two cabinet runs, not to a bare wall (the owner extended only the minimums).
  - PREF-013's "back-wall range" is a `range` on a wall parallel to the island; a wall cooktop is not counted.

### From the owner's workflow (2026-10-27)
- **CV-2 More than one colony.** Will each colony have its own Cabinet Vision library (so its own catalog mappings), or will all colonies share one library? And does each have its own prices?
- **SM-1 Measuring after sign-off.** The client signs off on a design drawn from rough dimensions; the site measure may then change sizes. The earlier plan (2026-10-24) said small within-tolerance differences are absorbed without client re-approval or repricing. Does that still hold? If so, what tolerance? Above it, does the client re-sign?
- **PAY-1 "Paid".** Does "paid" mean paid in full, or a deposit? closet-builder had a deposit to commit and the balance before production. Which payment tool?
- **R-1 Photorealistic.** A realistic 3D view the client can turn in the browser, or rendered still images (slower, more realistic), or both? This is the most expensive part of the editor; the answer sets its cost.
- **DL-1 Deadline ticker.** How is the "everything in by" date worked out? From the colony's production lead time (as data) and the promised delivery date? Who sets the delivery date?
- **PO-1 Automatic ordering.** Who places the orders (you or the colony), which suppliers, and how does each take orders (email, portal, API)? Do "materials" mean sheet goods sent to the colony?
- **MSG-1 Channels.** Which email (Gmail?), which texting service, and which meeting tool's transcripts? Do reminders go by text, email or both?
- **IK-1 to IK-14** Kitchen intake questions, in `docs/intake/kitchen.md` (IK-2 answered 2026-11-08; IK-7 partly).

### From the visual intake build (2026-11-08)
- ~~**IK-15 AI Design reads an older intake shape.**~~ Answered 2026-11-09: the brief reads `intakeHandover` (see "AI designer: how it works"). `ai-design` (`model/intake.ts`) was written from the 2026-10-27 outline, before the prototype reviews. It expects `door_colour`, an island yes/no and separate island material, tone and door style. The owner replaced these with the colours step (cabinets, base, island, counter, secondary), four hardware combinations, and garbage location and slide-outs. Most other question codes match. AI Design needs a session to read the intake's `intakeHandover` instead. This session stayed inside `intake` (rule 1).
- **IK-16 Intake permissions.** The intake uses `room.view` and `room.edit` for now. Should it have its own (for example `intake.view`, `intake.edit`), and should clients answering on their own get only those?
- ~~**IK-17 Ceiling height in two places.**~~ Answered 2026-11-08 (see "The design studio"). The intake asks for a rough ceiling height and the room drawing asks again. Should the intake's answer fill in the room drawing's starting value? The room drawing can't read the intake today (ARCHITECTURE: `designer` may not import `intake`), so this needs the app to pass it, or a change to the dependency table.

- ~~**IK-18 A drawn island with a layout that has none.**~~ Answered 2026-11-09 (owner): a peninsula does not get the island questions, and a drawn island with a galley, L or U layout is not refused. The brief still refuses an island layout with no island drawn. The question was: the brief refuses a layout with an island (L-shape with island, double island) when the drawing has none. The other way round can't be checked yet: a peninsula is drawn as a floating wall too, and the intake doesn't ask the island questions (colour, panels) for it. Should a peninsula get the island questions? And should a drawn island with a galley, L or U layout be refused?

### From the AI designer plan (2026-11-09)
- ~~**AD-1 The upper over a fridge.**~~ Answered 2026-11-09 (owner: "sounds good"): it stays a blocker on drafts until the shop names the cabinet and depth. The room drawing gives it 24" deep, but the catalog has no upper at that depth: `upper_no_shelf` is 12" deep, and its depth limits are not known (CAT-1). Until the shop says which cabinet and depth to use, a draft shows it as a blocker.
- **AD-4 Corner cabinet legs.** A 36" L-shaped corner base reaches 36" along both walls, but the room drawing shows only the run depth (24") in the corner. Appliances drawn within those 36" have to be moved by the builder. Should the drawing show the real corner legs? (2026-11-10: corners are now L-shaped by default, so this matters more. The placeholder moves a sink base and dishwasher clear of the corner and reports any other appliance drawn into it.)
- **AD-6 Which part is the fridge panel?** (2026-11-10) The owner wants a 3/4" panel, 26" deep and full height, on each side of every fridge. The shop's library has no fridge panel, so the placeholder drafts it as the Tall filler (3/4" x 84" x 23 3/4") at 26" deep and the cabinets' full height. Its depth and height limits are not known (CAT-1), so the catalog's size check flags it until the shop says which part (and which library template) to use. PROPOSED: the Tall filler.
- **AD-5 How high uppers start.** No rule sets the space between the counter and the uppers. Today it follows from the client's cabinet height and the upper's standard height (30" or 36"). Is there a minimum, or a usual height?
- ~~**AD-2 Moved appliances and the client.**~~ Answered 2026-11-09 (owner): "A note on why it moved in the builder and final client approval is enough." The client does not re-confirm a move separately.
- ~~**AD-3 Supabase access.**~~ Answered 2026-11-09: the platform's database is the Supabase project **cabinet-pm** (`https://btuwrakpnlutemfdxnve.supabase.co`, organization "Gesell/gray", region ca-central-1, Canada), chosen by the owner. The connector reaches it, so database changes are applied from these sessions and reviewed in a pull request. The earlier link (`kpbcqnnsjtdafxvvarfw`) is not used. The Netlify variables must hold this project's URL and publishable key.

### From cabinet ends (2026-11-11)
- **END-1 Which side is "left"?** The catalog's Left end and Right end don't say which way they are seen. PROPOSED: as seen standing in front of the cabinet, facing its doors (the usual cabinet convention, also how the parked layout builder read it). To confirm with the shop before the import file is written; if it's the other way, only `endOption` in `src/modules/designer/model/cabinets.ts` changes.
- **END-2 Ends of an L-shaped corner cabinet.** The catalog asks for Left end and Right end on the corner cabinets, but which leg is which, and whether a corner cabinet's end can ever be open, isn't decided. The 3D view has never drawn ends on them. Until decided, the builder leaves them unset and the Checks tab lists them as choices to make.
- **END-3 An island's waterfall or detailed sides.** Where an island's end is open, the cabinet is saved with an Applied finished end, and the 3D view draws the island side as chosen in the design choices (waterfall stone, or a detailed panel over the end). Is a waterfall or detailed side the same shop part as the Applied finished end, or another part with the cabinet's end Unfinished behind it?

### From the owner's second real-job review (pull request #57, 2026-11-10)
- **PR-57a Open doors and the autosave.** The fix (the 3D view rebuilds only when the room or its look really changes) is tested in code, but no one has checked it on the live site with the real autosave running. Unverified until someone opens a saved job on the live site, waits through a few autosaves, and sees Open doors stay open.
- **PR-57b The filler beside a hood, up to 1 1/2".** When one side of a hood is a little longer, up to 1 1/2" becomes a filler at that side's far end (`placeholder-draft.json` `fill.flank_filler_max`). PROPOSED by a session; not approved by the owner.
- **PR-57c Bathroom vanity choices.** Vanity, drawer over doors for most bases; the vanity sink; the vanity filler; 3-drawer vanities for Maximum drawers (`placeholder-draft.json` `cabinets.bath`). PROPOSED by a session; not approved by the owner.

### From the spec (section 11)
- **S-1** Which Cabinet Vision versions do target shops run, and does ORDX behave the same across them?
- **S-2** How much room placement and elevation detail does ORDX keep on import?
- **S-3** Which read-back source is most reliable: ORDX export, SQL database, or reports? If it's the database or files on the shop's computer, do we need a small helper app there?
- **S-4** Is there a Cabinet Vision or Cyncly partner program with documentation or support? Licensing and terms must be reviewed before Phase 3.
- ~~**S-5**~~ = U-1, answered 2026-11-05.
- ~~**S-6** Which design rules block and which only warn, by default?~~ Answered for the design rules (owner, 2026-11-08): each confirmed rule says whether the design tool won't let it be drawn, shows an error, or adds a suggestion; see "Design rules reviewed". The AI designer just follows them. Still open: the push gate's own conditions are separate (OA-5).

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
  - a cabinetry knowledge base (`docs/cabinetry-intelligence/`) that already separates hard design limits from preferences. That is close to the spec's block-vs-warn design rules, and could seed Shop Settings. *Answered for the design rules (owner, 2026-11-07):* brought in; see "Design rules from closet-builder".

  Should any of these be ported (Phase 4–6), or should this project start clean?
- ~~**C-2 Look and feel.**~~ Answered 2026-11-08: the prototype's look, closet-builder's design system (see "The design studio"). closet-builder has an owner-approved design system (Geist and Newsreader fonts, its own tokens, 2026-10-07/08). `docs/ux/UX_BRIEF.md` has a different palette. Which one applies here?
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
