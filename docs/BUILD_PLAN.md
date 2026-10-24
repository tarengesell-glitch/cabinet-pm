# Build Plan

One Claude Code session per step. Review, test and commit between steps.

| # | Step | Prompt |
|---|---|---|
| 0 | Mozaik export investigation (manual) | `prompts/00-mozaik-export-investigation.md` |
| 1 | Scaffold repo and guardrails | `prompts/01-scaffold-and-guardrails.md` |
| 2 | UX docs and design system | `prompts/02-ux-docs-and-design-system.md` |
| 3 | Foundation: core, users, permissions, jobs, rooms, audit, alerts, outbox, locks | `prompts/03-foundation.md` |
| 4 | Pricing: regions, partners, price lists, tax, settings editor | `prompts/04-pricing.md` |
| 5 | Quick quote | `prompts/05-quick-quote.md` |
| 6 | Mozaik import via manual upload (needs findings doc + samples) | `prompts/06-mozaik-import.md` |
| 7 | Intake: visual choices and questionnaire | from UX brief screen 04–05 |
| 8 | Site measure | UX brief screen 07 |
| 9 | Appliances + checks + production gate | UX brief screen 08 |
| 10 | Approvals and snapshots | UX brief screen 09 |
| 11 | Drawing guide | UX brief screen 06 |
| 12 | Connectors: Gmail notes, CRM, accounting | one per session |
| 13 | Purchasing and manufacturing handoff | UX brief screen 10 |
| 14 | Desktop uploader (Windows tray watcher, replaces manual upload) | `prompts/14-desktop-uploader.md` |

Rule of thumb: if a session wants to touch more than one module, split it.

Step 0 can run in parallel with steps 1–5, but must be finished before step 3 is reviewed, so the data model reflects what Mozaik really provides.
