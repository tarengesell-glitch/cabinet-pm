# catalog

Our own list of what can be designed: item types, allowed size ranges and increments, options, required selections and invalid combinations. Stable IDs and a version history. Pricing reads from here (prices are not in yet: the owner sets per-inch prices later, kept separate from cabinet data).

Status: **catalog version 1** (2026-11-07), 50 cabinet types built from the owner's review of the shop's own design library. See `docs/DECISIONS.md` "2026-11-07: The cabinet catalog".

## Where things are
- `data/catalog-v1.json`: the catalog, as data. Every value carries the key of its source (`owner-review`, `library` or `unknown`).
- `model/catalog.ts`: reads and checks the file. A bad file stops the app at start-up with every problem listed.
- `model/current.ts`: the published versions. **A published version file is never edited.** A change is a new file (`catalog-v2.json`) with a higher `catalog_version`; `__tests__/versions.test.ts` holds each published file's fingerprint and fails if one changes.
- `model/checks.ts`: the buildability checks.

## What is in version 1
- **filler:** Base filler; Upper filler; Tall filler; Vanity filler
- **panel:** Thick end; Island back panel; Furniture end panel
- **base:** Base, doors; Base, doors with roll-outs; Base, drawer over doors; Base, drawer over doors with roll-outs; Base, two drawers over doors with roll-outs; Base, 3 drawers; Base, 4 drawers; Sink base; Angled end base; Spice pull-out; Garbage pull-out; Blind corner base; Blind corner base with pull-out organizer
- **appliance_opening:** Dishwasher opening
- **drawer_unit:** Pencil drawer
- **corner_base:** Corner base; Corner base, adjustable shelves; Corner drawer base
- **wall:** Upper, doors; Upper, doors, 36" high or more; Upper, short, no shelf; Upper with under-cabinet light; Microwave upper; Open shelf end; Upper over toilet
- **corner_wall:** Upper corner, 45-degree; Upper corner
- **shelf:** Floating shelf
- **bath:** Mirror cabinet; Medicine cabinet; Small medicine cabinet
- **tall:** Tall, oven opening; Tall pantry; Tall, double wall oven; Tall, appliance stack
- **closet:** Closet tower
- **vanity:** Vanity sink; Vanity, 3 drawers; Vanity, 4 drawers; Vanity, drawer over doors; Furniture vanity, 2 drawers; Furniture vanity, 1 drawer; Vanity sink with side drawers

Each item records: a stable UUID and a code; its type; a plain description; which library templates it came from (by number and name, with their example sizes); whether it can be resized; width, height and depth (standard size, smallest, largest, step); its fronts from top to bottom (a door or drawer count of `null` means the door or drawer rules set it from the size); what is inside; whether it has a toe kick; its options, required choices and defaults; and the owner's notes.

Options: door style (shaker 2 1/4", slim shaker 1", slab), hinge side, left or right version, left end and right end (unfinished, applied finished end, finished end) and sink front (full-height doors with a skirt front, false drawer front, tip-out tray). No invalid combinations have been named yet.

Left out (owner removed them, listed in the file under `not_included`): fluted fillers, accessible cabinets, the hood shelf, the closet wall cabinet, the hair dryer pull-out, a medicine cabinet and the Altima job items. The specialty items the owner hasn't reviewed are not in the catalog at all.

## Buildability checks (all block)
They take one placed cabinet at a time (`checkPlacement`), because the master copy has no placed cabinets yet (Core step 1b-items). Once it does, a Core check runs them over every cabinet in a job.

| ID | Fails when |
|---|---|
| `catalog.item-available` | The cabinet type isn't in this shop's catalog, or is excluded or "manual work" |
| `catalog.size-in-range` | A size is below the smallest or above the largest, a fixed-size item is any other size, or the limit isn't known yet |
| `catalog.size-on-step` | A size isn't on the step (width: 1/16"), or the step isn't known yet |
| `catalog.required-selections` | A required choice (door style, ends, left/right, sink front…) is missing |
| `catalog.selections-valid` | A choice isn't one the item offers |
| `catalog.no-invalid-combinations` | Two choices that can't go together are both made |

**A cabinet at its standard size always passes the size checks.** Any other size in a direction whose limit or step isn't known yet is refused, saying so (rule 7).

