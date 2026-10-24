# Product Spec

## Purpose

An in-house tool for a residential cabinetry business (not for sale to other companies). Mozaik stays the source of truth for design, layout, parametrics, construction rules and manufacturing output. This tool wraps around Mozaik to handle everything before and after drawing.

Goals: cut quoting and design time, stop mistakes reaching production, and reduce manual coordination.

Scope: cabinetry only. Kitchens, bathrooms, laundries, closets, garages, entertainment centres, bars and other residential cabinetry rooms. Not full renovations with other trades. Room types are data, so new ones can be added without code.

Builder: one person, vibe coding.

## Users

Now: owner, admin, designer. Later (added as data, no rewrite): developer, site measurer, installer, office staff, client portal, other trades via revocable job links (e.g. a QR code posted on site showing measurements without an account).

## Features

1. **Quick quote.** A 15-minute quote from a customer's drawing without drawing in Mozaik. Manual entry of rough sizes and options first (AI drawing reading can fill the same fields later). Uses the region's tax and the manufacturing partner's price list, priced to roughly match the eventual Mozaik price. Quotes freeze the prices and tax rates used.
2. **Visual client intake.** Pre-made photorealistic images, one choice at a time (style, floor vs floating, light vs dark, handle position, colour), narrowing until the room is about 90% decided before Mozaik. Broad choices are guidance; specific choices (handles, door styles, colours) map to exact Mozaik selections.
3. **Standard selections questionnaire.** Step-by-step standard questions (corner upper type, Lazy Susan vs double shelf, upper height, etc.).
4. **Guided Mozaik drawing.** Ordered drawing steps (walls, windows and doors, plumbing, electrical, appliances, corners, door handing, etc.) telling the designer exactly which Mozaik selections to make, then prompts for what autofill misses (inserts, trash pullouts). The tool cannot write to Mozaik.
5. **Mozaik import.** Imports job details from Mozaik exports. Every import is kept as a version per room. Only rooms that actually changed get a new version.
6. **Drawn-vs-chosen check.** Verifies the imported design matches the client's selections.
7. **Site measure.** Phone or tablet, online-only at first. Walls start unmeasured and turn verified only after explicit confirmation, with prompts per room type so nothing is missed. Blocks production until required measurements are verified. Flags differences from the Mozaik design.
8. **Appliance and fixture library.** Searchable, picked into the job spec. Installation and clearance requirements are checked against Mozaik openings.
9. **Communication listener and job notes.** Reads email (Gmail first), texts and call transcripts (services to be chosen), keeps a running list of job notes and requirements, and checks each is accounted for. AI-extracted notes are marked unconfirmed until a person confirms them.
10. **Purchased parts and supplier ordering.** Flags bought-in items (handles, bins, doors, drawer fronts) and sends orders with instructions to suppliers.
11. **Room approvals.** Clients approve room by room. One imported version is marked as the approved design and frozen.
12. **CRM sync.** Stage changes go to a CRM (not chosen yet) for automatic reminders (e.g. outstanding appliance specs) and follow-ups.
13. **Accounting triggers.** Events like room approved trigger invoices or deposits in QuickBooks or Xero (not chosen yet).
14. **Manufacturing handoff.** When a room passes every gate, it is sent to the right manufacturing partner based on region routing.
15. **Multi-user locking.** One editor per room at a time; others read-only.

## Approval, locking and production release

- Each room tracks four independent states: client approval, invoicing, site verification, production release. They are not one linear status; a room can be approved and invoiced before it is measured.
- Approval is per room. One approval event can cover several rooms but records the exact version of each.
- The approval snapshot freezes: the approved Mozaik import version and its pricing CSV (plus a reference to the Mozaik job file), intake selections and answers, copied appliance specs, quote price, tax rates and price list version, measurements and their status, and the approval record (who, when, what).
- Exactly one imported version per room is flagged as approved. Later versions become the production revision only by referencing it.
- Measurement provenance: assumed, customer-supplied, designer-entered, verified, needs re-verification.
- Corrections after approval: the designer fixes Mozaik and re-imports. The tool records a site correction (dimension, variance, changes, who authorised) and a production revision linked to the approved snapshot.
- Tolerance: within tolerance and with no meaningful client-facing change, it is approved internally with no client reapproval or repricing. Outside tolerance, it is flagged for review or a revised agreement. Tolerance never overrides clearances or manufacturing constraints. Tolerance rules are data.

## Regions

Regions route jobs to manufacturing partners (e.g. Manitoba and Saskatchewan to partner A, Alberta to partner B). Price lists are tied to the partner and tax rules to the province.
