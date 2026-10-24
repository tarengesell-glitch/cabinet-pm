# Cabinetry Job Platform — Starter Pack

Planning and guardrail files for building an in-house job management tool around Mozaik cabinet software. No application code yet. These files let Claude Code (or any AI coding tool) start building with the decisions, architecture and rules already in place.

## What's in here

| File | Purpose |
|---|---|
| `CLAUDE.md` | Rules every AI coding session must follow. Put at the repo root. |
| `docs/PRODUCT_SPEC.md` | What the tool does and why. |
| `docs/ARCHITECTURE.md` | Modular monolith, module list, data ownership, events, recommended stack. |
| `docs/DATA_MODEL.md` | Core entities, states, units, locking and approval data. |
| `docs/DECISIONS.md` | Decisions made, and questions still open. |
| `docs/BUILD_PLAN.md` | Build order, one Claude Code session at a time. |
| `docs/ux/UX_BRIEF.md` | Visual UX/UI brief, corrected to match the decisions above. |
| `modules/_TEMPLATE/CLAUDE.md` | Rules file copied into every new module folder. |
| `prompts/` | Ready-to-paste prompts for the first Claude Code sessions. |
| `samples/mozaik/` | Drop real Mozaik exports here before building the import. |

## How to start

1. Do the Mozaik export investigation in `prompts/00-mozaik-export-investigation.md` (on the Mozaik computer, then one Claude Code session).
2. Create an empty repo, copy this whole folder in, and open it in Claude Code.
3. Run the prompts in `prompts/` in order, one session each. Review and commit between sessions.
4. After each session, update `docs/DECISIONS.md` with anything new you decided.
