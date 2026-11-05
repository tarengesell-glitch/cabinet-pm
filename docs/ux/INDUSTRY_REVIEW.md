# Room drawing: review against industry practice (2026-11-05)

The owner asked for every drawing and navigation decision to be checked against how the most-used apps work, so the tool feels familiar to cabinet designers. **Standing rule:** for anything about drawing, navigating or editing a plan, research what the common apps do before building it, and record the source here or in `docs/DECISIONS.md`.

**About the sources.** The research used web search. Many vendor help sites (Autodesk, Cabinet Vision, Chief Architect, KCD, ProKitchen, Floorplanner, RoomSketcher) could not be opened from the build environment, so some findings come from search-result excerpts rather than full pages. "Not found" means it could not be confirmed. The vendors that matter most to kitchen designers (Cabinet Vision, 2020 Design, Mozaik, KCD) are the least documented online.

## Verdicts
| # | What we built | What the common apps or standards do | Verdict |
|---|---|---|---|
| 1 | Mouse wheel zooms at the cursor | Same in AutoCAD, SketchUp, Revit and Cyncly's kitchen tools (3CAD, Mozaik) | **Kept** |
| 2 | Trackpad two-finger scroll *zoomed* | Figma: two fingers pan, pinch zooms | **Changed**: two fingers move the plan in any direction, pinch or Ctrl/Cmd + scroll zooms |
| 3 | No way to pan except the sideways wheel | Middle-button drag (AutoCAD, Revit); Space + drag (Figma, Sweet Home 3D) | **Changed**: both added. Plain left-drag on empty space stays box-select, unlike 3CAD |
| 4 | Fit button only | Double-click the middle button = zoom extents (AutoCAD, WinnerDesign); Shift+1 (Figma) | **Changed**: added both, and kept the Fit button |
| 5 | Box select picked anything touched, in either direction | AutoCAD: left→right picks only what is fully inside ("window"); right→left picks anything touched ("crossing", dashed) | **Changed** to match AutoCAD |
| 6 | Walls drawn by clicking corners; exact lengths typed in a side panel with arrow buttons | Cabinet Vision and Mozaik: point the direction, type the length, press Enter; Esc or right-click finishes | **Changed**: type-while-drawing added, plus right-click to finish. The side panel's "Type the next wall" card is now redundant (see question 1) |
| 7 | Walls numbered 1, 2, 3 | Kitchen drawings and measuring guides letter walls (Wall A, B, C …, often starting at the sink wall, clockwise). Blueprints use circled tags and elevation markers | **Changed**: letters in circles (A, B, C) in drawing order, inside the room |
| 8 | Lengths in inches only | NKBA (kitchen industry standard) uses inches and fractions, not feet-inches | **Kept** (confirmed) |
| 9 | One length label per wall, centred outside it | NKBA plans use *dimension strings*: wall space to openings, centrelines of fixtures, then the overall wall. Thin lines, ticks, text above the line | **Changed (owner asked)**: walls with doors or windows now show a chain (corner → opening edge, opening width, … → corner) with the overall on a second line. Cabinet makers' planning guides (Medallion, Schuler, Yorktowne) measure the same way. Walls without openings show only the overall. Centrelines of fixtures come with cabinets |
| 10 | Walls filled by colour (pastel red / amber / green = rough / measured / verified) | Drafting draws walls as the heaviest lines with a grey or black fill, and doesn't use colour on printed plans. Unverified sizes are marked "VIF" (verify in field) | **Answered (owner)**: keep the colours; they fail loudly on unmeasured walls. Drawings for clients will use standard grey walls when that view is built |
| 11 | Door: leaf at 90° plus a quarter-circle swing arc | Same everywhere | **Kept** |
| 12 | Door hinge side and swing: always the same, no control | Revit and Chief Architect: two flip controls, hand (left/right) and facing (in/out). US handing: LH/RH judged from outside, "reverse" when it swings towards you | **Changed**: Left hand / Right hand and Swings in / out on a selected door, judged from outside as in the US convention |
| 13 | Window: two lines across the wall gap | Sources disagree (two lines, three lines, gap with frame lines) | **Kept** |
| 14 | Passthrough: dashed line | No standard symbol found | **Kept**, low priority |
| 15 | Selected wall: end handles change the length, middle handle slides the wall | AutoCAD: end grips stretch, middle grip moves | **Kept** (matches). Keeping joined walls' angles is the owner's call; no app documented it |
| 16 | Exact length typed in the side panel | Revit and Chief Architect: click the temporary dimension on the plan and type there. Floorplanner: click the inner dimension | **Answered (owner): yes, added.** Click a wall's length on the plan to type a new one (Enter to apply, Esc to cancel) |
| 17 | Doors and windows: pick the tool, a ghost snaps to walls, click to place | 2020 Fusion, Cyncly, Sweet Home 3D, IKEA: drag from a catalogue onto a wall. Cyncly also lets you type the offset from the wall's left, centre or right | **Close enough**: click-to-place keeps the screen uncluttered. Measuring from left, centre or right is a possible later addition |
| 18 | Doors and windows move along their wall only | Mozaik and IKEA: move to another wall | **Changed**: drag onto any wall, plus end handles to resize |
| 19 | Undo/Redo (Cmd+Z / Shift+Cmd+Z), Delete, Esc | Standard | **Kept** |
| 20 | Snapping to whole inches, 45° and corners while drawing | AutoCAD's polar tracking and object snaps work the same way | **Kept**, and extended (2026-11-05): new walls also snap onto any point along an existing wall, like AutoCAD's "nearest" snap |
| 21 | Islands and peninsulas | Cabinet Vision uses a "peninsula wall": an invisible wall that works as a wall but is drawn as a line (via closet-builder A-21) | **Added**: the "Floating wall" tool, drawn as a dashed line |

## Questions for the owner
1. ~~**The "Type the next wall" card.**~~ Answered: removed. It was added without being asked for.
2. ~~**Wall colours.**~~ Answered: keep them while measuring; grey walls on drawings for clients.
3. ~~**Typing a length on the plan.**~~ Answered: yes, added.
