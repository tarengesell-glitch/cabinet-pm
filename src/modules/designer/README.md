# designer

Room capture (walls, angles, ceiling height, openings, obstacles, utilities) and visual editing of the layout. Draws only from the master copy, offers only the shop's catalog items, shows validation live, marks AI-placed vs designer-changed items.

See `CLAUDE.md` in this folder for the rules.

## Decided
- Room drawing (walls, doors, windows) is our own tool on react-konva, drawn only from the master copy (DECISIONS 2026-11-05).

## What exists: the room drawing preview (2026-11-05)
Open it at `/rooms/preview` (`npm run dev`, then http://localhost:3000/rooms/preview).

- **Start a room:** a name and the ceiling height (rough). Walls are as high as the ceiling and start at the standard 5 1/2" thickness (rough), which can be changed.
- **Walls:**
  - Type the next wall: a length plus a direction (8 arrows or any angle), and "Close the room".
  - Or draw them on the plan: tap corner to corner. Corners snap to existing corners, whole inches and 45°, and the view stays still while drawing.
  - Corners are drawn joined (mitred). Labels go outside and doors swing inside, whichever way the room was drawn.
- **Edit a wall:** its length and thickness. Typing a length moves the far corner and the wall joined to it. That joined wall goes back to rough, and the screen says so.
- **Doors, windows and passthroughs:** tap a wall with the tool, or use "+ Door" on a wall.
  - A standard one drops in at once, rough, centred where you tapped.
  - Drag it along the wall, or type exact sizes.
  - The standard sizes are in `data/standard-sizes.json` (owner, 2026-11-05).
- **Selecting several walls:**
  - Drag a box on an empty part of the plan; every wall it touches is selected.
  - Shift-click a wall to add it to the selection, or remove it.
  - Several selected walls can be deleted together, or given one thickness.
- **Delete key:** removes what is selected (walls with their doors and windows, or one opening), except while typing in a box. On a Mac it's the "delete" key. One undo brings it all back.
- **Sizes:**
  - Feet and inches are exact. Anything not on a 1/64" mark is refused with Core's reason.
  - "mm" sizes are rounded (U-2), and the mm value is kept.
- **Sureness tags:** each size shows Rough (red, ?), Measured (amber, ✎) or Verified (green, ✓). Typing makes it Measured. Verify is a separate button.
- **Live checks:** Core's master copy format check and wall checks run after every change. Tap a problem to select it.
- **Also:**
  - undo and redo;
  - two example rooms;
  - "What gets saved", which shows the master copy JSON, with Download and Load.

## What the preview does not do yet
- **No database.** The room is kept in this browser only (`localStorage`), and the screen says so. If the browser won't store it, a red banner says the work isn't being kept.
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
