# Cabinet design & CAD handoff platform

A platform where designers capture a room and the customer's selections, an AI proposes a layout, and the designer refines it in a visual editor. The finished design is translated into Cabinet Vision's ORDX import format. Once Cabinet Vision has engineered the job, the platform reads it back and checks that everything arrived as intended. Cabinet Vision stays responsible for how each cabinet is built.

No application code yet. The plan comes first: translation is proven (Phases 0–1) before the editor and AI are built.

## Files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Rules every AI coding session follows. |
| `docs/BUILD_SPEC.md` | The owner's spec: goals, principles, modules, master copy, phases. Authority. |
| `docs/ARCHITECTURE.md` | Folders, enforced dependency rules, gate, stack. |
| `docs/DATA_MODEL.md` | Tables and which module owns each. |
| `docs/DECISIONS.md` | What's decided, what was replaced, and the open questions. |
| `docs/BUILD_PLAN.md` | Phases broken into one-session steps. |
| `docs/intake/` | Visual intake (image selector) content per room type, starting with the kitchen. |
| `docs/ux/UX_BRIEF.md` | Visual UX/UI brief. |
| `modules/_TEMPLATE/CLAUDE.md` | Rules file copied into every new module folder. |
| `prompts/` | Ready-to-paste prompts for the Phase 0 and Phase 1 sessions. |
| `samples/cabinet-vision/` | Where the shop's real jobs and exports go (Phase 0). |
| `cabinet-vision-ucs/` | Separate project: the library of our Cabinet Vision UCSs. Has its own `CLAUDE.md` and `README.md`. |

## How to start

1. Gather the samples listed in `samples/cabinet-vision/README.md` and add them to the repo.
2. Meanwhile, run `prompts/01-scaffold-and-guardrails.md` (it doesn't need the samples).
3. With the samples in, run `prompts/00-cabinet-vision-discovery.md`, then review the format reference with someone who knows Cabinet Vision.
4. Run the rest of `prompts/` in order, one session each, and make the go/no-go call.
5. After each session, record new decisions in `docs/DECISIONS.md`.
