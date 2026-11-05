# platform (PROPOSED in docs/ARCHITECTURE.md)

Shared services that need a database or framework: db access, users, roles and permissions (`can(user, permission)`), audit log, alerts, locks, the master copy store, the config loader and design-system components. No business rules. May import `core` only.

Status: empty. Created by the Phase 1a scaffold (2026-11-05).
