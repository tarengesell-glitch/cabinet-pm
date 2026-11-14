# Kitchen images (pilot)

Renders the image selector's kitchen pictures in Blender: one scene file, one camera, every option
built to size, so the layout never moves and masks come straight from the render.
Owner decision: Blender first, AI only for touch-ups (2026-11-13, `docs/DECISIONS.md`).

The options and colours come from `src/modules/visual-library/data/` (the catalog).

## Set up (once)
- Blender 5.3.0 (`brew install --cask blender`).
- `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
- `.venv/bin/python -I fetch_assets.py`: the CC0 textures from Poly Haven, recorded in `licenses.json`.

## Run the pilot
1. `.venv/bin/python -I run_job.py jobs/pilot.json output/pilot` renders every variant (skips ones already done).
2. `.venv/bin/python -I qa/selftest.py` proves the checks catch what they should.
3. `.venv/bin/python -I qa/check.py jobs/pilot.json output/pilot` runs the drift, handle-length and re-colour checks and writes `qa.json`.
4. `.venv/bin/python -I report/contact_sheet.py jobs/pilot.json output/pilot` builds the review page in `output/pilot/sheet/`.

## Files
- `scenes/l_shape_island.json`: room, runs, island, lights and camera, in inches (PROPOSED, presentation only).
- `jobs/pilot.json`: base picks, the variants, and the pilot's PROPOSED looks (counter colours, stain tints).
- `blender/`:
  - `build_scene.py`: builds the scene;
  - `render_job.py`: renders one variant;
  - `parts/`: doors, hardware, cabinets, island, appliances, room, props;
  - `materials.py`.
- `qa/`:
  - `check.py`: the checks;
  - `recolour.py`: runs inside Blender;
  - `metrics.py`: CIEDE2000 and drift;
  - `selftest.py`.
- `output/` and `assets/` are not committed.
