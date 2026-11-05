# designer

Room capture (walls, angles, ceiling height, openings, obstacles, utilities) and visual editing of the layout. Draws only from the master copy, offers only the shop's catalog items, shows validation live, marks AI-placed vs designer-changed items.

See `CLAUDE.md` in this folder for the rules.

## Decided
- Room drawing (walls, doors, windows) is our own tool on react-konva, drawn only from the master copy (DECISIONS 2026-11-05).

## What exists: the room drawing preview (2026-11-05)
Open it at `/rooms/preview` (`npm run dev`, then http://localhost:3000/rooms/preview).

- **Start a room:** name, ceiling height, wall height and wall thickness, all typed. Nothing is guessed.
- **Walls:**
  - Type the next wall: a length plus a direction (8 arrows or any angle), and "Close the room".
  - Or draw them on the plan: tap corner to corner. Corners snap to existing corners, whole inches and 45°, and the view stays still while drawing.
- **Edit a wall:** its length, height and thickness.
  - Typing a length moves the far corner and the wall joined to it. That joined wall goes back to rough, and the screen says so.
  - A slanted wall keeps the length that was typed.
- **Doors, windows and passthroughs:** tap a wall with the tool, or use "+ Door" on a wall. Every size must be filled in before one is created.
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
- **One room at a time.**

## Code
- `model/editor.ts`: pure editing actions on the master copy (unit-tested in `__tests__/editor.test.ts`).
- `ui/`: the screen (`RoomCapture`), the plan (`PlanCanvas`, the only place that flips screen Y to room Y), the panels and `SizeField`.
- `ui/index.ts` is what the app imports.
