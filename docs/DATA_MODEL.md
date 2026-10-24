# Data Model (conceptual)

Conventions: UUID ids; lengths as integer millimetres; money as integer cents CAD; every table has created_at, created_by, updated_at; every change goes to `audit_log`; soft-delete only.

## Core
- **users**, **roles**, **permissions**, **role_permissions** — permissions are strings like `quote.edit`, `room.approve`. New roles are rows.
- **scoped_access_links** (later) — job id, allowed views, expiry, revoked flag (for QR trade links and client portal).
- **audit_log** — actor, entity, entity_id, action, before, after, at.
- **alerts** — severity, source module, job/room, message, status, resolution note.
- **outbox** — event name, version, payload, status, attempts, last_error.
- **locks** — unit type (job/room), unit id, holder, acquired_at, last_heartbeat.

## Config data (editable in settings)
room_types, job_stage_definitions, measurement_prompts (per room type), drawing_step_templates, tolerance_rules, crm_triggers, suppliers, units display preference.

## Jobs
- **clients**, **jobs** (client, region, owner, status summary)
- **rooms** (job, room type, name)
- **room_states** — one row per room: approval_state, invoicing_state, verification_state, production_state, plus approved_version_id. Four independent fields, never one combined status.

## Pricing
regions, manufacturing_partners, routing_rules (region → partner), price_lists (partner, version, effective dates), price_items, tax_rules (province, rates, effective dates).

## Quotes
quotes (job, region, partner, price_list_version, tax_rule_version, status), quote_lines (room, item, approx dimensions, qty, unit price snapshot, estimated flag).

## Intake
- **questions** (room type, order, condition rules, option list) and **options** (label, image asset, mozaik_mapping nullable).
- **selections** — job, room, question, option, status (selected, tentative, not_sure, skipped, needs_follow_up, confirmed, not_applicable), user, timestamp. Option id is the source of truth, not the label.

## Mozaik import
- **mozaik_imports** — raw file reference, imported_by, at, parse result.
- **room_versions** — room, import, version number, parsed data (cabinets, parts, openings, dimensions), pricing CSV reference, content hash (to detect unchanged rooms), is_approved flag (at most one per room).

## Site measure
measurements (room, target e.g. wall A / window 2 / ceiling, value_mm, provenance: assumed | customer_supplied | designer_entered | verified | needs_reverification, verified_by, verified_at), measurement_photos.

## Appliances
appliances (model, brand, dims, clearance and install requirements as structured data), job_appliances (room, appliance, copied spec snapshot).

## Job notes
message_sources (channel, external id, link), job_notes (job, room, text, source, extraction: manual | ai, confirmed flag, accounted_for flag).

## Checks
discrepancies (room, type, severity: blocker | warning, value A, value B, sources, assigned, status, resolution), site_corrections (approved version, new version, variance, within_tolerance, authorised_by).

## Approvals
approvals (rooms + exact version ids, approver, method, at), approval_snapshots (frozen copy of everything listed in PRODUCT_SPEC approval section).

## Purchasing and handoff
purchase_items, supplier_orders (status: draft | sent | failed | confirmed | received, external ref), manufacturing_sends (room version, partner, status, external ref).
