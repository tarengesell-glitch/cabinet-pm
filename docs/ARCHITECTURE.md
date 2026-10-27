# Architecture

This doc turns `docs/BUILD_SPEC.md` (sections 4, 5 and 7) into folders and rules that the tooling enforces. The spec's principles (P1–P7) and module map are authority. Everything marked **PROPOSED** here is a design choice made while writing this doc. It is waiting for the owner's yes and is listed in `docs/DECISIONS.md`.

## Shape: modular monolith

There is one codebase, one deployment and one database. It is split into modules with enforced boundaries, so changing one part can't quietly break another and AI coding sessions stay contained. (Decided 2026-10-24, still in force.)

## Folders

```
src/
  app/                    Next.js routes and page composition. The composition root: it registers each
                          module's checks with the gate and wires "send" to the adapter. No business logic.
  core/                   Spec "Core": master copy format (Zod schemas), base unit and conversions,
                          angle convention, geometry, layout checks, validation interface.
                          PURE: no database, network, React, clock or randomness.
  platform/               PROPOSED. Shared services that need a database or framework: db access,
                          users, roles and permissions, audit log, alerts, locks, master copy store,
                          config loader, design-system components. No business rules.
  modules/
    catalog/              Product Catalog
    shop-settings/        Shop Settings
    visual-library/       Visual Library
    designer/             Designer: room capture, visual editor, rendering
    ai-design/            AI Design
    comparer/             Comparer
    projects/             Projects & Sales: customers, jobs, quotes, payment status, milestones
    test-library/         Translator Test Library (the runner; the cases are files in golden/)
    -- added by owner amendments OA-3 to OA-9 (2026-10-27) --
    intake/               Visual intake (image selector): questions, options, images, answers
    appliances/           Appliance specs per job: rough, then confirmed
    site-measure/         Site measurements with provenance, verified explicitly
    approvals/            Client sign-off on an exact master copy version
    job-notes/            The running tally from email, texts and meeting transcripts
    client-messaging/     Reminders of outstanding items and the deadline ticker
    purchasing/           Automatic orders when a job goes into production
  connectors/             One adapter per outside service (email, texting, meeting transcripts,
                          payments, suppliers, accounting later). Imports platform and core only.
                          Called only through the outbox; never imported by modules.
  adapters/
    cabinet-vision/       Mapping tables, catalog sync, preflight, ORDX writer, reader,
                          independent verification. The only code that knows Cabinet Vision exists.
helpers/
  cabinet-vision/         Later: the small helper app on the computer running Cabinet Vision (OA-6). Not a module.
golden/
  cabinet-vision/         Golden test cases: master copy, expected ORDX, expected engineered output
samples/
  cabinet-vision/         Raw discovery material from the shop (Phase 0), kept untouched
docs/
  cabinet-vision/         ORDX format reference and other vendor findings (Phase 0)
cabinet-vision-ucs/       Separate project: the shop's UCS library (see its CLAUDE.md). Not part of
                          the platform; nothing imports from it and the platform checks skip it.
```

**Why `platform/` is separate from `core/` (PROPOSED).** The spec says Core depends on nothing, and P5 needs translation to be repeatable. The earlier plan put users, audit, alerts and locks in "core", but those need a database. Splitting them out keeps Core pure and testable without a database. `platform/` may import `core/`; `core/` imports nothing.

## Dependency rules (enforced)

These are enforced by `eslint-plugin-boundaries` and `dependency-cruiser`. A violation fails `npm run check`. Never disable or weaken these rules to make a change pass.

| Folder | May import | Notes |
|---|---|---|
| `core` | nothing (Zod and listed pure libraries only) | Spec 5.1 |
| `platform` | `core` | Infrastructure, not in the spec's map |
| `modules/catalog` | `core`, `platform` | |
| `modules/shop-settings` | `core`, `platform`, `catalog` | |
| `modules/visual-library` | `platform`, `catalog` (item ID types only) | |
| `modules/designer` | `core`, `platform`, `catalog`, `shop-settings`, `visual-library`, `appliances` | |
| `modules/ai-design` | `core`, `platform`, `catalog`, `shop-settings`, `intake`, `appliances` | Never `designer`. Intake answers are its "design desires" (OA-3) |
| `modules/comparer` | `core`, `platform` | The comparison itself is a pure function |
| `modules/projects` | `core`, `platform`, `catalog` | Links to designs by job ID only |
| `modules/intake` | `core`, `platform`, `catalog` | Options link to catalog options |
| `modules/appliances` | `core`, `platform` | |
| `modules/site-measure` | `core`, `platform` | |
| `modules/approvals` | `core`, `platform` | |
| `modules/job-notes` | `core`, `platform` | |
| `modules/client-messaging` | `core`, `platform`, and the contracts of `projects`, `intake`, `appliances`, `site-measure`, `approvals` | Reads what's outstanding; never writes their data |
| `modules/purchasing` | `core`, `platform`, `catalog` | |
| `connectors/*` | `core`, `platform` | |
| `modules/test-library` | `core`, `platform`, `adapters/*` | |
| `adapters/cabinet-vision` | `core`, `platform`, `catalog` | Never `designer`, `ai-design`, `projects` |
| `app` | any module's `contract.ts` and `ui/index.ts` | Nothing deeper |

