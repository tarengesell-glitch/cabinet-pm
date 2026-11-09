# ai-design

Drafts a layout into the master copy from the room, selections, intake answers, shop design rules and catalog. Drafts must pass the same validation as a human design and record a short explanation.

Status: **the design brief** (2026-11-08). This is what the AI designer will read. Nothing calls an AI model yet, and nothing is drafted. See `CLAUDE.md` in this folder for the rules.

## The design brief (`model/brief.ts`)
`buildDesignBrief({ job, roomId, catalog, designRules, intake })` builds the brief for one room of a job (owner, 2026-11-07: "the AI designer gets the confirmed rules, the room's walls and cabinet runs, and the client's intake preferences"). It returns the brief and its exact text (JSON), or refuses with every reason.

What goes in:

| Part | From | What is in it |
|---|---|---|
| `made_from` | the inputs | The master copy schema version, the **catalog version** and shop, and the **design rules file**: where it was imported from, the date, a SHA-256 fingerprint of all its rules, and how many confirmed rules were used. |
| `room` | the master copy | Ceiling height. The room's walls in drawing order, with their letters (A, B, C…), corners, length, thickness, doors and windows (with a door's swing), obstacles, cabinet runs (with their kind in words) and appliances (a dishwasher says which sink it is beside). Islands (floating walls) are listed apart. Every site size says whether it is confirmed or still rough. |
| `intake` | the client's answers | One row per question: the question, the option's ID and label (or the number, or yes/no), and whether it was confirmed with the client. |
| `design_rules` | shop-settings | **Only confirmed rules** (78 of 82 today): ID, kind, title, what it says, strength (the owner's words, or null when not stated), when it applies, and its lengths in inches. |
| `cabinet_types` | catalog | Only types **available** to the shop (50 today): ID, code, name, type, sizes (standard, smallest, largest, step, or "not known yet"), fronts from top to bottom, what is inside, toe kick, options with their choices, whether each is required and its default, and the owner's notes. |

**The same input gives the same bytes.** No clock, no randomness, no AI call. Lists whose order means nothing are sorted (by ID, code, or position along the wall). Lists whose order means something keep it: walls (their letters), a cabinet's fronts (top to bottom) and the catalog's notes.

**It refuses, with every reason, when:**
- the master copy is not valid, or has no room with that ID;
- the room has no cabinet runs;
- a dishwasher is paired with a sink that is not in the room;
- the catalog belongs to another shop;
- there are no confirmed design rules, or no available cabinet types;
- any intake answer is missing, skipped, "needs follow-up", in the wrong shape, or for a question the brief doesn't know. Intake questions have no "not sure" answer (owner, 2026-11-09); one sent anyway is refused.

The brief never fills in an answer. It reports; the draft run that calls it writes the alert (rule 7) once draft runs exist.

Tests: `__tests__/brief.test.ts`, with an example kitchen with an island in `__tests__/example.ts`. The whole brief for it is saved in `__tests__/__snapshots__/kitchen-brief.json`; any change to the brief shows up there.

## What the intake session (BUILD_PLAN 7b) must provide
The type is `KitchenIntake` in `model/intake.ts`, taken from `docs/intake/kitchen.md`. Intake owns the options (IDs, labels, pictures); the brief only needs, per question, the picked option's **ID and label**, and the answer's **status**.

`{ room_type: 'kitchen', answers: { <question>: <answer> } }`. Each answer is one of:
- a picked option: `{ status, option_id, label }`;
- a number: `{ status, count }` (0 means none);
- yes or no: `{ status, yes }`;
- not answered yet: `{ status: 'skipped' | 'needs_follow_up' }`. The brief refuses it;
- doesn't apply: `{ status: 'not_applicable', reason }`, only for a follow-up an earlier answer ruled out (owner approved, 2026-11-09).

There is no "not sure": the intake questions don't offer it (owner, 2026-11-09).

`status` is `selected` or `confirmed` (DATA_MODEL "intake").

| Question | Answer | Needed |
|---|---|---|
| `shape` | option | always |
| `cabinet_height` | option | always |
| `feel` | option | always |
| `material` | option | always |
| `colour_tone` (door tone and counter tone) | option | always |
| `door_style` | option | always |
| `door_colour` | option | always |
| `counter_colour` | option | always |
| `hardware` (all handles, all knobs, or handles on drawers and knobs on doors) | option | always |
| `handle` (spec, size and finish) | option | always, or not applicable |
| `knob` (spec and finish) | option | always, or not applicable |
| `handle_position_doors` (vertical or horizontal) | option | always, or not applicable |
| `handle_position_drawers` (centred or near the top) | option | always, or not applicable |
| `top_trim_style`, `top_trim_colour` | option | always |
| `light_valance` (a style, or hidden) | option | always |
| `light_valance_colour` | option | always, or not applicable |
| `corner_insert` (double shelf or lazy Susan) | option | always, or not applicable |
| `cutlery_organizers`, `utility_organizers`, `spice_organizers`, `tray_organizers` | number | always |
| `garbage_recycling_cabinets` | number | always |
| `interiors` | option | always |
| `drawer_level` (minimum, moderate, maximum) | option | always |
| `island_own_colour` | yes/no | when the room has an island or peninsula (a floating wall with cabinets) |
| `island_back_panel`, `island_side_panel` | option | the same |
| `island_material`, `island_colour_tone`, `island_door_style`, `island_door_colour`, `island_counter_colour` | option | when the island is in its own colour |

Not asked: **ceiling height.** The room drawing already holds it, and the master copy wins (P1).

Island answers given for a room with no island are refused, as are island colour answers when the island is not in its own colour. They contradict the drawing, so the brief doesn't pick one.

## DRAFT: instructions for the AI designer (PROPOSED, not decided)
These are the instructions the AI will be given with the brief. They are a draft for the owner to review. The walkway paragraph (PRIN-005 and PRIN-013) is confirmed by the owner (2026-11-09); the rest is still a draft.

> You are drafting the cabinet layout for one room. The design brief below is everything you know: the room as drawn, where the cabinets go (the runs), the appliances, the client's answers, the shop's confirmed design rules and the cabinet types you may use. Use only those cabinet types, and only the sizes and options each one allows. Where a size limit is "not known yet", use the standard size. Never invent a cabinet, an option or a size.
>
> **Hard rules (`hard`) are never broken.** If a hard rule can't be met, don't draft around it: stop and say which rule and why.
>
> **Preferences (`preference`) are weighed by their strength.** Strength is in the owner's own words ("strong", "very strong, not hard", "extremely strong, almost a hard constraint"). A preference with no stated strength is an ordinary preference. Preferences can be traded off against each other. When you give one up, say which one and what you gained.
>
> **Principles (`principle`) guide your judgment.** Use them to decide between good options, for example near enough becomes exact (PRIN-006), function beats decorative symmetry (PRIN-011), and judge the fronts in elevation (PRIN-009, PRIN-012).
>
> **Front rules (`front_rule`)** say how doors, drawers, fillers and ends are drawn. The shop's library is the authority for construction; follow these for the picture. **Optional (`optional`)** items are added only when the client asked for them. **Not defaults (`rejected`)** items are never added unless the client asked. **Documentation (`documentation`)** rules are about drawings, not layout.
>
> A rule applies only where its "applies when" says so.
>
> **Where rules pull against each other with no fixed order, explain the trade-off; don't settle it silently.** Walkway width against lining up or centring has no fixed order (PRIN-005). When lining up and the walkway pull against each other, lining up wins as long as the walkway stays over 36" (PRIN-013). Below that, or for anything else PRIN-005 covers, show both options and what each costs, and leave the choice to the designer.
>
> Follow the client's answers. Where a size in the room is still rough, design to it, and say which of your choices depend on it.
>
> **Explain your key decisions (BUILD_SPEC 5.7).** For each, write a short note: what you decided, which rules and answers it rests on, and what you traded off. Name rules by ID and runs and appliances by their IDs. Keep each note to one or two sentences.

## What the AI's output needs from step 1b-items
The master copy has no placed cabinets yet (BUILD_PLAN 1b-items). For the AI's draft to be saved and checked like a human design, that step needs:
- **Placed cabinets** (BUILD_SPEC 6, PlacedItem): catalog item ID, width, height and depth, position (wall and distance along it, plus elevation, or room position for an island), rotation, item selections and modifications.
- **Which run a cabinet fills,** so the draft can be checked against the run it was given, and corners worked out.
- **Selections at job, room and item level,** with the order item → room → job, so the intake's picks (door style, colours, handles, interiors) land where the spec says.
- **`origin` on every cabinet** (`ai` or `designer`, plus the last editor), so the designer sees what the AI placed (BUILD_SPEC 5.6).
- **Somewhere to keep the AI's notes on its key decisions,** linked to the cabinets and rules they are about. DATA_MODEL puts the explanation in `draft_runs`, which this module owns; the master copy only needs stable cabinet IDs the notes can point to.
- **Status `ai_draft` and a version saved with origin `ai`,** which the master copy store (platform) provides.
- **Item layout checks** (overlap, past a wall's end, blocking an opening) and the catalog's buildability checks run over every cabinet, so a draft passes the same validation as a human design and a failed draft is kept with its issues.

## Public API
`contract.ts`: `buildDesignBrief`, `BRIEF_FORMAT`, `KITCHEN_INTAKE_QUESTIONS`, and the brief and intake types.
