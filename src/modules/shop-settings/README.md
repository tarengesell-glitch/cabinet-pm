# shop-settings

Per-shop design rules (structured, with a plain-language description), default selections and preferences.

Status: design rules loaded as data; nothing applies them yet. See `CLAUDE.md` in this folder for the rules.

## Design rules (`data/design-rules.json`)
83 design rules carried over from closet-builder on 2026-11-07, at the owner's request. They cover layout, spacing, sizing, symmetry, alignment, fronts, clearances, kitchen and storage defaults, and countertops. Each rule has:
- the closet-builder ID (HARD-, PREF-, PRIN-…; `CB-FACT-nn` for its numbered shop facts), so it can be traced back;
- a kind: `hard`, `preference`, `principle`, `front_rule`, `documentation`, `optional` or `rejected`;
- the rule in plain language, the owner's words and date as its source, and any lengths it uses;
- its status in closet-builder, and its status here:
  - **confirmed** (12): the owner has confirmed it for this platform;
  - **candidate** (69): carried over, not yet confirmed for this shop;
  - **conflicts** (2): disagrees with a decision made here, which wins (the closet corner rule and closet room limits).

The file also lists what was deliberately **not** imported (box construction, pricing, closet configurations, unverified industry standards) and why.

The file is checked when the module loads: a rule listed twice, a missing source, a length that isn't a length, a link to a missing rule, or a confirmed or conflicting rule with no reason stops the app with the reason.

## Public API
`contract.ts`: `DESIGN_RULES`, `readDesignRules`, and the `DesignRule` types.
