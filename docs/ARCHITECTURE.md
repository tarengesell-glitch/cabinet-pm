# Architecture

## Shape: modular monolith

One codebase, one deployment, one database. Split into modules with enforced boundaries so that changing one part can't break another, and so AI coding sessions stay contained.

```
src/
  app/            UI shell, routing, page composition (thin; no business logic)
  core/           shared kernel: ids, units, money, permissions, audit, alerts,
                  events/outbox, locking, data-config loader, design system
  modules/
    jobs/           jobs, clients, rooms, room states, regions on a job
    pricing/        price lists, tax rules, partners, region routing
    quotes/         quick quotes and quote snapshots
    intake/         visual choices, questionnaire, selections
    mozaik-import/  import adapter, room versions, approved-version flag
    drawing-guide/  guided Mozaik drawing steps
    site-measure/   measurements, provenance, photos, verification
    appliances/     appliance and fixture library, job appliance specs
    job-notes/      notes extracted from comms, confirmation status
    checks/         discrepancies, tolerance evaluation, production gate
    approvals/      approval records and snapshots
    purchasing/     bought-in parts, supplier orders
    handoff/        manufacturing send
    settings/       admin UI for editing data (questions, rules, prices...)
  connectors/       one adapter per external system: gmail, crm, accounting,
                    texting, transcripts, suppliers, manufacturer
```

## Boundary rules (enforced, not optional)

- A module may import only from `src/core/**` and from other modules' `contract.ts`.
- `app/` may import module `contract.ts` and module UI entry points (`ui/index.ts`), nothing deeper.
- `core/` imports no module.
- `connectors/` import only `core/` and are called only through the events outbox.
- Enforced with `eslint-plugin-boundaries` and `dependency-cruiser` in CI. A boundary violation fails the build.
- Each module folder has its own `CLAUDE.md` (template in `modules/_TEMPLATE/`).

## Data ownership

| Data | Owner |
|---|---|
| users, roles, permissions | core |
| audit_log, alerts, outbox, locks | core |
| config data (room types, stages, etc.) | settings (writes) / core (loads) |
| jobs, clients, rooms, room_states | jobs |
| regions, partners, price_lists, tax_rules, routing_rules | pricing |
| quotes, quote_lines, quote_snapshots | quotes |
| questions, option_images, selections | intake |
| mozaik_imports, room_versions | mozaik-import |
| drawing_steps, drawing_progress | drawing-guide |
| measurements, measurement_photos | site-measure |
| appliances, job_appliances | appliances |
| job_notes, message_sources | job-notes |
| discrepancies, tolerance_rules, site_corrections | checks |
| approvals, approval_snapshots | approvals |
| purchase_items, supplier_orders | purchasing |
| manufacturing_sends | handoff |

Room states (approval, invoicing, site verification, production) are written only by `jobs`, in response to events from the modules that decide them.

## Events (outbox pattern)

Modules never call each other to cause side effects. They write an event to the `outbox` table in the same transaction as their change. A worker delivers events to listening modules and connectors. Failed deliveries retry, then raise an alert that stays until resolved.

Starting catalogue (extend as needed, document in each module):
`job.created`, `room.created`, `quote.issued`, `selection.recorded`, `mozaik.room_version_imported`, `measurement.verified`, `measurement.discrepancy_found`, `discrepancy.opened`, `discrepancy.resolved`, `room.approved`, `room.invoice_requested`, `room.production_ready`, `room.released_to_production`, `purchase.order_sent`, `purchase.order_failed`, `jobsetting.changed`.

Event payloads are versioned and validated with Zod.

## Locking

- Lock units: job level and room level.
- Acquire on entering edit mode. Others get read-only with "X is editing".
- Heartbeat every ~30 s; lock released when heartbeats stop (computer closed or session dropped) or at end of day. Manager override to force release.
- Job-wide setting changes while a room is locked notify the room's editor; they don't silently change the room.

## Recommended stack (confirm in session 1)

Chosen for being well known to AI coding tools and minimal moving parts for a solo builder.

- TypeScript (strict), Next.js (App Router)
- Supabase: Postgres, Auth, Storage (images, photos, imports), Realtime presence for lock heartbeats, Row Level Security. Use the Canada region.
- Drizzle ORM and migrations
- Zod for validation of contracts, events and config data
- Tailwind + shadcn/ui + Lucide icons
- Vitest (unit), Playwright (UI flows, screenshots)
- Hosting: Netlify (Next.js runtime) + Supabase. Heavy file processing runs in Supabase Edge Functions, not Netlify functions.

## Getting data out of Mozaik

Mozaik is a Windows desktop app and can't be written to. Data comes out two ways:
- Files Mozaik writes when the user clicks "Generate 3D SketchUp Model" (SketchUp itself isn't needed).
- The saved Mozaik job files (client, address, notes, hardware, pricing runs), if readable.
Details in `docs/MOZAIK_EXPORT_FINDINGS.md`.

Phase 1: manual drag-and-drop upload in the web app (`mozaik-import`).
Phase 2: `desktop-uploader/`, a Windows tray app that watches the export folder and calls the same upload
endpoint with a per-device API key. It is a separate app in the repo, not a module, and contains no business logic.

Raw files are stored untouched in Supabase Storage. Matching uses Mozaik IDs where available, names as fallback,
and the user always confirms the match.

## Failure handling

Every failure creates a row in `alerts` (severity, module, job/room, message, created, resolved_by, resolved_at). Alerts show in a global indicator and on the affected job and can't be dismissed without a resolution note.
