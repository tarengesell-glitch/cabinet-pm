# visual-library

How things look: models, textures, door-style previews and icons, linked to catalog items by ID. No dimensions or rules.

See `CLAUDE.md` in this folder for the rules.

## Kitchen image library: the variables (2026-11-10)
Every option the image selector shows, and what each photorealistic image must change. Owner decisions are in `docs/DECISIONS.md` ("Kitchen image library, the variables"). Open questions are IK-19 to IK-24.

- `data/kitchen-image-variables.json`:
  - the groups, variables and options, each with the photo region it changes and a prompt;
  - when each one shows;
  - which other picks an image also changes with (`varies_with`);
  - the default kitchen;
  - the rules in words.
- `data/colours/*.json`: the Tafisa TFL, Sherwin-Williams and stain lists. They are empty until the owner supplies them (IK-20 to IK-22). Nothing in them is made up.
- `model/variables.ts`:
  - checks the files against a schema and against each other: every condition, region, colour list and default must point at something real;
  - refuses the whole catalog with the reasons otherwise;
  - `imagePlan()` counts the images each step needs.

How the images get made (owner, 2026-11-10):
- Each step varies one thing on the default kitchen (L-shape with island).
- Images are AI edits of one locked base photo per room shape, masked to one region.
- Each image is anchored to a real reference photo the owner has approved.
- Each image is checked automatically before it is kept.

The reference finder, the base photos and masks, and the generate, check and retry loop are later steps.

## Public API
`contract.ts`: `IMAGE_CATALOG` (the checked catalog, or the reason it can't load), `imagePlan`, and their types. No other module uses it yet.
