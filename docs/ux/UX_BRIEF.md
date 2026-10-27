# UX/UI Brief — Cabinetry Job Platform

Master brief for establishing the visual UX/UI specification. If anything here conflicts with `docs/BUILD_SPEC.md`, `docs/ARCHITECTURE.md` or `docs/DECISIONS.md`, they win; flag the conflict.

> **Updated 2026-10-27 for the Cabinet Vision build spec.**
> - Parts 1, 5 and 6 now describe the v1 screens.
> - The screens from the earlier Mozaik-based plan are kept under "Later screens", waiting on the owner's answers (DECISIONS E-1 to E-6). Don't build them until confirmed.
> - The colour tokens in Part 4 are not settled: closet-builder has an owner-approved design system that may apply instead (DECISIONS C-2).
> - UX work starts before Phase 5 (`docs/BUILD_PLAN.md`).

Act as senior product designer, UX architect, UI designer and frontend engineer. Define actual screens, layouts, dimensions, components, interactions and states, not generic advice.

---

## Part 1 — Product

The platform runs sales, intake and design for residential cabinetry jobs, then hands the finished design to the shop's CAD software (Cabinet Vision first) for engineering. v1 covers:
- projects and customers;
- room capture;
- selections;
- an AI first draft;
- a visual design editor;
- the ready-to-send gate;
- sending to the CAD software, reading the engineered job back and comparing it;
- the product catalog and its mappings;
- the translator test library and corrections.

The platform does not engineer cabinets. The editor must look right and be dimensionally exact; it is not a showroom renderer.

It should feel like a polished purpose-built operational system, not a generic project manager.

**Devices.** Desktop is primary (1366–1920 px; reference 1440 × 900). Designers often screen-share with clients. iPad and iPhone are for site measuring and field work, with dedicated touch layouts. Reference viewports: 1440×900, 1920×1080, 1366×768, iPad landscape 1024×768, iPhone 390×844.

**Roles.** Owner/manager, designer, site measurer, office admin now or soon; client and trade/supplier views later. Information architecture is role-based and driven by the permission framework: new roles and views are added as data, so screens must check permissions, never role names.

---

## Part 2 — UX philosophy (non-negotiable)

- **SEE → CLICK → SEE → CLICK → COMPLETE.** Prefer clickable images, swatches, diagrams and cards over dropdowns and forms. Typing only for genuinely free information (custom dimensions, names, comments).
- **No text-heavy AI interfaces.** Communicate through hierarchy, images, icons, short labels, selection states, progress and diagrams. No explanatory paragraphs where a label and image suffice. One unmistakable primary action per screen.
- **Progressive disclosure.** Show only what the current decision needs.
- **Continuous workflow.** A choice made once becomes structured data used everywhere, never re-entered.
- **Never trade safety for clicks.** Approvals, purchasing, invoicing and manufacturing release keep explicit confirmation.
- **Fail loudly.** Failures, including background ones (supplier orders, CRM sync, invoice triggers, manufacturing sends, imports), show visibly on the global alert indicator and the affected job until a person resolves them. Never show false success.

---

## Part 3 — References (borrow interactions, not branding)

| Area | Reference | Borrow |
|---|---|---|
| Client selection | Typeform picture choice; Houzz Pro selections | One decision at a time, large image tiles, branching, selection vs approval, client-visible vs internal |
| Job status | Linear; JobTread | Compact lists, saved filters, keyboard speed, detail drawers; job workflow structure |
| Measuring | magicplan; SafetyCulture | Tap-to-select floor plan walls, dimensions; guided required checks, photo evidence |
| Approvals | Filestage | Version history, compare, comments per version, approved version unmistakable |
| Configuration | Roomle | Dependent options, immediate visual feedback (photos suffice, no 3D needed) |
| Field photos | CompanyCam | Photos by job, linked to evidence |

Links: help.typeform.com picture-choice article; pro.houzz.com selections help; linear.app/docs; help.magicplan.app; safetyculture.com; help.filestage.io versions; roomle.com/configurator; jobtread.com; companycam.com.

