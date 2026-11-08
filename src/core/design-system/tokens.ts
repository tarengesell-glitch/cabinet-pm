// The design tokens, as data (DECISIONS C-2, owner 2026-11-08: closet-builder's design system applies).
// Source: closet-builder docs/design-system/tokens.md (owner-approved 2026-10-07/08). The table in
// docs/ux/UX_BRIEF.md Part 4 and tokens.css say the same; tools/__tests__/design-tokens.test.ts fails if they drift.
// Screens use the CSS variables (`var(--ds-navy)`). This file is for drawings that can't read CSS (the plan canvas).

/** Colour tokens. `source` is "owner" (approved in closet-builder) or "assumed" (accepted with its mockup, not confirmed). */
export const COLOR_TOKENS = {
  navy: { value: '#1a3045', source: 'owner', use: 'Actions and "you are here": primary buttons, the open step, a pressed switch' },
  'navy-hover': { value: '#24405a', source: 'assumed', use: 'Primary button hover' },
  gold: { value: '#d4b57f', source: 'owner', use: 'Only selected and active states: selected card glow and border, the check tick' },
  'gold-soft': { value: '#e7d6b4', source: 'owner', use: 'Card hover inner edge, finished steps, soft pills' },
  ink: { value: '#18181b', source: 'owner', use: 'Text and headings' },
  muted: { value: '#71717a', source: 'owner', use: 'Secondary text, hints, labels' },
  rule: { value: '#e4e4e7', source: 'owner', use: 'Borders and dividers' },
  paper: { value: '#ffffff', source: 'owner', use: 'Panels, cards, the top bar' },
  surface: { value: '#fafafa', source: 'owner', use: 'The page behind cards; soft fills' },
  error: { value: '#b91c1c', source: 'assumed', use: 'A refusal, and its field border' },
  // Meaning colours: kept from the earlier brief, never decorative (closet-builder keeps meaning colours too).
  success: { value: '#16805d', source: 'assumed', use: 'Verified, passed' },
  warning: { value: '#ad751a', source: 'assumed', use: 'To check, assumed, sample' },
} as const;

export type ColorToken = keyof typeof COLOR_TOKENS;

/** Flat hex values, for canvases. */
export const COLORS: { readonly [K in ColorToken]: string } = Object.fromEntries(
  Object.entries(COLOR_TOKENS).map(([k, v]) => [k, v.value]),
) as { readonly [K in ColorToken]: string };

export const FONT_TOKENS = {
  display: '"Newsreader Variable", "Iowan Old Style", Georgia, serif',
  body: '"Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"Geist Mono Variable", ui-monospace, "SF Mono", Menlo, monospace',
} as const;
