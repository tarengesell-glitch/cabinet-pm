# Design software workflow (owner's outline)

From Taren, 2026-11-05: the Notion page "Design Software" (under "Software Setup"), exported and uploaded to the session. It is recorded below **as given**, grouped but not reworded. It is the source of BUILD_SPEC amendments OA-11 to OA-16.

> **Changed the same day (OA-19).** The owner dropped the room shape picker, the cabinet-position presets and the preset layouts. The flow is now: intake wishes → draw the walls → appliances and fixtures → cabinet runs → AI first pass (with the first price) → fine-tune. Sections below marked **(dropped)** are kept only as a record.

Like the kitchen intake (`kitchen.md`), every list in here (room types, room shapes, cabinet positions, layouts, heights, materials, handles, questions) is **data** (CLAUDE.md rule 6), seeded from this file and never written into code.

The same upload also held the "Software Setup" overview, the build spec and the "Image selector workflow". Those were already recorded on 2026-10-27 (OA-1 to OA-10, `kitchen.md`), and nothing in them has changed.

---

## The outline, as given

### Database

- "There is also a fair amount of database work. You have a connection to Supabase Gesell/Gray and the project for this tool is called 'closet-builder'."

### Home screen

- A list of all the upcoming meetings for that designer user: not just today, but the next three days.
- An "Add a client" button.
- An "Add a task" button.

### Tasks screen

- A simple running list of outstanding tasks, with the ability to expand a task to see more details.
- Mark tasks complete, which makes them go away from the list.
- Delete tasks.
- Tasks are connected to clients.

### Add a client

- First name 1, last name 1.
- First name 2, last name 2.
- Primary contact.
- Project address (autofill from Google Maps).
- Notes.

### Step 2: add rooms

- **Room type:** a dropdown of all the standard room types, plus an option to add a new room type. A new room type is stored in the database as a new room type.
- **(dropped, OA-19) Room shape:** a line drawing of the wall shapes from an overhead view, sorted from most to least used for that type of room.
  - If the exact shape isn't there, the user adds one by drawing it: a tool that auto-snaps and connects straight walls with 90° or 45° corners, and adds doors and windows. Just the shape at this point, no measurements.
  - A new room shape is added to the database of preset room shapes.
  - Forget about ceiling shape for now.
- **Room measurements:**
  - The length of each wall, entered individually. Every wall must be entered to move forward.
  - Wall height: one height for the whole room by default, with the option of different heights.
- **(dropped, OA-19) Cabinet positioning in the room:** preset options for where along the walls the cabinets run, for that room shape.
  - If none fits, the user draws where the cabinet runs are.
  - A new positioning is added to the database of presets for that room shape.
- **(dropped, OA-19) Cabinet layout:** for each run of cabinets, the designer and customer pick the closest layout from a premade list.
  - Suggestions are shown from most to least popular for that room shape and cabinet positioning.
  - No need to be able to add a new layout.

### From here, a rotatable 3D view is present and updates in real time

- **Cabinet primary settings:**
  - Primary cabinet height: 84" as standard, 96", 108", custom.
  - Interior material (show an actual picture):
    - Basic: white melamine;
    - Upgraded: woodgrain Prestige maple melamine;
    - Premium: melamine matching the exterior material.
  - Primary exterior material: from the Tafisa melamine line-up.
  - Primary handle style: from Richelieu, sorted from most to least popular.
  - Handle positioning options. ("I'm not sure how we best store and display these in the selector.")
- **Cabinet by cabinet, section by section:** the designer and homeowner can customize each cabinet and section:
  - cabinet depth;
  - drawers or doors;
  - number of vertical sections, and drag their positions;
  - number of horizontal sections, and drag their positions;
  - number of adjustable shelves, and drag their positions;
  - heights of individual drawers;
  - interior material of that box (if different from standard);
  - exterior material of that box (if different from standard).
- **Photorealistic render:** at any point after most of the design work is done, a button produces the photorealistic render of the rotatable 3D view "by a call to an AI".

### Pricing and delivery

- "The estimate will end up getting generated from a series of formulas similar to the spreadsheet that's been attached. It's an exact number, not a range." (**The spreadsheet was not in the upload.**)
- Live estimate at the top right, "after a point at which they're really into the process".
- Target delivery date estimate.

### What the design software does (summary list)

- Designs in real time.
- Prices in real time.
- Shows an estimated delivery date.
- Can render a real-looking photo in real time.
- Sends direct to shop-ready drawings.
- Walks through the design process so nothing is missed: door style, interior style, counter style, handle style, handle position ("> Sends to CNC").
- Add-ons: lighting.
- The order of choices: select door style(s) and interior material → customize each box → add accessories → select handles and handle placement.

### Customer intake

- Option A: send the customer a self-intake link. Option B: the designer enters it directly.
- Same form either way: a designer can start it and the customer can finish it.
- Contact info.
- Style photo picker.
- Plan upload (optional here; can also happen in step 2).

### Read plans → designer confirms

