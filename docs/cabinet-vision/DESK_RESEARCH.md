# Cabinet Vision import files: desk research (before samples)

2026-11-08. Written before any sample file from the shop exists, to shape the master copy so the writer can be reliable. **This is not the format reference.** `FORMAT_REFERENCE.md` is written from real samples in Phase 0 (`prompts/00-cabinet-vision-discovery.md`), and wins over anything here.

**How this was researched.** This session's network could not open the vendor's or third parties' pages (every host was refused). Everything below comes from web-search summaries of those pages, not from reading them. So every statement is **unverified** until a sample file or the shop's install confirms it. Nothing here was guessed to fill a gap: gaps are open questions (bottom).

## What the sources say

| # | Statement | Source (via search summary) |
|---|---|---|
| S1 | Cabinet Vision imports and exports orders as CSV, ORD and ORDx. | Hexagon, "CABINET VISION Design" product page |
| S2 | **ORD** is a plain ASCII text format: a `[Header]` section, then `[Catalog]` / `[Cabinet]` section pairs (one pair per catalog or door style). The order of entries in `[Header]` and `[Catalog]` doesn't matter. | Planit help, "ORD File Format" (it says "ORD Version 4") |
| S3 | A cabinet line is comma-separated and starts: order entry number, catalog nomenclature (the cabinet's name in the shop's library), width, height, depth (quantity also appears). | Planit help, "ORD File Format" |
| S4 | Header options are written like `Option="HINGE","Overlay"`. | Planit help, "ORD File Format" |
| S5 | The **extended** ORD format adds Walls and Floors, and places moldings and cabinets on the walls. A wall is 14 comma-separated fields, including direction, length, height and a type (exterior, interior, radius). **Walls whose start or end points match are joined at that point.** | Planit help, "ORD File Format" |
| S6 | In the extended format a cabinet gets positional fields, including **"Wall Number"** (a string) and **"Offset from Wall Start"** (a decimal number). Windows, doors and appliances also have Wall Number and Offset from Wall Start. A wall number can carry a face suffix (the "#-x" form, e.g. front or back of a wall). | Planit help, "ORD File Format" |
| S7 | In Cabinet Vision, a cabinet's **Elevation is the distance from the floor to the bottom of the assembly**. | Planit Canada, "The Smart Guide to Cabinet Vision Design" |
| S8 | **ORDX** follows the layout of the **Properties** used throughout a job. Unlike ORD (one room), **an ORDX can hold several rooms**. It can define face and interior sectioning per assembly. | Planit help, "ORDX Format" |
| S9 | In ORDX, changed parts go in a **`PartOverrides`** section, each identified by its path in the object tree (for example `Cab.interior.AS@2`); standard parameters are written out and other changed values go in a **`Parameter`** section. Values left at their default are left out. | Planit help, "ORDX Format" |
| S10 | ORDX is XML. A part's shape is a series of entities (lines or arcs); a line from the origin needs only its end point. The install ships a sample in `Support\Sample ORDX`. | Planit help, "ORDX Format" |
| S11 | Room-scanning tools export ORDX that opens with walls, dimensions and angles in place. | iMapper integration page (vendor claim) |
| S12 | Order systems (Allmoxy) export ORD and ORDX for Cabinet Vision, and say the ORD file is easy to work with but you must know which catalog in Cabinet Vision to link to. | Allmoxy help; Delphi forum post |

Sources (titles as found): Hexagon "CABINET VISION Design"; content.planit.com CV help "ORD File Format" and "ORDX Format"; planitcanada.ca "The Smart Guide to CABINET VISION DESIGN" (2022); articles.allmoxy.com "Creating Cabinet Vision Export"; imapper.tech "Cabinet Vision" integration; craftsmanengineering.com "Importing ORDX files" (not readable).

## What this means for the master copy

The writer can only be reliable if every value it needs is already in the master copy, exact, in the same terms the import file uses. So the master copy (schema 2) stores:

| Import file (unverified, S5–S7) | Master copy | Exact? |
|---|---|---|
| Wall start/end point, length, direction | `wall.start_point`, `wall.end_point` (centre line, room coordinates, Y up), whole 1/64" | Yes at 0°/90°/180°/270°; slanted corners are rounded to 1/64" and the typed length kept (`entered_length`) |
| Wall height | room `ceiling_height` (walls have no height of their own, OA-11) | Yes |
| Wall thickness | `wall.thickness` | Yes |
| Walls joined where points match | walls share exact corner points | Yes |
| Cabinet "Wall Number" | `position.wall_id`; the wall's place in `room.walls` is its number (A, B, C… = 1, 2, 3…) | Yes, once numbering is confirmed (CV-4) |
| Cabinet "Offset from Wall Start" | `position.offset`: along the wall's line, from its start corner to the cabinet's edge nearer that corner | Yes, once the reference point is confirmed (CV-5) |
| Cabinet Elevation (floor to bottom, S7) | `position.elevation`: floor to the bottom of the cabinet's box, toe kick included | Yes |
| Distance off the wall | `position.setback` (from the wall face) | Yes; field not yet found (CV-6) |
| Wall face suffix ("#-x") | `position.side` (`left`/`right` of the wall's direction) | Yes; meaning to confirm (CV-7) |
| Catalog nomenclature | our `catalog_item_id` → the adapter's mapping table | Mapping is the adapter's job (spec 5.8) |
| Width, height, depth | item `width`, `height`, `depth` | Yes |
| Options (hinge, door style…) | `job_selections` → `room_selections` → `item_selections`, resolved in that order | Codes are ours; the adapter maps them |
| Several rooms (ORDX, S8) | a job holds several rooms | Yes |

**Decimals are exact.** Every 1/64" value is a decimal with at most six places (1/64 = 0.015625), so a file written in decimal inches never needs rounding. Millimetres would (U-2): if the file is in mm, the writer must refuse or follow an owner rule (CV-8).

**Islands and peninsulas** stand on floating walls (A-21): a wall line with no thickness, with cabinets on either side. If the import file has no such wall, the writer would place island cabinets another way (CV-9).

**Appliances** are placed on walls like openings (offset, width). The extended ORD places appliances the same way (S6), so they map too.

## Open questions (also in docs/DECISIONS.md, "Phase 0 desk research")

- **CV-3** The real ORDX structure: element and attribute names for job, room, wall, cabinet, position, size and options; which fields are required. Needs the install's `Support\Sample ORDX` file and the shop's own exports.
- **CV-4** How walls are numbered (from 1? in drawing order?), and whether a wall is given by its start and end points, or by direction and length.
- **CV-5** Where "Offset from Wall Start" is measured from: the wall's start point on its centre line, on its inside face, or the inside corner where it meets the previous wall. And whether wall points are on the centre line or a face.
- **CV-6** Is there a field for a cabinet standing off the wall (our setback), and what is it called?
- **CV-7** What the wall face suffix means exactly, and how a cabinet on the far side of a wall is written.
- **CV-8** The file's units and decimals: decimal inches (exact for us), or millimetres (needs a rounding rule).
- **CV-9** How islands and peninsulas are written: an island wall, a free-standing cabinet with room coordinates and a rotation, or something else.
- **CV-10** How corner cabinets are positioned: on which wall, and from which corner.
- **CV-11** Is Elevation measured to the bottom of the box including the toe kick, or above it?
- **CV-12** Is the ORDX sample in the install the same version as the shop's Cabinet Vision, and does it change between versions (spec Q1)?