---

## Part 4 — Design system

**Style.** Calm, precise, premium productivity tool fit for client presentations. Linear restraint plus Typeform/Houzz photographic selection. No construction-software clutter, saturated colours, decorative gradients or heavy borders.

**Colour tokens** (adjust only for accessibility):

| Token | Value | Use |
|---|---|---|
| background | #F7F8FA | app background |
| surface | #FFFFFF | panels, cards |
| surface-subtle | #F1F4F5 | hover, secondary |
| text-primary | #17212B | headings, labels |
| text-secondary | #687582 | metadata |
| border | #E2E7EB | separation |
| accent | #176B70 | primary actions, selection |
| accent-tint | #E6F2F1 | selected card |
| success | #16805D | verified |
| warning | #AD751A | needs attention |
| danger | #BE3D42 | blocked, error |
| focus | #2563EB | keyboard focus |

Status never relies on colour alone; always icon and/or text. Provide dark-mode values later; structure tokens to allow it.

**Type.** Inter or Geist. Page title 24–28, screen question 26–32, section 18–20, body 14–16, metadata 12–13, client selection labels 16–18. Semibold for emphasis.

**Geometry.** Spacing 4/8/12/16/24/32. Card radius 12, image choice card 14–16, button 8–10. Page padding 24–32. Top bar ~60, sidebar ~232, detail drawer 360–420, selection summary 280–320. Subtle shadows only.

**Icons.** Lucide. Labels on critical actions.

**Motion.** 100–180 ms, respect reduced motion, nothing decorative.

**Responsive.** Desktop baseline. Collapse secondary panels before shrinking the workspace. Presentation mode prioritises images. Tablet split views; phone full-width plan with bottom sheets. No horizontal scrolling for core tasks.

**Units.** Lengths are stored as exact integers in Core's base unit (not chosen yet; DECISIONS U-1). Display units are a user preference. Inputs convert on entry and refuse values that don't land exactly on an allowed increment.

---

## Part 5 — Information architecture

**Desktop shell.**
- **Left sidebar (~232):** Projects, Jobs, Quotes, Send & Compare, Catalog, Test Library, Alerts. Settings (shop settings, users) and profile at the bottom.
- **Top bar (~60):** breadcrumbs, job title, Cmd/Ctrl+K quick switch, global alert indicator, profile.
- **Main workspace:** takes the rest. Detail panels are contextual and collapsible.

Menu items show only when the user has permission for them.

**Navigation.** Projects → Job → Room → Editor. Deep links, browser navigation, preserved context.

---

## Part 6 — Screens

For each screen document: purpose, roles, platform, layout, interactions, components, data, states (loading, empty, partial, missing images, permission denied, save failure, network loss, conflict, unsaved changes, locked by another user, completed), responsive behaviour, acceptance criteria.

### v1 screens (from BUILD_SPEC; detailed in the Phase 5 UX session)

**V1 Projects list (Linear + JobTread).**
- Compact list: customer, job, status (spec section 6), owner, next action, blocker count, failed-automation indicator.
- The default sort puts blocked and urgent jobs first.
- No big metric cards or charts.

**V2 Job overview.**
- Rooms with thumbnails.
- The current master copy version and its history, with AI and designer edits told apart.
- Gate state and the latest send or comparison.
- Who holds the lock.

**V3 Room capture (magicplan).**
- Tap-to-select plan for walls, angles, ceiling height, openings, obstacles and utilities.
- Numeric entry converts to the base unit.
- Missing values are shown as missing, never assumed.

**V4 Visual editor (the core screen).**
- Plan, elevation and 3D views, all drawn only from the master copy.
- The item palette shows only catalog items available to this shop. Items marked "manual work required" are flagged.
- Sizes snap to allowed ranges and increments while dragging or typing.
- A live issues panel; clicking an issue selects the item.
- AI-placed items are visibly marked until a designer edits or approves them. The AI's explanation of its key decisions is one click away.

