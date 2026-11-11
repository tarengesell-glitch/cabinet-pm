# designer

**This module holds the builder the app runs** (the placeholder design, `model/placeholder-draft.ts`) and the 3D view. The live path, rule locations and tests: `docs/PROJECT_MAP.md`.

Room capture (walls, angles, ceiling height, openings, obstacles, utilities) and visual editing of the layout. Draws only from the master copy, offers only the shop's catalog items, shows validation live, marks AI-placed vs designer-changed items.

See `CLAUDE.md` in this folder for the rules.

## Decided
- Room drawing (walls, doors, windows) is our own tool on react-konva, drawn only from the master copy (DECISIONS 2026-11-05).

## What exists: the room drawing preview (2026-11-05)
Open it at `/rooms/preview` (`npm run dev`, then http://localhost:3000/rooms/preview).

- **Start a room:** a name and the ceiling height. Walls are as high as the ceiling and start at the standard 5 1/2" thickness, which can be changed.
- **Walls:**
  - Draw them on the plan: tap corner to corner, or point the way, type a length and press Enter. Corners snap to existing corners, whole inches and 45°, and the view stays still while drawing.
  - Corners are drawn joined (mitred). Labels go outside and doors swing inside, whichever way the room was drawn.
- **Floating walls (islands and peninsulas):** the "Floating wall" tool draws one line (click start, then end, or type a length). It is shown dashed, with no thickness, no doors or windows, and no unmeasured/confirmed colour. A selected wall can be switched between Room wall and Floating wall.
- **Snapping while drawing:** onto an existing corner, else onto any point along an existing wall, else 45° and whole inches.
- **Wall handles:** select a wall to see a handle at each end and one in the middle.
  - Drag an end to change the wall's length along its own line. The wall joined at that end moves across with it, keeping its angle and length, and the next wall stretches. Doors and windows stay where they are in the room.
  - Hold Option/Alt while dragging an end to move the corner freely (for angled walls).
  - Drag the middle to slide the wall sideways; it keeps its length and its neighbours stretch.
  - The move is saved on release as one undo step, and Escape cancels it. Walls whose length changes become unmeasured.
- **No walls on top of each other:** drawing or moving a wall back over another is refused with a reason.
- **Typing a length on the plan:** click a wall's length, type the new one, and press Enter (Esc cancels).
- **Edit a wall:** its length and thickness. Typing a length moves the far end along the wall's line, as dragging an end handle does.
- **Moving around the plan** (see `docs/ux/INDUSTRY_REVIEW.md`):
  - the mouse wheel zooms at the cursor;
  - on a trackpad, two fingers move the plan and pinch zooms;
  - middle-button drag or Space + drag pans;
  - double-click the middle button, press Shift+1, or press Fit to see the whole room.
- **Edge scrolling:** while drawing walls or dragging a handle, move the cursor near the plan's edge and the plan scrolls that way.
- **Drawing walls:** tap corner to corner, or point the way and type a length, then press Enter. Right-click or Esc finishes.
- **Walls are lettered A, B, C … in circles**, as kitchen drawings do.
- **Box select:** dragging left to right picks walls fully inside the box; right to left picks anything it touches.
- **Doors, windows and passthroughs:** choose the tool and move onto a wall; a ghost shows where it lands, and a click places it.
  - A selected one can be dragged along its wall or onto another wall, and resized from its end handles.
  - A door can be set to Left hand / Right hand and Swings in / out, judged from outside the door per the US convention.
- **Selecting several walls:**
  - Drag a box on an empty part of the plan; every wall it touches is selected.
  - Shift-click a wall to add it to the selection, or remove it.
  - Several selected walls can be deleted together, or given one thickness.
- **Delete key:** removes what is selected (walls with their doors and windows, or one opening), except while typing in a box. On a Mac it's the "delete" key. One undo brings it all back.
- **Sizes:**
  - Feet and inches are exact. Anything not on a 1/64" mark is refused with Core's reason.
  - "mm" sizes are rounded (U-2), and the mm value is kept.
- **Two states:** unmeasured walls are pastel red, confirmed walls black. Typing or dragging never confirms a size; the Confirm button does. The plan shows the state by colour only (less is more); the panel says it in words.
- **Measurements:** a wall with doors or windows shows a chain (corner → opening edge, opening width, … → corner) and the overall length further out. Other walls show only the overall.
- **Lengths** are shown in inches only (`68 11/16"`). Approximate ones (slanted walls) are rounded to 1/16" and marked ≈.
- **Live checks:** Core's master copy format check, wall checks and rough-layout checks run after every change. They sit in the header as one line; the list drops down from it (and opens by itself when a new problem appears). Tap a problem to select it.
- **Measurements beside an opening** can be clicked to type a new distance: the door or window slides along, keeping its width.
- **Also:**
  - undo and redo;
  - two example rooms;
  - (The "What gets saved" panel was removed, owner 2026-11-06.)

## Rough layout: cabinet runs and appliances (2026-11-06)
**Steps (round 5):** the right panel is an accordion of steps (`ui/Steps.tsx`): 1 Walls (Select | Room wall | Floating wall), 2 Openings (Door | Window | Passthrough tiles), 3 Cabinets & islands, 4 Appliances. A step's options open under it, and clicking the open step folds it; picking something on the plan opens its step. Undo and redo sit on the plan with zoom and Fit. On a phone the panel is a bottom sheet. Islands dragged over a floating wall snap onto it (`addIslandOnWall`).

**On screen:** the Cabinets & islands and Appliances steps (`ui/LayoutCanvas.tsx`, `ui/LayoutPanels.tsx`, `ui/layoutEdits.ts`).
- **Runs:** tap a wall to fill it, or drag along it for part of it. A drag that starts in a corner goes along whichever of the two walls it follows, from the corner, even when it starts on the other wall's run. Run ends snap as below; Alt turns snapping off.
- **Selecting:** click a run to select it, Shift+click to add more. A selected run has end handles and a square depth handle.
- **Splits:** the divider between split parts has a handle that moves both.
- **Corner cabinets:** shown as a square with a cross, one for bases and one for uppers.
- **Islands:** drag on the open floor for an island (its depth snaps to the list), or press "Add island". Drag an island to move it; its end handle sets its length.
- **Run options:** a selected run's options (type, length, depth, Split, Delete; an island's depths are buttons) pop up next to it on the plan (`RunPopover`). The plan places it beside the run, never over it, choosing the spot that covers the least of the other cabinets and the room. With several runs selected it changes them all. A × closes it.
- **The right side:** the "Cabinets & islands" step holds the how-to and Add island. The "Appliances" frame holds the tray: drag one onto the plan, or tap it and then tap the plan. The drag uses pointer events, so it works with a mouse, a finger or a pen.
- **Appliance options:** a selected appliance's options (width, what goes over a range or cooktop: Cabinet, Appliance hood or Millwork hood, starting as Appliance hood; swap the dishwasher's side, Delete) pop up next to it, on the room side, with a × to close.
- **Same keys as walls:** Delete, Ctrl/Cmd+Z, Esc, zoom and pan. The rough-layout checks run live with the wall checks.