- Upload one or many files (PDF or image).
- **Blueprint:** auto-scale from printed dimensions; fallback is to snap a known line. Rooms auto-tagged from labels; fallback is to draw the boundary and name it. Fixtures and appliances auto-detected.
- **Hand sketch:** read the written measurements and trust them; no scale needed. The designer names rooms and places fixtures manually.
- Each room is tied to its source file.
- Confirmed rooms become the room list for step 3.

### Room-by-room loop (repeat for each room)

- Usage questions (pick lists).
- Must-haves: the customer adds their own.
- Recommended features: a preset list, pre-checked.
- The tool generates the recommendation.
- Review:
  - layout: current vs. recommended, shown only if better;
  - a change list, with the benefit of each change; accept or decline each change;
  - heights, crown moulding, options, style fit, and why each suits them;
  - add or remove options.
- UI note: "Let's focus on your ideal function first. We can pull back selected options later if we need to bring down the budget."
- **No pricing shown.**
- Next room.

### Fine-tune cabinet by cabinet in Closet Builder

- All rooms available.
- **Pricing appears here for the first time.**

---

## How this fits the spec (PROPOSED)

| Owner's step | Where it lives | Notes |
|---|---|---|
| Home screen, tasks | `projects` (new: tasks, meetings list) | Meetings need a calendar source (MSG-1, new question CAL-1). |
| Add a client | `projects` (customers) | Address autofill is a Google Maps connector, labelled as mocked until real (rule 14). |
| Customer intake, self-intake link | `intake` | The style photo picker is the image selector in `kitchen.md`. |
| Read plans | `intake` (new: plan files) feeding Designer room capture | AI reads plans into **rough** dimensions only. The site measure (OA-5) still has to confirm them. |
| Rooms, shapes, measurements | Designer room capture → master copy | The shape, positioning and layout libraries are data that grows as designers add to them. |
| Room-by-room loop and "the tool generates the recommendation" | AI Design | The spec's AI draft (stage 4). Review = "current vs. recommended", accept/decline per change (spec 5.7). |
| Preset layouts per run | Shop Settings / AI Design data | A preset is a starting draft; it still has to pass every check. |
| Primary settings, per-cabinet edits | Designer → master copy selections (job, room, item) | Settings are exact; the drawing of the construction is a likeness (OA-17). Each setting reaches Cabinet Vision as an ORDX value or a UCS parameter (CV-3). |
| Live 3D | Designer, drawn from the master copy (P6) | |
| AI photorealistic render | Designer, display only | An AI picture can't be guaranteed exact, so it is labelled "illustration" and never used for checks or translation (P5, P6). |
| Estimate, delivery date | `pricing` (from catalog + master copy), `client-messaging` deadlines | Formulas are data; the spreadsheet is needed (PR-1). |
| "Sends direct to shop-ready drawings", "> Sends to CNC" | The push to Cabinet Vision | Cabinet Vision makes the drawings and CNC files; this platform does not (spec section 2). |

## Questions for the owner

These are also listed in `docs/DECISIONS.md`.

- **PR-1 The pricing spreadsheet.** It was mentioned as attached but wasn't in the upload. Please share it: the formulas become pricing data.
- **H-1 Cabinet heights don't match.** The image selector says 7', 8', 10' and "To the Ceiling". The design software says 84" (7'), 96" (8'), 108" (9') and custom. Which list is right? Is 10' meant to be 9', or should 120" be added?
- **PV-1 When does the client first see a price?** The room-by-room loop shows no pricing, and pricing first appears in the fine-tune step. But the image selector's "Maximum" drawers option says "provide dollar cost for drawers". Is that one cost shown during intake, or later?
- **FL-1 Which order is right?** The page has two flows:
  - add client → rooms → shape → measurements → cabinet positions → layout → 3D and settings;
  - intake link → read plans → room-by-room loop (the tool recommends) → fine-tune.

  Our reading is that the second is the overall journey, and the first describes what happens inside it (the shape and layout pickers become how a room is set up when there are no plans). Is that right?
- **SH-1 Two shape pickers.** The image selector asks for kitchen shape (Galley, L-Shape with Island, ...), and room setup asks for a room shape line drawing. Is the image-selector shape the same pick, so it should pre-select the room shape?
- **CL-1 The Supabase project "closet-builder".** Is this tool going to live in that existing project (and reuse its tables), or should it get a fresh database inside that project? This ties to C-1 (reuse closet-builder code). We have not touched the database.
- **CAL-1 Meetings on the home screen.** Which calendar do they come from (Google Calendar?), and are they per designer?
- ~~**PS-1**~~ Replaced by **CV-3** in `docs/DECISIONS.md` (OA-17): settings are sent as ORDX or UCS values; Phase 0 checks how UCS values get in.
- **POP-1 "Most popular".** Room shapes, layouts and handles are sorted by popularity. Is that counted from our own jobs (we'd start with no history: then what order?), or from the supplier's list?
- **RT-1 Room types.** What are the "standard room types" to start with? Is "Closet Builder" the name of the fine-tune screen, or the whole tool?
