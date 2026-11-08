# Design system

The look of every screen (DECISIONS C-2, owner 2026-11-08: closet-builder's design system applies). The rules and the table of values are in `docs/ux/UX_BRIEF.md` Part 4; the owner-approved source is closet-builder `docs/design-system/`.

| File | What it holds | Who uses it |
|---|---|---|
| `tokens.css` | The `--ds-*` CSS variables and the page-wide base (background, ink, Geist, navy focus ring, reduced motion) | Loaded once by `src/app/layout.tsx`. Screens' CSS modules read the variables |
| `tokens.ts` | The same colours and fonts as data | Drawings that can't read CSS (the Konva plan canvas) |

- **Gold means selected; navy means act or "you are here".** Never gold for decoration or a hover alone.
- **Never hard-code a colour a token covers.** The exceptions are the room plan's wall states (pastel red unmeasured, black confirmed: owner, 2026-11-05) and drawing colours with their own meaning (cabinet run fills).
- **Change a value in three places together:** UX_BRIEF Part 4, `tokens.css`, `tokens.ts`. `tools/__tests__/design-tokens.test.ts` fails if they disagree.
- Fonts come from npm (`@fontsource-variable/geist`, `geist-mono`, `newsreader`), imported in `src/app/layout.tsx`. No font host at runtime.
- No React and no imports here: core stays pure.