**Measurements are inside, wall face to wall face** (owner, 2026-11-09). The plan's wall labels, the door and window chains, the placing ghost and the panel show the inside length (Core `insideLength`), and a typed length sets it (Core `centreLengthFor`); walls are stored by their centre line. Standard wall thickness: 4 1/2".

**Distances** (owner, 2026-11-09): a selected appliance shows its distance each way along its wall and from its front to the opposing wall; a selected island shows each side's distance to the nearest wall face (Core `distanceToFace`; drawn by `ui/LayoutCanvas.tsx`, with the shared `ui/Dimension.tsx`).

**Kinds of room** (owner, 2026-11-09): `data/layout-rules.json` `room_sets` gives each kind of room its tray, its starting run kind and its base depth. Bathrooms (`bath`) offer a vanity sink, a double vanity sink, a toilet, a tub and a shower, with base-only runs 21" deep. The studio passes the kind (`StudioRoom.roomSet`), and `rulesForRoom` picks the rules. A fixture with no `run_when_alone` stands on the floor: no run is made under it, and Core's run check leaves it out when told which kinds those are (`freestanding_kinds`).

**Rules** are in `model/layout.ts`. The room geometry underneath (spans, corners, where uppers go) is Core's `layout/room-geometry.ts` since 2026-11-09, so the AI designer uses exactly the same; `model/layout.ts` keeps the same names and passes in the numbers from `data/layout-rules.json`.
- **Positions:** measured along the wall's centre line, like doors and windows.
- **Where cabinets stand:** against the wall's inside face, and only as far as the inside corners (`insideSpan`). The 3", 6" and 9" corner gaps are measured from there. Its rules are data in `data/layout-rules.json`, read by `model/layout-rules.ts`, which fails loudly at start-up if the file is bad. Entries marked PROPOSED there are mockup defaults the owner has not confirmed.
- **Runs:** `fillWall` (tap a wall) and `drawRun` (drag along it) go around doorways with 3" clearance and around existing runs. `snapRunEnd` snaps to corners, to 3/6/9" clear of the run on the next wall, 3" clear of openings, and other run ends.
- **Changing runs:** `setRunEnd`, `setRunLength`, `setRunDepth` and `setRunKind`. Upper only drops the appliances on it and says so; all pantry keeps 3" clear of windows, and that stretch becomes base; a base sliver shorter than the minimum run at the run's end (from a split at the window's edge) joins the run beyond it, or is left as the gap. `splitRun` cuts at the middle, moving clear of windows and appliances, and `moveJoint` moves the divider between two parts. `deleteRuns` also removes appliances left with no run, and says so.
- **Uppers on a base + upper run:** `upperPieces` skips windows and the stretch over a fridge, and leaves out any piece shorter than the minimum run (so no 3" upper between a pantry and a window).
- **Corners:** `cornerCabinets` lists the corners where runs meet, base and/or upper. They are shown, not stored.
- **Appliances:**
  - `planAppliance` is the ghost; `placeAppliance` and `moveAppliance` do the drop.
  - Appliances stay out of doorways and corner squares, and a fridge or wall oven stays out from in front of windows.
  - A sink dropped near a window centres under it. Dragged, it can sit off centre: it snaps to the window's centre only when brought within 3" of it (more when zoomed out), and never with Alt held. A sink in front of a window but not centred under it shows a yellow notice saying how far off centre it is (`offCentreNotice`); a centred one shows none. A sink brings a dishwasher when the room has none; the dishwasher moves with it, `flipPartner` swaps its side, and dragging it away unties it.
  - Dropping on a bare wall adds a short run.
  - Also `setApplianceWidth` (standard widths only) and `deleteAppliances`.
- **Islands:** floating walls (A-21) with one run: `addIsland`, `moveIsland`, `resizeIsland` (depth from the island list). Delete one as a wall.

## In the design studio (2026-11-08)
The app's design studio (`/studio`) shows the room drawing as its second step, one drawing per room of the design choices (DECISIONS "The design studio"). `RoomCapture` takes a `studio` room: its key (the intake's room ID, also where the drawing is kept), its name, and the rough ceiling height. A room with no drawing yet starts at once from those, ceiling unmeasured. The studio's header shows the job, rooms and mocked user, so the drawing's own header drops the title. `roomDrawingStatus(key)` (contract) tells the studio how far each room has got.