**V5 Selections (Typeform + Houzz picture choice; reuses the photo tiles from old screen 04).**
- Job-level defaults, room overrides and item overrides.
- Every item shows its resolved value and where it came from.
- Required selections that are missing are shown as blockers.

**V6 Ready-to-send gate.**
- One row per layer: layout, buildability, design rules, translation preflight, approval.
- Every issue names the item and the reason in plain language, and links to it in the editor.
- The designer's Approve action has explicit confirmation.
- Send stays disabled while any blocker exists, and inspecting it lists exactly what is outstanding. No bypass.

**V7 Send & compare (Filestage).**
- For each job: the versions sent (file, time, who), the read-back, and the comparison.
- Each discrepancy shows the sent value and the returned value side by side (missing, extra, dimension, position, selection).
- Release is done by shop staff after a clean comparison and a human review, with explicit confirmation.
- A failed send or read-back stays visible until it is resolved.

**V8 Catalog & mappings.**
- Our items with their ranges, options and versions.
- Each item's mapping status: current, stale or unverified.
- The latest catalog sync's diff, with the stale mappings it caused.
- AI-drafted mappings are shown as unverified until a person confirms them.

**V9 Test library & corrections.**
- Golden cases, run results by code version and CAD version, and failing cases first.
- A correction form saves the job, what was sent, what came back and the correct result as a new case.

**V10 Quotes.** Old screen 03, adapted. Priced from the catalog and a named master copy version. An issued quote is frozen. A missing price is an error, never zero.

### Later screens (from the earlier plan, status waiting on the owner)

The screens below come from the earlier Mozaik-based plan.
- **Not settled:** 01, 02, 04, 05, 07, 08, 09, 10, 11 and 12 depend on DECISIONS E-1 to E-6. Parts of them (photo tiles, measuring interactions, the discrepancy cards, version history, locking) are reused in the v1 screens above.
- **Dropped:** 06 Guided Mozaik Drawing (2026-10-27).

### 01 Job Command Centre (critical; Linear + JobTread)
Heading, search, New Job, saved filters. Four compact counts: Needs Attention, Waiting on Client, In Progress, Ready for Production. Job list (optional board): job, client, room status summary, owner, next required action, blocker count, due date, failed-automation indicator. Default sort surfaces blocked and urgent work. Click job → overview; blocker count → issues; next action → that workflow. No big metric cards or charts.

### 02 Job Overview (critical)
Header: job, owner, next action. **No single linear stepper.** Instead each room card shows four independent status indicators: Approval, Invoicing, Site Verification, Production, plus design progress (selections → drawing → imported). Example: Kitchen — Approved ✓, Invoiced ✓, Measure: 2 walls unverified, Production: blocked. Main area (~70%): room cards with thumbnail, the four indicators, issue count, lock indicator. Right panel (~30%): next actions, pending approvals, alerts, recent activity, team. Tabs: Overview, Rooms, Documents, Communications, Purchasing, History. Job-level settings show who holds the job lock.

### 03 Rapid Quote Builder (high)
Left 22–25%: rooms, sketch upload, categories. Centre 45–50%: visual component buttons (base, wall, tall, island, vanity, wardrobe, accessories); selecting one reveals only its approximate dimensions and options. Right 25–30% sticky summary: subtotal, allowances, assumptions, tax (from job region), total, price list version, status. Presets, duplication, quantity steppers, estimated values visibly marked. Save Draft, Review, Prepare Client Quote. Issued quotes freeze prices and tax. Never presented as a production design. Missing price shows as an error, never zero.

