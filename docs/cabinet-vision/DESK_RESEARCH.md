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

## The official "ORDX Format" help page (pasted by the owner, 2026-11-09)

The owner pasted the page from the Hexagon Documentation Center, **CABINET VISION 2026 – Online Help (HTML)**, Room Level › Ribbonbar › Utilities Tab › Export ORDX › **ORDX Format** (updated Aug 14, 2026). The page notes that after September 30, 2026 this documentation moves to https://documentation.cadence.com/msc/home.html. This is the vendor's own text, so it replaces S8 to S10 above (which were search summaries of an older copy). It is documentation, not a sample file: element names below are as the page prints them.

**What the page says, in its own words where quoted:**
- "In general the ORDX format follows the formatting of Properties throughout a Job. Unlike an ORD file which is restricted to one Room the ORDX can have multiple Rooms. The ORDX can also define both Face and Interior Sectioning per Assembly which also can not be achieved via the ORD file."
- "We have included a sample ORDX file, which touches most areas of a Job, in the install. It is located in the `\Support\Sample ORDX\` Folder."
- "As the format matures we'll be adding more documentation to this topic."

**Parts.** "There is a `PartOverrides` section in the ORDX. It uses the part path from the Object Tree to identify the part e.g. `Cab.interior.AS@2`. The standard 9 parameters are written out as well as other modified parameters which will be in a `Parameter` section." The page's example:

```xml
<PartOverrides>
   <PartOverride>
      <Name>Cab.Case.LF</Name>
      <DZ>50</DZ>
   </PartOverride>
   <PartOverride>
      <Name>Cab.Case.TO</Name>
      <Y>760</Y>
      <DZ>20</DZ>
      <AX>-65</AX>
      <Parameter>
         <Name>GOAT</Name>
         <Type>M</Type>
         <Value>0.925</Value>
      </Parameter>
   </PartOverride>
   <PartOverride>
      <Name>Cab.Interior.AS@2</Name>
      <DZ>35</DZ>
   </PartOverride>
</PartOverrides>
```

**Shapes.** A `Shape` can sit in a `PartOverride`, and in the `AdditionalParts` section for manually added parts. It has an `Axis` (`XY` is the default; `XZ` or `YZ`) and a `template` (attributes `firstid` and `unit`, e.g. `unit="mm"`) made of entities, "either lines or arcs". A line is `<entity id="1" type="line2d">` with `<Begin>` and `<End>`, each with `<x>` and `<y>`; "Everything is assumed to be Zero", so a line from (0,0) to (2,0) needs only `<End><x>2</x></End>`. Any entity can carry `<parameters><parameter name="…"><value type="4">1</value></parameter></parameters>`. "It is probably best to output some cabinets / parts with various shapes to get a handle on the output."

(The page's own triangle example has typing slips: curly quotes, `</ Begin >` with spaces, a closing `<entity>` without the slash, and two entities both with `id="2"`. Real files must be read to see the true form.)

**Parameter value types** (the `type` number):

| ID | Name | ID | Name |
|---|---|---|---|
| 1 | Measurement | 7 | PartID |
| 2 | Degrees | 8 | Text |
| 3 | Radians | 9 | Currency |
| 4 | Integer | 10 | Unsigned |
| 5 | Boolean | 11 | GUID |
| 6 | Decimal | 12 | ShapeID |

The part example also shows a `<Type>M</Type>` letter code beside a numeric value (0.925), which the page doesn't explain.

**What it means for us:**
- **The "standard 9 parameters"** look like a position, a size and a rotation per part (`X`, `Y`, `Z`, `DX`, `DY`, `DZ`, `AX`, `AY`, `AZ`; the example uses `Y`, `DZ` and `AX`). That is unverified: the page names only the three in its example.
- **Units.** Shapes say `unit="mm"`, and the part values (`DZ` 50, `Y` 760) read like millimetres. **Writing millimetres is still exact for us:** an inch is exactly 25.4 mm, so 1/64" is exactly 0.396875 mm, and every master-copy length is a millimetre decimal with at most six places. Only *reading* millimetres back needs rounding (U-2), and the writer must use enough decimals (CV-8, narrowed).
- **Part overrides are for engineering-level changes** (a part's size or angle inside a cabinet). Our master copy does not engineer cabinets (BUILD_SPEC section 1), so the writer should normally write none. Any that are ever needed must come from catalog-defined modifications, never free-form (rule 6).
- **Not on the page:** the job, room, wall and cabinet elements, how a cabinet is positioned in the room, its width, height and depth, its catalog name, and options. Those still need the sample ORDX and the shop's exports (CV-3 to CV-7, CV-9 to CV-11).

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

**Decimals are exact.** Every 1/64" value is a decimal with at most six places in inches (1/64" = 0.015625") and in millimetres (1/64" = 0.396875 mm, since an inch is exactly 25.4 mm). So a file written in either unit never needs rounding, as long as it takes six decimals. Reading millimetres back does (U-2) (CV-8).

**Islands and peninsulas** stand on floating walls (A-21): a wall line with no thickness, with cabinets on either side. If the import file has no such wall, the writer would place island cabinets another way (CV-9).

**Appliances** are placed on walls like openings (offset, width). The extended ORD places appliances the same way (S6), so they map too.

## Open questions (also in docs/DECISIONS.md, "Phase 0 desk research")

- **CV-3** The real ORDX structure: element and attribute names for job, room, wall, cabinet, position, size and options; which fields are required. Needs the install's `Support\Sample ORDX` file and the shop's own exports.
- **CV-4** How walls are numbered (from 1? in drawing order?), and whether a wall is given by its start and end points, or by direction and length.
- **CV-5** Where "Offset from Wall Start" is measured from: the wall's start point on its centre line, on its inside face, or the inside corner where it meets the previous wall. And whether wall points are on the centre line or a face.
- **CV-6** Is there a field for a cabinet standing off the wall (our setback), and what is it called?
- **CV-7** What the wall face suffix means exactly, and how a cabinet on the far side of a wall is written.
- **CV-8** The file's units and decimals. *Narrowed 2026-11-09:* shapes use `unit="mm"` and part values look like mm. Writing mm is exact for us (1/64" = 0.396875 mm), given six decimal places; still to confirm: whether room, wall and cabinet values are mm too, how many decimals Cabinet Vision reads, and whether a unit is set per file.
- **CV-9** How islands and peninsulas are written: an island wall, a free-standing cabinet with room coordinates and a rotation, or something else.
- **CV-10** How corner cabinets are positioned: on which wall, and from which corner.
- **CV-11** Is Elevation measured to the bottom of the box including the toe kick, or above it?
- **CV-12** Is the ORDX sample in the install the same version as the shop's Cabinet Vision, and does it change between versions (spec Q1)?