The controls and behaviour are unchanged. The look follows the owner's Kitchen Studio prototype (DECISIONS C-2): the shared tokens, gold for what is selected, navy for handles, drawing and "you are here". The plan's colours are in `ui/theme.ts`, because the canvas can't read CSS variables.

## The placeholder AI design and the customize screens (2026-11-08)
- `model/placeholder-draft.ts` is a **placeholder for the AI design step**: no AI, a fixed recipe from the owner's prototype. It fills each cabinet run with catalog cabinets: corner cabinets where runs meet, a sink base under the sink, the dishwasher and other appliances in their spots, cabinets made to fit each space (equal widths on the catalog's 1/16" step, a filler only where a space is too narrow for a cabinet), uppers that skip windows and stop for the hood, a deeper upper over the fridge, whatever the designer chose over a range or cooktop (an appliance hood, a millwork hood drawn as a box, or a short cabinet hung from the top line; owner, 2026-11-09), and drawer banks by the drawer level. The recipe's numbers are in `data/placeholder-draft.json` (marked PLACEHOLDER). Tested in `__tests__/placeholder-draft.test.ts`.
- **Owner fixes after trying a real job (2026-11-10; DECISIONS, same date):**
  - L-shaped 90-degree corner cabinets wherever runs overlap, drawn as an L in 3D;
  - a finished back panel on every island;
  - the dishwasher touching the sink base and drawn once, as a flush stainless door under one continuous counter;
  - 2" clear each side of a hood, with the same width of upper either side;
  - the cabinet over a fridge 2" above it;
  - a full-height 26" panel on each side of every fridge (drafted as the Tall filler until the shop names the part, AD-6);
  - a tight outline for a selected cabinet;
  - appliances that run into a corner or past their run are drawn and reported, never skipped.
