# shop-settings

Per-shop design rules (structured, with a plain-language description), default selections and preferences.

Status: design rules loaded as data and reviewed by the owner. Three of them are checked against the rough layout (2026-11-08); the rest wait for placed cabinets or other data (see "Design-rule checks"). See `CLAUDE.md` in this folder for the rules.

## Design rules (`data/design-rules.json`)
Design rules carried over from closet-builder on 2026-11-07 at the owner's request, then reviewed by the owner on 2026-11-07/08 (review page: https://claude.ai/artifact/7vv6Emc6tQgevJ3Pt2Sp8L). They cover layout, spacing, sizing, symmetry, alignment, fronts, clearances, kitchen and storage defaults, and countertops.

**How they are used (owner, 2026-11-07):** the AI designer gets the confirmed rules, the room's walls and cabinet runs, and the client's intake preferences, and drafts the best-fit design and layout. In the design tool, when a designer's own change breaks a rule, the rule's `design_tool` setting says what happens.

Each rule has:
- the closet-builder ID (HARD-, PREF-, PRIN-…; `CB-FACT-nn` for its numbered shop facts), so it can be traced back;
- a kind: `hard`, `preference`, `principle`, `front_rule`, `documentation`, `optional` or `rejected`;
- the rule in plain language, the owner's words and date as its source, and any lengths it uses;
- its status in closet-builder, and its status here, with the owner's review answer in the note:
  - **confirmed** (78): the AI designer uses it;
  - **declined** (4): the owner said no (construction details that come from the shop's library, grain across cabinets, U-shaped vanity drawers);
  - **candidate**: none left;
- for confirmed rules, `design_tool`:
  - `not_drawable` (9): the tool won't let it be drawn;
  - `error` (2): an error the designer must fix;
  - `suggestion` (36): on the running list of things that could be improved. Every confirmed preference is here;
  - `none` (27): guidance for the AI designer, or how the tool draws things;
  - left out (4): HARD-005, HARD-010, HARD-012, HARD-015, confirmed before the review asked this.

Build measurements the visual tool uses for drawing (door gaps, shelf spacing) are kept, but the shop's library is the authority: if its numbers differ, the library wins (owner, 2026-11-08).

The file also lists what was deliberately **not** imported or was removed in the review, and why.

The file is checked when the module loads. Any of these stops the app with the reason:
- a rule listed twice, a missing source, a length that isn't a length, or a link to a missing rule;
- a confirmed or declined rule with no reason;
- a design tool setting on a rule that isn't confirmed;
- a confirmed preference that isn't a suggestion.

## Design-rule checks (`model/design-rule-checks.ts`, 2026-11-08)
When a designer's own change breaks a confirmed rule, the rule's `design_tool` setting says what happens (owner, 2026-11-07/08). `error` and `suggestion` rules become checks with Core's check interface, in the `design_rules` layer:
- `error` → severity **block**;
- `suggestion` → severity **warn**: these make up the running list of design preferences that could be improved.

The severity is read from the rule's data, not written in the code. Every length comes from `design-rules.json`. Each message names its rule ID, and each check ID is `design_rules.<rule ID>`.

`data/design-rule-checks.json` names the appliance kinds that count as a sink (only `sink`, as in the rough layout). Building the checks stops the app with the reason if any of these is wrong:
- a checked rule is missing;
- a checked rule is not confirmed;
- a checked rule is not set to error or suggestion;
- a checked rule is missing a length it needs.

`not_drawable` rules are not checks: the design tool must refuse the edit (see below).

### Checked now (against walls, openings, runs, islands and appliances)
| Rule | Design tool | The check | Notes |
|---|---|---|---|
| HARD-014 Known site conditions | error → block | An all-pantry run stands in front of a window. | Uses the owner's rough-layout rule (2026-11-06: all pantry stays clear of windows). Only actual overlap is checked. The extra 3" clearance is the designer's drawing rule. Doors and passthroughs are already Core's block (`layout.runs-clear-doorways`). |
| PREF-011 Walkways 42" to 48" | suggestion → warn | The walkway between two cabinet runs that face each other squarely is under 36" (`strong_min`), 36" to under 42" (`preferred_min`), or over 48" (`preferred_max`). | Measured from run front to run front. Upper-only runs don't count. A nearer run or wall hides what is behind it, along the stretch it covers. Runs facing a bare wall, and runs on walls that aren't exactly parallel, are not checked yet (question DR-4). Uses the inside-of-room reading the room drawing uses; Core should own that one day. |
| PREF-023 Sink centred under a window | suggestion → warn | A sink stands in front of a window but its centre isn't exactly on the window's centre. | Uses the owner's own test (2026-11-07: tell me when a sink in front of a window is NOT centred), so it needs no "nearly". The "balance either side of a focal window" part waits for cabinets. |

### Not checked: a needed number hasn't been given (questions in `docs/DECISIONS.md`)
- **PREF-012** Islands line up with nearby runs: how close counts as "close"? (DR-1)
- **PREF-013** Fixtures roughly in line align exactly: how close counts as "roughly in line"? (DR-2)
- **PREF-014** A roughly centred island fixture is centred exactly: how close counts as "roughly centred"? (DR-3)

PRIN-006 (near enough becomes exact) is set to `none`, so it is not a check. It raises the same question.

### Waiting on placed cabinets (step 1b-items) or other data
| Rule | Design tool | Waits on |
|---|---|---|
| HARD-014 Known site conditions (the rest) | error | Obstacles: which obstacle kinds stop cabinets, and soffits against the tops of the uppers. Upper and tall heights come with placed cabinets. |
| CB-FACT-48 Crown sets the gap above the cabinets | error | Cabinet heights (placed cabinets), crown selections. Ceiling height exists. |
| HARD-016 No cabinet wider than 42" | suggestion | Placed cabinets |
| PREF-001 Cabinets 24" to 32" | suggestion | Placed cabinets |
| PREF-002 Few cabinets over 36" | suggestion | Placed cabinets |
| PREF-003 Avoid cabinets under 12" | suggestion | Placed cabinets |
| PREF-004 Fairly symmetrical runs | suggestion | Placed cabinets |
| PREF-016 Acceptable widths 12" to 36" | suggestion | Placed cabinets |
| PREF-017 Ideal door 14" to 16" | suggestion | Placed cabinets and their doors |
| PREF-021 Repeated widths make rhythm | suggestion | Placed cabinets |
| PREF-025 Up to 38", one cabinet beats two | suggestion | Placed cabinets |
| CB-FACT-25 Dividing a run into cabinets | suggestion | Placed cabinets, fillers and ends |
| PREF-019 Equal widths either side of a focal point | suggestion | Placed cabinets |
| PREF-018 Drawer and front lines carry across | suggestion | Placed cabinets and their fronts |
| PREF-020 Consistent top and bottom lines | suggestion | Placed cabinets and their heights |
| PREF-023 (balance around a focal window) | suggestion | Placed cabinets |
| PREF-024 Narrow doors beside a cooktop or sink hinge away | suggestion | Placed cabinets and hinge sides |
| PREF-006 Four-drawer bank near the sink | suggestion | Placed cabinets. It also needs "how close" (the rule's own open question). |
| PREF-007 Drawer banks beside the cooktop | suggestion | Placed cabinets |
| PREF-009 Cabinet over the fridge flush with the fridge panel | suggestion | Placed cabinets and panels |
| PREF-026 Drawers rather than doors | suggestion | Placed cabinets |
| PREF-027 Cutlery and utensil drawers | suggestion | Placed cabinets and interiors |
| PREF-028 Cutlery near the dishwasher | suggestion | Placed cabinets and interiors |
| PREF-029 Tray storage over the fridge | suggestion | Placed cabinets and interiors |
| PREF-030 Garbage pull-out between sink and prep | suggestion | Placed cabinets |
| PREF-031 Pull-outs in pantries | suggestion | Placed cabinets and interiors |
| PREF-032 Spice storage | suggestion | Placed cabinets and interiors |
| PREF-033 Corner mechanism | suggestion | Placed corner cabinets and their hardware |
| PREF-005 Shoe and boot shelves | suggestion | Placed cabinets and shelves |
| PREF-035 Laundry basics | suggestion | Placed cabinets, and a room type (intake) |
| PREF-036 Mudroom basics | suggestion | Placed cabinets, and a room type (intake) |
| PREF-037 The recommended closet cabinet | suggestion | Placed cabinets, and a room type (intake) |
| PREF-008 Countertop overhangs 1" | suggestion | Countertops |
| PREF-022 Style decides how many divisions | suggestion | The client's style (intake) and placed cabinets |

### `not_drawable` rules: what the designer enforces today (for a later designer session)
The design tool must refuse these edits; they are not checks. The designer module was not changed here.
| Rule | Enforced now? |
|---|---|
| HARD-001 Runs never occupy the same floor | **Partly.** On one wall, runs can't be drawn, slid or stretched over each other (and Core blocks it). **Not yet:** an island added, moved or resized over a wall run or another island, and wall runs crossing beyond the corner square. The owner said corner cabinets intersect by design. |
| HARD-002 A run stays inside its wall | **Partly.** Runs are drawn only between the inside corners. **Not yet:** shortening a wall (dragging a corner or typing a length) leaves its runs past the end. Core then blocks it, but the rule says the edit should shorten the runs and say so. |
| HARD-004 Boxes stand gable to gable | Not yet: waits on placed cabinets. |
| HARD-006 Cabinet over the fridge centred on it | **By construction:** the upper over a fridge is worked out from the fridge, not stored. It needs enforcing once cabinets are placed. |
| HARD-007 Whatever is over a cooktop centred on it | **By construction:** the hood is worked out, not stored (its width is assumed to match the range, which is still to be confirmed). It needs enforcing once cabinets are placed. |
| HARD-008 30" above the cooking surface | Not yet: needs upper heights (placed cabinets). The 30" is in the data. |
| HARD-009 Protecting combustibles beside a cooktop | Not yet. There is no verified value (the rule says not to use one until the code text is read). |
| HARD-011 Countertop into an appliance opening | Not yet: waits on countertops. |
| HARD-013 Anything that opens doesn't hit anything | Not yet. Cabinet doors and drawers wait on placed cabinets. **Could be done now for room doors:** the master copy has each door's width, hinge side and swing, so the tool could refuse a run inside a door's swing. |

### What the later designer session needs from this one
- `DESIGN_RULE_CHECKS` from `contract.ts`. Run them with Core's `runChecks` next to the wall and run checks.
- Issues with severity `warn` and layer `design_rules` make up the "could be improved" list. Issues with severity `block` are errors to fix.
- Each issue has `check_id` (`design_rules.<rule ID>`), a plain message that names the rule, and a `ref` to the run or appliance, so tapping it can select it.
- `DESIGN_RULES` gives each rule's title and plain wording, for a "why" link.
- The `not_drawable` gaps in the table above.

## Public API
`contract.ts`:
- `DESIGN_RULES`, `readDesignRules`, `DESIGN_TOOL_ACTIONS`, and the `DesignRule` types;
- design-rule checks: `DESIGN_RULE_CHECKS`, `buildDesignRuleChecks`, `designRuleCheckId`, `CHECKED_RULE_IDS`, `DESIGN_RULE_CHECK_SETTINGS`, `readCheckSettings`.