### 04 Guided Client Design Session (highest; Typeform + Houzz + Roomle)
Header ~60: job, room, "Step 3 of 12", exit. Workspace 70–75%: one short question, large photos (2 → two large; 3 → three; 4 → 2×2 or 4; 5–6 → compact grid; 4:3 default), whole question visible at 1440×900 without scrolling. Right summary 25–30%: previous decisions as thumbnails, click to revisit. Bottom: Back, Not Sure, Next where needed. Click selects instantly; simple single choices auto-advance after brief confirmation with easy undo; number keys pick options. Branching from data (floating vanity → mounting questions; handleless → skip handles). Questions, options, images, conditions and Mozaik mappings are all data per room type. Selection states (distinct): selected, tentative, not sure, skipped, needs follow-up, confirmed, not applicable.
**Presentation mode:** large photos, no prices, internal notes or admin controls, and internal data genuinely excluded from what's rendered and fetched. **Designer mode:** adds technical requirements, price implications, dependencies, notes, exceptions.
Demo sequence: room, style, door profile, finish, configuration, countertop, handles/handleless, fittings and appliances, standard questions, room review.

### 05 Room Selections Summary (high; Houzz)
Visual tiles per category with status badges, outstanding decisions list, click to revise or jump to question. Review Room, Prepare for Approval. A selection is never treated as an approval.

### 06 Guided Mozaik Drawing Assistant (high)
Left 25% checklist (room setup, cabinets, door profiles, materials, hardware, appliances, final checks). Centre 50% current instruction with the exact Mozaik selection to make and an example visual. Right 25% source: client selections, dimensions, notes, measurements, conflicts, with links to the source records. Designer ticks each step. Clearly separates instructions, user confirmations and verified imported data. Never implies the tool changed Mozaik.

### 07 Site Measuring (highest; magicplan + SafetyCulture)
**Online-only for now:** show connection status; if the connection drops, block entry with a clear message rather than queueing offline (offline sync is a later feature).
iPad landscape: header (job, room, completion, connection). Left 60–65% interactive 2D plan (walls, doors, windows, features). Right 35–40% panel for the selected item.
Wall states: unmeasured (red, empty icon); entered not verified (amber, pencil); verified (green, check); discrepancy or recheck (red outline, warning). Entering a value never verifies it.
Flow: tap wall → highlight → numeric entry → prompted checks from the room type's measurement prompts → explicit verify → green → next incomplete item highlighted. Quick access: wall lengths, ceiling, doors, windows, plumbing, electrical, obstructions, extra, photos and notes. Fields come from data per room type. Each value stores provenance.
iPhone portrait: compact header, large plan, bottom sheet that expands progressively.
Final review lists missing, unverified and conflicting items. Manual entry only; never imply automated measurement.

### 08 Checks and Discrepancies (critical; Linear + Filestage)
Summary: blockers, warnings, within-tolerance adjustments, resolved, readiness. Discrepancy cards: title, room, severity, the two conflicting values with sources, assignee, state. Example (demo data): Island clearance — Measured 940 mm, Required 1050 mm.
Evidence panel shows sources side by side. Actions: assign, comment, request remeasure, request drawing change, mark corrected (only after re-validation).
**Tolerance:** after approval, a measurement correction within the tolerance rules and with no client-facing change shows as "Within tolerance — internal approval", approved by a permitted user, with no client reapproval or repricing. Outside tolerance, it's a blocker needing review or a revised agreement. Tolerance never overrides clearance or manufacturing rules.
Production gate: release disabled while blockers exist; inspecting it lists exactly what's outstanding. No bypass. Severity comes from rules (data). Full audit trail.

### 09 Room Approvals and Versions (critical; Filestage + Houzz)
Room list: name, current version, approval state, invoicing state, last modified, client action needed. Workspace: large preview; side panel with version, comments, history, documents, approval action.
Version states: draft, in review, changes requested, approved, superseded, plus production revision (linked to the approved version). The approved version is unmistakable; exactly one per room.
Approval can happen before measurement is verified. Approval records approver, time and exact version; a single approval may cover several rooms. Post-approval changes go through the tolerance rules (Screen 08): within tolerance → internal production revision; otherwise → new review and approval. Never silently replace an approved version; viewing or selecting is never approval.

