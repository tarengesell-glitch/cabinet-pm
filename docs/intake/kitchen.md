# Kitchen visual intake (image selector)

From Taren, 2026-10-27. **Incomplete**: more is coming. The original lives in the owner's Notion page "Image selector workflow". This session couldn't open it, so the outline below is recorded from what was pasted.

These questions, options, images and conditions are **data** (CLAUDE.md rule 6). They are seeded from this file, not written into code. The answers feed AI Design as the customer's design desires (BUILD_SPEC OA-3). Specific picks (colours, handles, inserts) become selections in the master copy.

"Fidelity" is the kind of image shown for the choice: a line drawing or a photorealistic image.

## The outline, as given

- **Shape**
  - Fidelity: line drawing.
  - Options: Galley, L-Shape with Island, Peninsula, U Shape, Double Island.
  - Ceiling height: 7', 8', 10'.
  - Cabinet height: 7', 8', 10', To the Ceiling.
- **Feel**
  - Fidelity: photorealistic, no counters.
  - Options: Ultra modern, Modern, Transitional, Country, Classic.
- **Material**
  - Options: Solid painted, Wood grain.
- **Colour tone**
  - Fidelity: photorealistic.
  - Options: four door tones × three counter tones (12 choices):
    - door tones: White, light-medium, dark-medium, dark;
    - counter tones: white, medium, dark.
- **Door style**
  - Fidelity: photorealistic, no counters.
  - Options: Ultra modern, Modern, Transitional, Country, Classic.
- **Colour selection**
  - Fidelity: photorealistic.
  - Doors: all the standard sub-colours from the colour tone.
  - Counters: all the standard sub-colours from the colour tone.
- **Handles**
  - All handles / all knobs / handles on drawers with knobs on doors.
  - Handle selection: spec, size and finish.
  - Knob selection: spec and finish.
  - Position: vertical or horizontal on doors; centred on drawers or closer to the top.
- **If there's an island**
  - Offsetting colour: yes/no.
    - If yes, repeat material, colour tone, door style and colour selection (including panels and counter).
  - Back panel detail.
  - Side panel detail: waterfall stone, detailed short panel, detailed long panel.
- **Trim**
  - Top trim: select style and colour.
  - Light valance: select style and colour, or hidden.
- **Inserts**
  - Corner cabinets: double shelf or lazy Susan.
  - Cutlery, utility, spice, tray organizer: yes or no, and how many.
  - Garbage and recycling: yes or no, and the number of cabinets dedicated to them.
- **Interiors**
  - Options: White, Prestige maple, Tafisa matching.
- **Drawers**
  - **Minimum** (least expensive, least functional): drawers along the tops of all base cabinets, one bank of four drawers for cutlery/utility/towels/etc, and one bank of three drawers for pots and pans.
  - **Moderate** (balance of cost and functionality): target 60–70% of base cabinets as drawer banks; two four-drawer banks; the remainder are three-drawer banks.
  - **Maximum** (most expensive, most functional; "provide dollar cost for drawers"): drawers for all base cabinets.

## Owner decisions from the prototype (2026-11-07/08)

