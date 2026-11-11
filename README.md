# Cabinet design & CAD handoff platform

A platform for our own cabinetry sales: designers capture a room and the customer's design choices, the platform drafts a layout, and the designer refines it in a 3D editor. The finished design will be translated into Cabinet Vision's ORDX import format; once Cabinet Vision has engineered the job, the platform reads it back and checks that everything arrived as intended. Cabinet Vision stays responsible for how each cabinet is built.

## Where it is today (2026-11-11)
- **Running on the live site, for signed-in staff:** clients (real records in the shared database), and the design studio: design choices, room drawing, a placeholder design step (a fixed recipe, no AI yet) and Customize with a 3D view. Work saves automatically to the shared database.
- **Placeholders:** Today and Tasks (demo data), the design step's animation, photos in the design choices, live pricing (not connected).
- **Not built yet:** pricing, approvals and sign-off, the gate before sending, and the CAD import file. The file waits for real sample jobs from the shop (Phase 0, `samples/cabinet-vision/README.md`).

What runs and where: `docs/PROJECT_MAP.md`. Current requirements and what is open: `docs/REQUIREMENTS.md`. How to run and check the code: `docs/DEVELOPMENT.md`. Rules for AI sessions: `CLAUDE.md`.

## Next steps for the owner
1. Gather the samples listed in `samples/cabinet-vision/README.md` and add them to the repo.
2. With the samples in, run `prompts/00-cabinet-vision-discovery.md`, then review the format reference with someone who knows Cabinet Vision.
3. Answer the open questions in `docs/REQUIREMENTS.md` that block the work you want next.
