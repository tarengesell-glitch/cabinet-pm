# Decisions

Add new decisions at the bottom of each list with the date.

## Decided
- In-house tool only, not sold to other cabinet companies.
- Cabinetry only, all residential room types; room types are data.
- Mozaik is the design source of truth; this tool cannot write to Mozaik.
- Modular monolith with enforced module boundaries; data, not code.
- Modules communicate through events and contracts; one owner per table.
- Fail loudly: no silent failures, alerts persist until resolved.
- Lengths in integer mm, money in integer cents (CAD).
- Permission framework from day one; only owner, admin and designer roles set up initially.
- Regions route jobs to manufacturing partners; price lists per partner; tax per province.
- Online-only for site measuring initially.
- Room is the main unit of work and of locking; job level is also lockable.
- Locks release at end of day or when the session drops; manager override.
- Approval, invoicing, site verification and production release are separate per-room states.
- Clients may approve and be invoiced before measurement; production is blocked until measured.
- Approved room versions are immutable; one imported version per room is flagged approved.
- Small within-tolerance fit differences are absorbed without client reapproval or repricing.
- Full change history and audit log from day one.
- Quick quote starts with manual entry.
- CRM and accounting are swappable connectors.
- Build starts with the quick quote, after foundation.
- 2026-10-24: Hosting is Netlify + Supabase (not Vercel).
- 2026-10-24: Mozaik data is captured from the SketchUp export files plus the saved job files, found by our own investigation.
- 2026-10-24: Mozaik import starts as manual upload; a Windows desktop uploader comes later (step 14).
- 2026-10-24: Upload matches are always confirmed by a person; Mozaik IDs preferred over names.
- 2026-10-24: This project replaces closet-builder's own design, parametrics and send-to-production engine. Mozaik does that work now. closet-builder (`tarengesell-glitch/closet-builder`) is kept for reference only; no code is carried over.

## Open questions
- Mozaik export format and contents; whether it exports a whole job or one room.
- Whether Mozaik's price data can be read directly.
- Whether to archive the Mozaik job file at approval.
- Tolerance values (mm or %), and whether per measurement, cabinet or room.
- Which adjustments qualify for internal approval, and who can approve them.
- Whether over-tolerance changes can ever be absorbed without reapproval.
- Required measurements per job type before production.
- CRM choice; QuickBooks vs Xero; texting service; call recorder.
- What clients see in the portal.
- Final tech stack confirmation (see ARCHITECTURE.md).
- Desktop uploader stack (.NET vs Electron/Tauri) and code signing.
- How to produce a web 3D model from Mozaik data (convert export vs build from parts data).

### Earlier owner decisions from closet-builder that differ from this pack (2026-10-24)
These were decided for closet-builder (`docs/architecture.md` Part 1 there, 2026-10-08 to 10-10). Each one either still applies here or has been replaced by this pack. None of them is authority here until it's confirmed.
- **Price list.** closet-builder: one company, one price list, priced per inch by cabinet type, plus % adjustments for selections and flat add-ons (A-1, A-7). This pack: a price list per manufacturing partner, chosen by region. Which is right now?
- **Shops.** closet-builder: one shop on Biesse machines, maybe more later (A-18). This pack: manufacturing partners routed by region. Is the Biesse shop one of those partners?
- **When the design freezes.** closet-builder: frozen at full payment, except changes that don't touch the design; truly frozen once cut files are sent (A-8, A-9, A-11). This pack: frozen at client approval; changes within tolerance are absorbed. Does payment still play a part in freezing?
- **Deposit and balance.** closet-builder: deposit to commit, balance before production, through a third-party payment tool (A-8). This pack: accounting triggers (QuickBooks or Xero). Is the payment tool still separate from accounting?
- **Change approval by the customer.** closet-builder: automated text and email with a tap to approve, daily reminders, and a decline notifies the designer (A-10). Is this wanted here for over-tolerance changes?
- **Batches.** closet-builder: a customer can have several batches over the years, each priced as its own project (A-4). This pack: clients → jobs → rooms. Is a job the same as a batch?
- **Prospect self-onboarding.** closet-builder: customers can sign up themselves, start the CRM and fill in their intake (A-3, A-15, A-16). This pack: the client portal comes later and its contents are open. Is self-onboarding still a goal?
