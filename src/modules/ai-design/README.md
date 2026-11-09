# ai-design

Drafts a layout into the master copy from the room, selections, intake answers, shop design rules and catalog. Drafts must pass the same validation as a human design and record a short explanation.

Status: **the design brief** (2026-11-08), reading the real design choices since 2026-11-09 (IK-15). This is what the AI designer will read. Nothing calls an AI model yet, and nothing is drafted. See `CLAUDE.md` in this folder for the rules.

**How the AI designer will work** (owner, 2026-11-09; DECISIONS "AI designer: how it works"):
- **Ordinary code** builds several complete, valid layouts per room. It works from the locked inputs: walls, openings, runs and every design choice. It follows the confirmed rules.
- **Claude** compares those layouts, picks one, checks that every requirement is met, and writes the "why" notes. It never types coordinates.
- **Appliances** may move up to 24" along their own wall, only to improve the design, and each move is explained.

The steps are listed under "Next" below.

## The design brief (`model/brief.ts`)
`buildDesignBrief({ job, roomId, catalog, designRules, intakeDefinition, intake })` builds the brief for one room of a job (owner, 2026-11-07: "the AI designer gets the confirmed rules, the room's walls and cabinet runs, and the client's intake preferences"). It returns the brief and its exact text (JSON), or refuses with every reason.

What goes in:

| Part | From | What is in it |
|---|---|---|
| `made_from` | the inputs | The master copy schema version, the **catalog version** and shop, and the **design rules file**: where it was imported from, the date, a SHA-256 fingerprint of all its rules (worked out in plain code, `model/sha256.ts`, so the brief runs the same in a browser and on a server), and how many confirmed rules were used. |
| `room` | the master copy | Ceiling height. The room's walls in drawing order, with their letters (A, B, C…), corners, length, thickness, doors and windows (with a door's swing), obstacles, cabinet runs (with their kind in words) and appliances (a dishwasher says which sink it is beside). Islands (floating walls) are listed apart. Every site size says whether it is confirmed or still rough. |
| `intake` | the client's design choices (`intakeHandover`) | One row per answered question, sorted by its intake key. Each row has the key, the intake's own short wording, the picked option IDs, and the answer in the words the client saw (labels, a number or typed text). The ceiling height is left out, because the room drawing holds it (P1). |
| `design_rules` | shop-settings | **Only confirmed rules** (78 of 82 today): ID, kind, title, what it says, strength (the owner's words, or null when not stated), when it applies, and its lengths in inches. |
| `cabinet_types` | catalog | Only types **available** to the shop (50 today): ID, code, name, type, sizes (standard, smallest, largest, step, or "not known yet"), fronts from top to bottom, what is inside, toe kick, options with their choices, whether each is required and its default, and the owner's notes. |

**The same input gives the same bytes.** No clock, no randomness, no AI call. Lists whose order means nothing are sorted (by ID, code, or position along the wall). Lists whose order means something keep it: walls (their letters), a cabinet's fronts (top to bottom) and the catalog's notes.

**It refuses, with every reason, when:**
- the master copy is not valid, or has no room with that ID;
- the room has no cabinet runs;
- a dishwasher is paired with a sink that is not in the room;
- the catalog belongs to another shop;
- there are no confirmed design rules, or no available cabinet types;
- the design choices:
  - are not for the kitchen (only the kitchen is drafted so far, IK-7);
  - are not finished (the intake's own `complete`);
  - answer a question the intake doesn't have;
  - give an answer in the wrong shape for its question;
  - pick an option a fixed-list question doesn't offer;
  - pick a layout with an island (the intake's `island` flag on the layout option) when the drawing has no island.

A drawn island is never refused for its layout: a peninsula is drawn as a floating wall and gets no island questions (owner, 2026-11-09, IK-18).

The brief never fills in an answer. It reports; the draft run that calls it writes the alert (rule 7) once draft runs exist.

Tests: `__tests__/brief.test.ts`, with an example kitchen with an island in `__tests__/example.ts`. The whole brief for it is saved in `__tests__/__snapshots__/kitchen-brief.json`; any change to the brief shows up there.

## What the brief reads from the intake
The intake's handover, one room at a time (`intakeHandover` and `RoomHandover`, intake contract), with the intake's questions (`INTAKE_DEFINITION`) to read it by. This module keeps **no copy of the questions**: their keys, wording, options and which ones apply are the intake's data. The old copy drifted when the intake changed, which is IK-15.

- **Which questions apply is the intake's call.** The handover includes only questions that apply and says whether all of them are answered (`complete`). An unfinished room is refused; nothing is filled in.
- **Answer shapes** follow the question's kind:
  - picture, card, chip and swatch questions: one option;
  - counts: a number;
  - "where does it go": a list of options;
  - typed text;
  - a height.
- **Option IDs** are checked against the question's options when the question has a fixed list. Lists the intake works out from earlier answers (colours, finishes, counts) can only be checked by the intake itself.
- **Statuses:** the intake hands over only "selected" so far. "Confirmed with the client" comes when the intake offers it (intake README, "Not yet").

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

## What the AI's output needs from step 1b-items (done)
Core schema 2 now has all of this (DECISIONS "Placed cabinets in the master copy", 2026-11-08). Kept as the list the draft must fill in:
- **Placed cabinets** (BUILD_SPEC 6, PlacedItem): catalog item ID, width, height and depth, position (wall and distance along it, plus elevation, or room position for an island), rotation, item selections and modifications.
- **Which run a cabinet fills,** so the draft can be checked against the run it was given, and corners worked out.
- **Selections at job, room and item level,** with the order item → room → job, so the intake's picks (door style, colours, handles, interiors) land where the spec says.
- **`origin` on every cabinet** (`ai` or `designer`, plus the last editor), so the designer sees what the AI placed (BUILD_SPEC 5.6).
- **Somewhere to keep the AI's notes on its key decisions,** linked to the cabinets and rules they are about. DATA_MODEL puts the explanation in `draft_runs`, which this module owns; the master copy only needs stable cabinet IDs the notes can point to.
- **Status `ai_draft` and a version saved with origin `ai`,** which the master copy store (platform) provides.
- **Item layout checks** (overlap, past a wall's end, blocking an opening) and the catalog's buildability checks run over every cabinet, so a draft passes the same validation as a human design and a failed draft is kept with its issues.

## Next (the plan approved 2026-11-09)
0. **The shared database first:** the master copy store on Supabase, so live work doesn't live only in a browser (platform).
1. ~~Read the real intake (IK-15).~~ Done 2026-11-09.
2. ~~Move the room geometry helpers to Core.~~ Done 2026-11-09: `src/core/layout/room-geometry.ts` (inside spans, corners, where uppers go), with its numbers passed in.
3. **The layout engine** (ordinary code, no AI): fixed things first, purposeful appliance moves of at most 24", gaps filled with widths the catalog accepts, and a scorecard of rules met and broken for each option.
4. **The AI judge:** a server function (Netlify Functions) that picks between options, checks requirements and writes the notes. It never places a cabinet.
5. **Draft runs and the studio:** saved as a master copy version (origin `ai`), replacing the placeholder.

## Public API
`contract.ts`: `buildDesignBrief`, `BRIEF_FORMAT` (now 2: the intake rows changed shape), and the brief types, including `BriefAnswer`.
