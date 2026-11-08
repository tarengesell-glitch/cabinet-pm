# platform (PROPOSED in docs/ARCHITECTURE.md)

Shared services that need a database or framework: db access, users, roles and permissions (`can(user, permission)`), audit log, alerts, locks, the master copy store, the config loader and design-system components. No business rules. May import `core` only.

Status: empty. Created by the Phase 1a scaffold (2026-11-05).

## Design system (2026-11-08)
`design-system/tokens.css` holds the colours, fonts and shadows every screen uses (DECISIONS C-2: the owner's Kitchen Studio prototype, which is closet-builder's design system). The app's root layout imports it once and loads the fonts. Modules use the variables and add no palettes of their own; the room plan repeats the few colours it needs in `designer/ui/theme.ts`, because a canvas can't read CSS variables.