The outline above was turned into a clickable prototype and reviewed by the owner over eight rounds (https://claude.ai/artifact/MW4uLq1CX3qvoejeeaPadW). It is now built at `/intake` (`src/modules/intake/`). These decisions replace the matching parts of the outline:

- **Order:** the intake comes before the room drawing (walls, openings, cabinets and appliances).
- **Ceiling height:** 7', 8', 10', or a typed height in feet and inches. Decimals are allowed, and the height must land on a 1/64" mark (rule 11).
- **Colour tone** is shown in the material and door the client has already picked ("Showing solid painted shaker options…"). The colours offered depend on the material (painted or wood grain), which settles IK-2's direction. The actual lists are still samples (IK-3).
- **Colours** are one step:
  - **cabinets:** the primary colour;
  - **base cabinets:** match the cabinets unless changed;
  - **island cabinets:** only for a layout with an island. They match the cabinets, or the base cabinets once those differ, unless given their own colour. This replaces the outline's "offsetting colour, then repeat material, tone, door style and colours" for the island;
  - **counter;**
  - **secondary colour:** none by default. When added, the client picks the colour and where it goes (island and/or other, with a note for other).
- **Hardware:** handles only, knobs only, handles on doors with knobs on drawers, or knobs on doors with handles on drawers.
- **Top trim and light valance colour:** match primary colour, match secondary colour (only when there is one), or other, picked from the standard colours. The valance colour is asked unless the valance is hidden.
- **Organizers** start at 1 each, so the client only changes what they don't want.
- **Garbage and recycling:** yes or no. If yes: under the sink or a dedicated cabinet, and how many slide-outs.
- **Other rooms:** the room list is main bath, ensuite bath, powder room, mudroom, laundry room, main bath 2, basement bath, basement bath 2, main bedroom closet, office 1, office 2, entertainment centre 1, entertainment centre 2, and bar. Each type can be added once per job.
  - **The second room** matches the primary room (the same design, adjusted for the room type), coordinates with it (a similar but slightly different design from a preset database), contrasts with it (a contrasting design from a preset database), or starts from scratch.
  - **From the third room on**, matching an earlier room is the recommended path. Coordinate and contrast are still offered, based on a room the client picks.
  - **Every later room** gets the option to match the primary room's ceiling height, and its own inserts for its room type (placeholders until the owner fills them in, IK-7).
- **Linked rooms:** when a choice that other rooms match is changed, the person must choose: "Match currently linked rooms" (they change too) or change only this room (the others keep their design and stop matching), or cancel.
- **2026-11-09 (owner):** island side panels add "Plain gable" (3/4") and "Deep plain gable" (1 1/2"); top trim and light valance each add "None" (no colour is asked then; the valance's "Hidden" stays).

## Where each answer goes (PROPOSED)

| Answer | Becomes |
|---|---|
| Shape, ceiling height | Room geometry hints for AI Design. Real dimensions come from room capture and the site measure. |
| Cabinet height | A job-level design choice that AI Design must respect. |
| Feel, material, colour tone | Guidance that narrows later choices and the AI's style. Not a final selection on its own. |
| Door style, colour selection, handles and position, trim, interiors | Job-level selections in the master copy (island overrides at room or item level). Each option is linked to a catalog option, and from there to the Cabinet Vision mapping. |
| Island offsetting colour, panel details | Selections on the island's items. |
| Inserts | Required items or modifications that AI Design must place. |
| Drawer level | **A design rule set** (Shop Settings) that AI Design applies. The 60–70% target and the bank mix are rule values. Maximum shows the drawer cost, from live pricing. |

## Open questions for the owner

- **IK-1:** Feel and door style list the same five names. Is door style a separate pick, with photos of actual doors filtered by the chosen feel, or the same thing asked twice?
- **IK-3:** What are the "standard sub-colours" for each tone? Is that list the shop's real colour catalog?
- **IK-4:** Cabinet height "7', 8', 10'": is that the top of the uppers measured from the floor?
- **IK-5:** Drawers, Minimum: "along the tops of all base cabinets" means one drawer over doors in every base. Is that right?
- **IK-6:** Is "Prestige maple" a supplier product name, and is "Tafisa matching" the interior matching the Tafisa exterior colour?
- ~~**IK-2:** Does material narrow the colour tones and colours offered?~~ Yes (owner, 2026-11-08: "filtered for previous answers"). The lists per material are still samples (IK-3).
- **IK-7:** Will the other room types (bathroom, laundry, closet…) each get their own outline like this? Partly answered (owner, 2026-11-08): each gets its own inserts, relevant to the room type; the owner fills these in later. Placeholders are in `src/modules/intake/data/intake-v1.json`.
- **IK-8:** If the secondary colour goes on the island, does it replace the island cabinet colour, or is it for island panels and accents?
- **IK-9:** What is the real hardware list (handle and knob styles, sizes and finishes)? The ones offered are samples.
- **IK-10:** What are the options for the island back panel? And what is the difference between a detailed short and a detailed long side panel?
- **IK-11:** What styles are offered for top trim and the light valance?
- **IK-12:** What is the most of each organizer, and of garbage slide-outs, a client can ask for? The intake stops at 4.
- **IK-13:** The preset design database for coordinate and contrast: who builds it, and what is in it? Until then, three suggestions are worked out from the room they are based on (`src/modules/intake/data/presets-standin.json`).
- **IK-14:** The drawer level's cost comes from live pricing, which is not connected yet. The intake says so and shows no number.
