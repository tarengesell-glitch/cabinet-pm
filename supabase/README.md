# supabase

The shared database's tables, rules and their history, as SQL files applied in name order to the Supabase project **cabinet-pm** (Canada; DECISIONS AD-3). Each file is applied once, through the Supabase connector, and never edited afterwards. A change is a new file.

- `20261109000001_master_copy_store.sql`: staff, shops, master copy versions, the audit log and alerts, with row-level security and the rules that keep history unchanged.
- `20261109000002_private_staff_check.sql`: moves the "is staff" check out of the public web API (Supabase security check), and indexes the link from a version to its parent.

- `20261109000003_studio_jobs.sql`: files each studio room's master copy under its studio job and room, and adds `intake_answer_versions` for the design choices, with the same rules.

- `20261109000004_customers.sql`: real clients (projects): staff only, never deleted, every add and change audited.

What these enforce, and how to add a person, is in `src/platform/README.md`.
