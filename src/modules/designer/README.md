# designer

Room capture (walls, angles, ceiling height, openings, obstacles, utilities) and visual editing of the layout. Draws only from the master copy, offers only the shop's catalog items, shows validation live, marks AI-placed vs designer-changed items.

Status: empty. Created by the Phase 1a scaffold (2026-11-05). See `CLAUDE.md` in this folder for the rules.

## Public API
`contract.ts` (empty so far).

## Decided
- Room drawing (walls, doors, windows) is our own tool on react-konva, drawn only from the master copy (DECISIONS 2026-11-05). react-konva is installed in the session that builds it.