### 10 Purchasing and Production Handoff (medium; JobTread)
Tabs: To Order, Ordered, Awaiting Delivery, Received, Failed, Production Handoff. Rows: supplier, item, job, qty, required date, status. Detail drawer. Failed sends stay in Failed with the error until resolved. Never show "sent" unless it really was; simulations are labelled.

### 11 Collaboration and Locking (medium)
Room and job locks. "Sarah is editing this room" with read-only for others. Request-to-edit notifies the holder. Locks release on end of day or dropped session (heartbeat); managers can force-release with a reason (audited). Save state always truthful. If a job-wide setting changes while someone holds a room lock, they get a notification describing the change; nothing changes silently under them.

### 12 Activity, Communications and Automation (medium)
Compact grouped timeline with icons: selections, verifications, discrepancies, imports, approvals, orders, invoices, CRM triggers. Distinguish completed, pending automated, failed, needs review. Notes from email, texts and transcripts link to source and show "AI-extracted, unconfirmed" until a person confirms them.

---

## Part 7 — Images and demo content (mandatory)

Image-based screens must use meaningful images during development. Preference: approved project assets → licensed local photos → generated images → purpose-built SVG illustrations. Stored locally, provenance documented, nothing copied from reference apps. Images referenced through an asset manifest (data), never hardcoded paths in components.

Starter asset categories: vanities (floating, floor-standing, open shelf); door profiles (shaker, flat panel, raised panel, handleless, slim shaker); finishes (light oak, natural oak, walnut, matte white, charcoal); countertops (white quartz, marble-look, concrete-look, dark stone); handles (bar, knob, edge pull, recessed); rooms (kitchen, ensuite, laundry, wardrobe). Options in a group must look clearly different.

Demo jobs (marked as demo, consistent across all screens). *These were written for the earlier plan. Rewrite them for the v1 screens in the Phase 5 UX session, for example a job with an AI draft, one blocked at the gate by a stale mapping, and one with a comparison discrepancy.*
- **Wilson Residence** — kitchen, ensuite; kitchen approved and invoiced but 2 walls unverified and 3 open discrepancies; mixed confirmed/unresolved selections.
- **Martin Renovation** — kitchen, laundry; waiting on client approval; multiple versions; kitchen locked by another designer.
- **Oak Street Project** — kitchen, wardrobe; measured and verified; one within-tolerance correction approved internally; production ready.
- One failed supplier order on Wilson to demonstrate loud failure.

---

## Part 8 — Components

Selection: ImageChoiceCard, ImageChoiceGrid, MaterialSwatch, VisualQuestion, SelectionProgress, SelectionSummary, OptionDetailPopover.
Job: JobStatusRow, JobStatusCard, RoomStateIndicators (the four independent states), RoomCard, NextActionPanel, StatusIndicator, ActivityTimeline.
Measuring: InteractiveRoomPlan, SelectableWall, MeasurementInput, MeasurementStatus, VerificationChecklist, MeasurementPhoto, RoomCompletionIndicator, ConnectionStatus.
Quality: DiscrepancyCard, EvidenceComparison, ToleranceBadge, ProductionReadiness, ResolutionPanel.
Approval: ApprovalCard, VersionBadge, VersionHistory, VersionComparison, RoomApprovalPanel.
Utility: ContextualDrawer, StickyActionBar, EmptyState, ErrorState, AlertBanner, GlobalAlertIndicator, AutosaveIndicator, UserEditingIndicator, ReadOnlyBanner.

Each documented with data/props, behaviour, variants, states. Shared components live in `src/core/design-system/`; modules use them and don't create look-alikes.

---

## Part 9 — Interaction rules

- Direct selection for reversible choices; explicit confirmation for irreversible, external or legally meaningful actions.
- Immediate, truthful feedback for every action.
- Keyboard: number keys for options, arrows, Escape, Cmd/Ctrl+K, visible focus; never hijack text entry.
- WCAG 2.2 AA where practical: contrast, focus, labels, touch targets, accessible errors, non-colour status.
- Every major screen specifies the error and exception states listed in Part 6.