- **Round 2, the same day (a real kitchen; DECISIONS "2026-11-10: Fixes after trying a real job, round 2"):**
  - **widths made to fit the space**, on the 1/16" step, not 3" steps with fillers (`fill.width_step`);
  - the hood's 2" clear space and the **equal uppers either side (PREF-019)** now work when the range stands in a run of its own; the uppers either side are one width, and the **base beside the range is sized so its edge lines up with the upper above it**. When one side is a little longer, up to 1 1/2" of it is a filler at that side's far end, so each side keeps one cabinet (`fill.flank_filler_max`, PROPOSED);
  - **bathrooms use the vanities** (`cabinets.bath`, PROPOSED), so the cabinet types offered in Customize are the vanity types;
  - in 3D: **applied finished ends from the floor** on every end with nothing beside it (beside a range, an island end), **toe kicks in the cabinet's door finish**, **one counter per stretch of touching cabinets** (no breaks at the dishwasher or on the island), the **island back panel and sides drawn as chosen** (matching door panels lined up with the cabinets in front, shiplap; detailed or waterfall sides), **brighter light**, a camera that **moves** (right-drag, Shift-drag, two fingers, arrow keys), **zooms toward the pointer** and **turns around a double-clicked point**;
  - **Open doors** no longer starts over and over: on the live site the autosave re-renders the studio every few seconds, which rebuilt the 3D view and reset the doors. The view now rebuilds only when the room or its look really changes, and doors keep their angle across a rebuild. Tested in code only: not yet checked on the live site with the real autosave (DECISIONS PR-57a).
  - Tested in `__tests__/placeholder-draft.test.ts` and `__tests__/stage3d.test.ts`, on the real kitchen's walls (`__tests__/real-kitchen.ts`, no client details).
- Its layout is written into the room's **master copy as placed items** (Core schema 2; `model/cabinets.ts` turns it into `PlacedItem`s, `ui/placeholder-store.ts` saves it, with job status `ai_draft`). Customize reads and saves the master copy; `cabinetViews` works out each cabinet's run and layer, plus the appliances and hoods, every time. The room drawing's checks include Core's item checks.
- `ui/Customize.tsx`: the settings pane (Room · Run · Cabinet · Checks) and `ui/Stage3D.tsx`, the studio-lit 3D view (three.js). Cabinet heights and depths come from the catalog, finishes from the room's design choices. Cabinets the placeholder put down carry a dashed mark until a person changes or approves them.
- `ui/FrontIcon.tsx`: a small front picture of a cabinet type, from the catalog's front data, used across the customize panel.
- Heights: every upper and tall cabinet reaches the design's top line (`upperTop`), from the client's cabinet height.
- `ui/PlanThumb.tsx`: a small plan of a drawn room, for the studio's AI step and the client page.
- Contract: `draftRoom`, `exportRoomData` / `importRoomData`, and the `DraftPreferences` type. Screens: `Customize`, `PlanThumb`.

