# intake

The visual intake (image selector): questions, options, images and answers per room type. Option IDs are the source of truth.

See `CLAUDE.md` in this folder for the rules.

## What exists: the design choices preview (2026-11-08)
Open it at `/intake` (`npm run dev`, then http://localhost:3000/intake). The home page lists it first, before the room drawing: the intake comes before walls, openings, cabinets and appliances (owner, 2026-11-08). Its last screen links on to the room drawing.

It was built from the owner's clickable prototype, reviewed over eight rounds (https://claude.ai/artifact/MW4uLq1CX3qvoejeeaPadW, 2026-11-07/08). The decisions are in `docs/DECISIONS.md` ("2026-11-08: Visual intake") and `docs/intake/kitchen.md`.

- **One question at a time, with large pictures.** A picture question moves on by itself once answered. Number keys pick an option, Enter goes on. Next stays off until the step is answered, with a line saying what is missing.
- **The pictures are placeholders.** They are simple drawings that follow the client's picks (colours, door style, hardware), each marked "Placeholder", until real photos exist (BUILD_PLAN 7b).
- **The kitchen** asks:
  - layout;
  - ceiling and cabinet height. A typed height takes decimals and must land on a 1/64" mark (rule 11);
  - feel, material and colour tone. The tone pictures show the chosen material and door;
  - door style;
  - colours:
    - cabinets (the primary colour);
    - base cabinets (match unless changed);
    - island cabinets (only with an island; match the cabinets, or the base cabinets once those differ, unless given their own colour);
    - counter;
    - an optional secondary colour and where it goes;
  - hardware (four combinations), handle and knob, and positions;
  - island panels (only with an island);
  - top trim and light valance, each with a colour: match primary, match secondary, or other from the standard colours;
  - corner cabinets, organizers (1 each to start) and garbage pull-outs (location and how many);
  - interiors and drawer level.
- **Later rooms** start with the room type (the owner's 14, each once per job). The second room then picks one of:
  - match the kitchen;
  - coordinate with it;
  - contrast with it;
  - start from scratch.

  From the third room on, matching any finished earlier room is recommended, and coordinate and contrast use a room the client picks. Coordinate and contrast offer three suggested designs. Only "start from scratch" asks the design questions again. Every later room asks its heights ("Match the kitchen" is offered) and its own inserts (placeholders per room type).
- **Linked rooms.** A matched or suggested room follows the room it is based on. A design change that other rooms follow is held back until the person chooses:
  - **"Match currently linked rooms"**: they change too;
  - **"Change only this room"**: the rooms that followed it keep their current design and stop matching ("Its own design");
  - **Cancel**.

  A matched room's copied choices can be opened from its summary to change them, with the same choice.
- **A review per room** lists every answer with Change links and anything missing. Finish is refused while anything is missing.
- **Preview limits, shown on screen:** answers are kept in this browser only, the user is mocked, and the pictures are placeholders. A storage failure is shown and stays until it is resolved.

## In the design studio (2026-11-08)
The app's design studio (`/studio`) shows this screen as its first step (DECISIONS "The design studio"). There it gets a `flow` link: the studio shows the rooms and steps, decides which room is on screen, and is told of every change. A finished room offers "Add another room" or "Start laying out room dimensions". The look is the owner's Kitchen Studio prototype (DECISIONS C-2): gold rings and a check on picked cards, serif questions, round colour swatches.

- `data/intake-v1.json`: the steps, questions, options, conditions, room types, insert placeholders and notes. Conditions are data (`{ "key": …, "in": […] }` and so on), not code.
- `data/colours.json`: SAMPLE colours per tone (painted and wood grain), counter colours and hardware finishes (IK-3, IK-9).
- `data/lists.json`: the counts (None to 4) and the trim colour choices.
- `data/presets-standin.json`: STAND-IN rules for the coordinate and contrast suggestions until the preset database exists (IK-13).
- `model/definition.ts`: reads and checks the data. Anything malformed refuses the whole intake with the reasons.
- `model/engine.ts`: the rules (pure; tested in `__tests__/engine.test.ts`).
- `model/handover.ts`: what other modules read (below).
- `ui/`: the screen, the placeholder pictures and browser storage; `RoomDefaults.tsx`, one room's design choices as editable rows for the studio's customize screen (same rules as the screen, linked rooms included; the room's type and basis stay on the screen).

## Public API (`contract.ts`)
- `INTAKE_DEFINITION`: the checked questions (or the reason they can't load).
- `startIntake(def, roomId)` and the `IntakeState` type.
- `roughCeiling(def, state, roomId)`: the room's rough ceiling height as an exact length, for the room drawing to start from (IK-17). "Match the kitchen" follows the kitchen; no answer is refused with the reason.
- `loadIntakeState(job?)`: the answers kept in this browser, for the studio. Each demo client's job keeps its own; without a job, the preview job's.
- `roomDesignInputs(def, state, roomId)`: a room's design choices as the other studio steps use them, read from the answers each time (nothing else is saved): `roomKind` ("bath" for the room types grouped as bathrooms, otherwise "kitchen"), `drawerLevel`, `cornerInsert`, `garbage`, `cabinetTop` (the rough cabinet height), `islandBackPanel`, `islandSidePanel` and `look` (colours, door style, hardware). The drawer level and the island panels say whether they are chosen, unanswered, not applicable, or unrecognized (a saved value that isn't one of the options, reported as it is; DECISIONS 2026-11-11). Other unanswered choices stay null (the garbage pull-out "none"). Null when the room isn't in the design choices. **A new design choice that the room drawing, the design step or the 3D view needs is added here** (`model/design-inputs.ts`), not read from the answers elsewhere. Tested against what the studio read before (`__tests__/design-inputs.test.ts`) and for each case (`design-inputs-status.test.ts`).
- `roomSummary(def, state, roomId)`: a room's answers in words, for the customize screens.
- `intakeHandover(def, state)`: one record per room, with its `room_type`, `name`, `complete`, `design_from` and `answers`. Each answer carries the option ID and its label as the client saw it, or a count, the picked IDs and labels, typed text, or a length in the base unit. Only questions that apply are included. An unanswered question is left out, never filled in.

## Not yet
- **AI Design's intake shape is out of date.** `ai-design` (`model/intake.ts`) was written from the 2026-10-27 outline. It expects `door_colour`, an island yes/no and separate island material, tone and door style. The owner has since replaced these with the colours step (cabinets, base, island, counter, secondary), four hardware combinations, and garbage location and slide-outs. Most other codes match. AI Design needs updating to read `intakeHandover` (DECISIONS IK-15).
- Answer statuses beyond "selected" (not sure, skipped, needs follow-up, confirmed; DATA_MODEL "intake") are not offered yet.
- The rough ceiling height starts the room drawing only inside the studio; `/rooms/preview` still asks for its own. After that the master copy wins (P1).
- Inside the design studio, the answers are saved to the shared database as you work (2026-11-09): each save is a new version of the whole intake state, in `intake_answer_versions`. The standalone `/intake` preview still keeps them in this browser only. Per-answer rows (`intake_answers`, with statuses) and the question tables come later.
- Permissions reuse `room.view` and `room.edit` (PROPOSED; DECISIONS IK-16).
