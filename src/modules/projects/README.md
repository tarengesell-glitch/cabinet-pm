# projects

Customers, leads, jobs, quotes, payments status, milestones and scheduling. Links to designs by job ID only; stores no design data.

See `CLAUDE.md` in this folder for the rules.

## Real clients (`model/customers.ts`, 2026-11-09)
Real clients live only in the shared database (table `customers`, `supabase/migrations/20261109000004_customers.sql`), where only signed-in staff can read them.

**Never put a real client's details in code, tests, commits or docs.** The repository is public, and the site's code reaches every visitor's browser (DECISIONS "Real clients live only in the database"). Tests use made-up people.

- `checkNewCustomer(form)` checks a new client and refuses with every reason. It needs:
  - a household name;
  - a named primary contact with an email or a phone;
  - emails and phones that look right;
  - a name on the second contact, if one is given.

  Blank optional fields stay empty; nothing is filled in.
- `loadCustomers(db)` reads the clients. A row in the wrong shape is reported, never dropped.
- `addCustomer(db, form)` adds a client.
- In the database:
  - staff can read, add and change clients;
  - no one can delete one;
  - every add and change is audited with the old and new values.

A client's ID is also their design job's key in the studio until jobs have their own records (BUILD_PLAN 7a).

## Public API
`contract.ts`: `checkNewCustomer`, `loadCustomers`, `addCustomer`, and the `Customer`, `Contact` and `NewCustomer` types.