### Cabinet ends (2026-11-11)
- **One decision, saved on the cabinet.** `model/ends.ts` decides each cabinet's `end_left` / `end_right` from the layout, by the decided rule in `data/placeholder-draft.json` "ends" (DECISIONS 2026-11-07, CB-FACT-10): unfinished against a wall, a cabinet, a panel or filler, or a corner cabinet's leg; an applied finished end where nothing is beside it (beside a range or a window, an island's ends). The design step saves them with the cabinets. The 3D view only draws what is saved (`finishedEnds` in `ui/Stage3D.tsx`), and the counter overhangs only past a saved finished end with no appliance beside it. On the real kitchen the drawing is unchanged.
- **Left and right** are as seen standing in front of the cabinet, facing its doors (PROPOSED, DECISIONS END-1).
- **Not set:** L-shaped corner cabinets' ends (END-2); the Checks tab still lists them as choices to make. Fillers, panels and the dishwasher opening have no end option.
- **After a layout change** (a width, a type, a run laid out again) an end is worked out again only while it still follows the rule; an end that differs (a finished end by request) is kept, and every other choice on the cabinet stays.
- **Older designs** (saved before ends were) are not changed on opening: Customize says how many cabinets have no saved ends (the 3D view shows no finished ends on them) and sets them only when someone presses "Set their ends from the layout". Ends that differ from the layout, for example after the room drawing changed, are listed the same way with "Update them to match the layout".
- Tested in `__tests__/ends.test.ts` (the real kitchen as before, walls, cabinets, the fridge panel, the range, the island, a turned room, layout changes, older designs, saving and opening again), `__tests__/stage3d.test.ts` and `e2e/studio.spec.ts`.

## What the preview does not do yet
- **The browser keeps the working copy** (`localStorage`). Inside the design studio, the app saves it to the shared database as you work (2026-11-09, `src/app/sync/`); the standalone room preview (`/rooms/preview`) still keeps it in this browser only, and says so. If the browser won't store it, a red banner says the work isn't being kept.
- **Who changed what:** `saveRoom` and `draftRoom` take the signed-in person's ID for the room's history (the preview user without the database).
- **`roomMasterCopy(roomKey)`** (contract): a room's master copy as kept in this browser, upgraded and checked exactly as the room drawing does when it opens it. The studio saves this to the shared database, so a room drawn by an older version goes up in today's format (found on the live site, 2026-11-09).
- **No sign-in.** The user and shop are **mocked** (`PREVIEW_USER`, `PREVIEW_SHOP` in `src/platform/`) and labelled on screen. Permissions are still checked with `can()`.
- **No alerts table yet.** Refusals show next to the field; they are not written to an alerts table.
- **No cabinets yet** (step 1b-items). Obstacles from loaded files are shown but can't be edited, and you can't move corners by dragging.
- **No door swing direction is stored yet.** The plan draws doors swinging into the room from the hinge at the wall's start side.
- **One room at a time.**

## Code
- `model/editor.ts`: pure editing actions on the master copy (unit-tested in `__tests__/editor.test.ts`).
- `model/standard-sizes.ts`: reads and checks `data/standard-sizes.json`. A bad file stops the app with a plain reason.
- `upgradeStoredDraft` updates rooms saved by an older preview (for example, dropping the old wall height) and says so on screen.
- `ui/`: the screen (`RoomCapture`), the plan (`PlanCanvas`, the only place that flips screen Y to room Y), the panels and `SizeField`.
- `ui/index.ts` is what the app imports.
