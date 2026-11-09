# platform (PROPOSED in docs/ARCHITECTURE.md)

Shared services that need a database or framework: db access, users, roles and permissions (`can(user, permission)`), audit log, alerts, locks, the master copy store, the config loader and design-system components. No business rules. May import `core` only.

Status: permissions, the design system and **the shared database** (2026-11-09, steps 0a and 0b). The design studio and the office screens use it; how is in `src/app/sync/README.md`.

## The shared database (`store/`, 2026-11-09)
The owner: "live work shouldn't live solely in a browser" (DECISIONS "AI designer: how it works"). The database is the Supabase project **cabinet-pm** in Canada (DECISIONS AD-3). Its tables are made by the files in `supabase/migrations/`, which were applied to the project through the Supabase connector.

**What the database itself enforces** (tested against the real project, inside transactions that were thrown away):
- Only signed-in people **on the staff list** can read or write anything. Someone signed in but not on the list sees nothing. Someone signed out sees nothing.
- **Master copy versions are never changed or deleted.** A save is a new version made from the one on screen. If two people save from the same version, only the first save lands; the second is told to reload. Versions can't skip a number, and a document can't be filed under another job or shop.
- **No one can save as someone else**, and no one can write the audit log directly.
- **Every saved version and every alert writes an audit log row** in the same step.
- **Alerts stay until a person resolves them with a note.** An alert's message can't be reworded, and a resolved alert can't be reopened.

**The code** (`store/`, exported from `platform`):
- `signedInStaff`: the signed-in person, from the staff list, as a `User` for `can()`.
- `loadLatest`, `loadVersion`, `history`, `saveVersion`:
  - every document is checked against Core's master copy schema before saving and after loading;
  - a job never saved comes back as "none", never as an empty job.
- `loadLatestStudioRoom` and `saveVersion(… filedUnder)`: a studio room's master copy, filed under its studio job and room (PROPOSED stand-in until real jobs exist, BUILD_PLAN 7a).
- `loadLatestChoices`, `saveChoices`: a studio job's design choices (table `intake_answer_versions`, owned by intake; the store only keeps versions, and the intake checks their shape).
- `isSavedByOthersFirst`: tells a refused save from someone else saving first.
- `raiseAlert`, `openAlerts`, `resolveAlert`.
- `sendSignInLink`, `signOut`: sign-in by an emailed link, only for people the owner has invited.
- `supabaseSettings`, `supabaseClient`, `supabaseBackend`: the connection. The address and publishable key come from the site's Netlify settings (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Without them, the store says the database isn't set up.

Every failure is a plain-language reason, and a save is reported only once the database has it. The tests use an in-memory stand-in (`store/mocked-database.ts`, labelled MOCKED, for tests only) that follows the same rules.

**Adding a person (owner, in the Supabase dashboard):**
1. Authentication → Users → Invite user, with their email.
2. Table Editor → `staff` → Insert row:
   - `user_id`: the new user's ID, copied from the Users list;
   - `name`;
   - `roles`: for example `{designer}`.

   Which permissions each role has is `permissions/roles.json`.

## Design system (2026-11-08)
`design-system/tokens.css` holds the colours, fonts and shadows every screen uses (DECISIONS C-2: the owner's Kitchen Studio prototype, which is closet-builder's design system). The app's root layout imports it once and loads the fonts. Modules use the variables and add no palettes of their own; the room plan repeats the few colours it needs in `designer/ui/theme.ts`, because a canvas can't read CSS variables.