On top of the table:
- **Contracts only.** A module imports another module only through its `contract.ts` (and `ui/index.ts` for the app). Internals are private.
- **The vendor-name check.** A script fails the check if "Cabinet Vision", "CabinetVision" or "ORDX" (any case) appears outside `src/adapters/cabinet-vision/`, `helpers/cabinet-vision/`, `golden/cabinet-vision/`, `samples/cabinet-vision/`, `cabinet-vision-ucs/` and `docs/`. When the UI needs to name the target (for example "Send to …"), it gets the name from the adapter's contract.
- **No AI in the translation path.** `adapters/**` and `core/**` may not import an AI SDK. Code in `core/` and in the writer and reader may not read the clock or random numbers. Times and IDs are passed in.

## The master copy (P1)

- Its format is Zod schemas in `core/`, following BUILD_SPEC section 6, with a `schema_version` field so later format changes can be migrated.
- **Storage (PROPOSED):** one versioned document per job, stored as JSON in Postgres and kept by `platform/`'s master copy store. Every save is a new version and old versions are never edited. Each version records its parent, who saved it and whether it came from AI or a designer. The store only checks the schema; all business rules live in the modules.
- **Who writes it (PROPOSED):**
  - `designer` saves edits.
  - `ai-design` saves drafts (status `ai_draft`).
  - `adapters/cabinet-vision` saves *returned* copies as separate records linked to the version that was sent.
  - Nobody else writes it.
- A version that has been sent is frozen. A fix is a new version, never an edit to the old one.

## Validation and the ready-to-send gate (BUILD_SPEC section 7)

- `core/` defines the check interface. A check has an id, a layer (layout, buildability, design rules, translation preflight, approval) and a function `run(masterCopy, context) → Issue[]`.
- An issue has a severity (`block` or `warn`), the item or wall it is about, and a plain-language message.
- Each module provides its checks through its contract. `app/` registers them, so Core never knows who they are.
- A shop can promote a design rule from warn to block. That setting is data in `shop-settings`.
- **The push conditions (OA-5).** On top of the spec's layers, the gate has a **release** layer. Each condition is a check provided by its owning module:

  | Condition | Check provided by |
  |---|---|
  | The client signed off this exact version | `approvals` |
  | Every appliance in the job has a confirmed spec, and the design matches it | `appliances` |
  | The site is measured: required measurements are verified, and the design uses them | `site-measure` |
  | The job is paid | `projects` (from the payment connector) |

  Translation happens once, as "a single push", when every layer passes.
- A gate result is stored against one exact master copy version. Translation needs a passing gate result for that same version, plus a designer's approval.

## Determinism (P5)

The writer is a pure function: (master copy version + mapping snapshot) → file bytes. The same input gives a byte-identical file, and the golden test library proves it. AI writes and fixes this code during development; it never runs inside it.

## Carried over from the earlier plan (still decided)

- **Fail loudly.** Every failure writes a row to `alerts` (severity, module, job, message, created, resolved by, resolved at). Alerts show in a global indicator and on the job. An alert can't be dismissed without a resolution note.
- **Audit log** on every write: actor, entity, id, action, before, after, time.
- **Permissions.** Every screen and action calls `can(user, permission)`. Roles are data. The first roles are owner, admin and designer.
- **Locking.** One editor at a time, others read-only with "X is editing". A heartbeat releases dropped sessions. Managers can force-release, and that is audited. Whether the lock is per job or per room is an open question.
- **Events / outbox.** Modules write an event in the same transaction as their change, and a worker delivers it to listening modules and connectors. Failed deliveries retry, then raise an alert. This carries the automatic flows:
  - client reminders (OA-8);
  - incoming email, texts and transcripts (OA-7);
  - automatic orders (OA-9);
  - the automatic catalog sync and read-back loops (OA-6).

## Stack (proposed 2026-10-24, still awaiting confirmation)

- TypeScript (strict), Next.js (App Router), hosted on Netlify.
- Supabase in the Canada region: Postgres, Auth, Storage (samples, exports, returned files), Realtime presence for locks.
- Drizzle ORM and migrations; Zod for every schema, contract and file format.
- Tailwind, shadcn/ui and Lucide.
- Vitest (unit and golden tests) and Playwright (UI flows).
- Added for this spec, each chosen when its phase arrives:
  - an XML/file library for the writer and reader, once the ORDX format reference exists (Phase 0–1);
  - three.js / react-three-fiber for the editor (Phase 5);
  - the Claude API, server-side only, for AI Design (Phase 6).

## Getting data back out of Cabinet Vision (automatically, OA-6)

Cabinet Vision runs on Windows. Both loops must run without anyone remembering to do them:
- the library sync (library changes reach our catalog mappings);
- the job read-back (every engineered job comes back and is compared).

That almost certainly needs a small helper app on the computer running Cabinet Vision. It watches for exports or reads the database and sends them up with a per-device key. It holds no business logic. Which computer that is, and its internet connection, is open question CV-1. The read-back source (ORDX export, SQL database or reports) is chosen in Phase 0. Raw files are always stored untouched before parsing.

## Photorealistic viewing (OA-3)

The spec put photorealistic rendering out of scope; the owner reversed that on 2026-10-27. What "photorealistic" has to mean (a realistic 3D view the client can turn in the browser, or rendered still images) is open question R-1. Either way, it draws only from the master copy (P6), and its materials come from the visual library.
