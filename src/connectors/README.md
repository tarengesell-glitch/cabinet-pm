# connectors

One folder per outside service (email, texting, meeting transcripts, payments, suppliers, accounting later), each with a `contract.ts`. Connectors import `core` and `platform` only, are called only through the outbox, and are never imported by modules. A mocked connector is labelled as mocked in code and UI (CLAUDE.md rule 14).

Status: empty. Created by the Phase 1a scaffold (2026-11-05).