## Not known yet (DECISIONS CAT-1)
| Item | Missing |
|---|---|
| Base filler (`base_filler`) | width min/max; height min/max/step; depth min/max/step |
| Upper filler (`wall_filler`) | width min/max; height min/max/step; depth min/max/step |
| Tall filler (`tall_filler`) | width min/max; height min/max/step; depth min/max/step |
| Vanity filler (`vanity_filler`) | width min/max; height min/max/step; depth min/max/step |
| Thick end (`thick_end`) | width min/max; height min/max/step; depth min/max/step |
| Island back panel (`island_back_panel`) | width min/max; height min/max/step; depth min/max/step |
| Furniture end panel (`furniture_end_panel`) | width min/max; height min/max/step; depth min/max/step |
| Base, doors (`base_doors`) | height min/max/step; depth min/max/step |
| Base, doors with roll-outs (`base_doors_rollouts`) | height min/max/step; depth min/max/step |
| Base, drawer over doors (`base_drawer_doors`) | height min/max/step; depth min/max/step |
| Base, drawer over doors with roll-outs (`base_drawer_doors_rollouts`) | height min/max/step; depth min/max/step |
| Base, two drawers over doors with roll-outs (`base_2drawers_doors_rollouts`) | height min/max/step; depth min/max/step |
| Base, 3 drawers (`base_3_drawers`) | width max; height min/max/step; depth min/max/step |
| Base, 4 drawers (`base_4_drawers`) | width max; height min/max/step; depth min/max/step |
| Sink base (`sink_base`) | height min/max/step; depth min/max/step |
| Dishwasher opening (`dishwasher_opening`) | width min/max; height min/max/step; depth min/max/step |
| Pencil drawer (`pencil_drawer`) | width min/max; height min/max/step; depth min/max/step |
| Angled end base (`angled_end_base`) | height min/max/step; depth min/max/step |
| Spice pull-out (`spice_pullout`) | width min/max; height min/max/step; depth min/max/step |
| Garbage pull-out (`garbage_pullout`) | width max; height min/max/step; depth min/max/step |
| Blind corner base (`blind_corner_base`) | width max; height min/max/step; depth min/max/step |
| Blind corner base with pull-out organizer (`corner_organizer_base`) | width max; height min/max/step; depth min/max/step |
| Corner base (`corner_base`) | width min/max; height min/max/step; depth min/max/step |
| Corner base, adjustable shelves (`corner_base_adjustable`) | width min/max; height min/max/step; depth min/max/step |
| Upper, doors (`upper_doors`) | height min/max/step; depth min/max/step |
| Upper, doors, 36" high or more (`upper_doors_36`) | height min/max/step; depth min/max/step |
| Upper, short, no shelf (`upper_no_shelf`) | height min/max/step; depth min/max/step |
| Upper with under-cabinet light (`upper_with_lights`) | height min/max/step; depth min/max/step |
| Microwave upper (`microwave_upper`) | height min/max/step; depth min/max/step |
| Upper corner, 45-degree (`upper_corner_45`) | width min/max; height min/max/step; depth min/max/step |
| Upper corner (`upper_corner_90`) | width min/max; height min/max/step; depth min/max/step |
| Floating shelf (`floating_shelf`) | width min/max; height min/max/step; depth min/max/step |
| Open shelf end (`open_shelf_end`) | width max; height min/max/step; depth min/max/step |
| Upper over toilet (`above_toilet`) | height min/max/step; depth min/max/step |
| Mirror cabinet (`mirror_cabinet`) | width min/max; height min/max/step; depth min/max/step |
| Medicine cabinet (`medicine_cabinet`) | width min/max; height min/max/step; depth min/max/step |
| Small medicine cabinet (`medicine_cabinet_small`) | width min/max; height min/max/step; depth min/max/step |
| Tall, oven opening (`tall_oven`) | width min; height min/max/step; depth min/max/step |
| Tall pantry (`tall_pantry`) | width min; height min/max/step; depth min/max/step |
| Tall, double wall oven (`tall_double_oven`) | width min; height min/max/step; depth min/max/step |
| Tall, appliance stack (`tall_appliance_stack`) | width min; height min/max/step; depth min/max/step |
| Closet tower (`closet_tower`) | width min/max; height min/max/step; depth min/max/step |
| Vanity sink (`vanity_sink`) | height min/max/step; depth min/max/step |
| Vanity, 3 drawers (`vanity_3_drawers`) | width max; height min/max/step; depth min/max/step |
| Vanity, 4 drawers (`vanity_4_drawers`) | width max; height min/max/step; depth min/max/step |
| Vanity, drawer over doors (`vanity_drawer_doors`) | height min/max/step; depth min/max/step |
| Furniture vanity, 2 drawers (`vanity_furniture_2_drawers`) | width max; height min/max/step; depth min/max/step |
| Furniture vanity, 1 drawer (`vanity_furniture_1_drawer`) | width max; height min/max/step; depth min/max/step |
| Vanity sink with side drawers (`vanity_sink_side_drawers`) | height min/max/step; depth min/max/step |

## Public API
`contract.ts`: `CURRENT_CATALOG`, `catalogVersion(n)`, `catalogItem`, `readCatalog`, `checkPlacement`, `CATALOG_CHECKS` and the types.
