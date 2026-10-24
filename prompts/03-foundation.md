Read CLAUDE.md, docs/ARCHITECTURE.md and docs/DATA_MODEL.md.

Task: build the foundation in src/core/ and src/modules/jobs/ only.

core:
- Units (mm) and money (cents) helpers with tests.
- Permissions: tables, a can(user, permission) check, seed roles owner/admin/designer.
- Audit log written on every change.
- Alerts table, create/resolve API, global alert indicator component.
- Outbox: write event in same transaction, worker with retries, alert on final failure. Zod-validated event schemas.
- Config data loader with Zod validation (room types, stage definitions) and seed data.
- Locks: job and room locks, heartbeat via Supabase Realtime presence, end-of-day expiry, manager force-release, read-only mode helper.

jobs module:
- Clients, jobs, rooms, room_states with four independent state fields.
- Contract for reading jobs/rooms; events job.created, room.created.
- Minimal job list and job detail screens following docs/ux.

Tests for permissions, locks (including expiry and override), outbox failure → alert.