---

## Part 10 — Data consistency

Follow `docs/DATA_MODEL.md`. Selections store option ids (not labels) with status, user, timestamp, dependencies and history. Approvals are separate records tied to exact immutable versions. Job status follows BUILD_SPEC section 6. Whether the earlier four per-room states survive is open (DECISIONS E-1). UI never invents its own data shapes; it reads module contracts.

---

## Part 11 — Clickable prototypes

*Written for the earlier plan. In the Phase 5 UX session, replace A–C with prototypes of the v1 screens: the editor (V4), the gate (V6) and send & compare (V7).*

Build in an isolated demo area (`src/app/demo/` plus demo seed data), using shared design-system components and module contracts where they exist. Mocked integrations are labelled.

- **A. Guided client selection** — choose room, 3–5 visual choices, branching, back, change earlier choice, summary, presentation vs designer mode, completed room summary.
- **B. Interactive measuring** — unmeasured walls, select, enter, amber entered state, explicit verify, green, missing item, discrepancy, progress; state persists when navigating away and back.
- **C. Job command centre** — jobs, filters, blocker counts, four room states, open job, open room, open discrepancy, resolve it and see production readiness change; failed order alert visible.

Every enabled control must work. Demo persistence is labelled.

---

## Part 12 — Performance

Instant local selection feedback, preload the next question's images, lazy-load the rest, optimised local images, autosave without interruption, recovery from interrupted sessions.

---

## Part 13 — Acceptance checks

1. Most urgent blocked job findable without reading.
2. Five consecutive client choices made mainly by clicks.
3. Earlier selection changed without restarting.
4. Conditional questions only when relevant.
5. Presentation mode leaks no internal data (check rendered output and network responses).
6. Wall selected, entered and explicitly verified.
7. Entered-unverified clearly differs from verified.
8. Measurement/design mismatch creates a visible issue.
9. Critical issue blocks production release.
10. Approval tied to a specific room version, visible in history.
11. Room locked by another user is read-only with holder shown.
12. A room can show Approved + Invoiced while Site Verification is incomplete.
13. A within-tolerance correction is approved internally without client reapproval; an over-tolerance one becomes a blocker.
14. A failed background action is visible until resolved.
15. Prototypes correct at all target viewports.
16. Keyboard navigation, focus states, non-colour status.
17. Images load and are relevant.
18. No screen is mostly filler text, giant cards or empty placeholders.

Report what was actually tested.

---

## Part 14 — Files to create

In `docs/ux/`: UX_UI_MASTER_SPEC.md, UX_SCREEN_SPECS.md (with ASCII layout diagrams), UX_COMPONENT_LIBRARY.md, UX_REFERENCE_GUIDE.md, UX_PROTOTYPE_PLAN.md, UX_DESIGN_TOKENS.md. Tokens implemented once in `src/core/design-system/`. Add to CLAUDE.md (linking, not pasting): "All frontend work follows docs/ux/. Prefer visual direct manipulation over text-heavy forms, use meaningful representative images during development, and validate key screens with interactive previews."

---

## Part 15 — Working sequence (split across sessions)

- Session A: audit repo, write the UX docs (Part 14), design tokens and utility components.
- Session B: Prototype A.
- Session C: Prototype B.
- Session D: Prototype C.
Each session: stay within its folders, review at target viewports, fix obvious issues, and hand off with files changed, decisions, what's implemented vs planned, how to test, mocked parts, and next steps.

---

## Final instruction

Don't let the app become generic dashboards, forms, dropdowns and paragraphs because they're easy to generate. Desktop should feel like a beautifully designed productivity tool; client selection like a premium visual configurator; measuring like touching the room, not filling a spreadsheet; the job overview should show instantly what needs attention. When choosing between a form and direct visual manipulation, prefer the visual unless the form is genuinely more efficient, accessible or accurate.
