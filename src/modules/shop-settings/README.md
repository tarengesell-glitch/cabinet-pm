# shop-settings

Per-shop design rules (structured, with a plain-language description), default selections and preferences.

Status: design rules loaded as data and reviewed by the owner; nothing applies them yet. See `CLAUDE.md` in this folder for the rules.

## Design rules (`data/design-rules.json`)
Design rules carried over from closet-builder on 2026-11-07 at the owner's request, then reviewed by the owner on 2026-11-07/08 (review page: https://claude.ai/artifact/7vv6Emc6tQgevJ3Pt2Sp8L). They cover layout, spacing, sizing, symmetry, alignment, fronts, clearances, kitchen and storage defaults, and countertops.

**How they are used (owner, 2026-11-07):** the AI designer gets the confirmed rules, the room's walls and cabinet runs, and the client's intake preferences, and drafts the best-fit design and layout. In the design tool, when a designer's own change breaks a rule, the rule's `design_tool` setting says what happens.

Each rule has:
- the closet-builder ID (HARD-, PREF-, PRIN-…; `CB-FACT-nn` for its numbered shop facts), so it can be traced back;
- a kind: `hard`, `preference`, `principle`, `front_rule`, `documentation`, `optional` or `rejected`;
- the rule in plain language, the owner's words and date as its source, and any lengths it uses;
- its status in closet-builder, and its status here, with the owner's review answer in the note:
  - **confirmed** (78): the AI designer uses it;
  - **declined** (4): the owner said no (construction details that come from the shop's library, grain across cabinets, U-shaped vanity drawers);
  - **candidate**: none left;
- for confirmed rules, `design_tool`:
  - `not_drawable` (9): the tool won't let it be drawn;
  - `error` (2): an error the designer must fix;
  - `suggestion` (36): on the running list of things that could be improved. Every confirmed preference is here;
  - `none` (27): guidance for the AI designer, or how the tool draws things;
  - left out (4): HARD-005, HARD-010, HARD-012, HARD-015, confirmed before the review asked this.

Build measurements the visual tool uses for drawing (door gaps, shelf spacing) are kept, but the shop's library is the authority: if its numbers differ, the library wins (owner, 2026-11-08).

The file also lists what was deliberately **not** imported or was removed in the review, and why.

The file is checked when the module loads. Any of these stops the app with the reason:
- a rule listed twice, a missing source, a length that isn't a length, or a link to a missing rule;
- a confirmed or declined rule with no reason;
- a design tool setting on a rule that isn't confirmed;
- a confirmed preference that isn't a suggestion.

## Public API
`contract.ts`: `DESIGN_RULES`, `readDesignRules`, `DESIGN_TOOL_ACTIONS`, and the `DesignRule` types.
