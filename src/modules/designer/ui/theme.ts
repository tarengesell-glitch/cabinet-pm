/**
 * Colours for the plan, from the shared design tokens (src/platform/design-system/tokens.css,
 * DECISIONS C-2). The plan is drawn on a canvas, which can't read CSS variables, so they are
 * repeated here. Navy acts or shows "you are here"; gold marks what is selected.
 * The wall colours (unmeasured / confirmed) are the owner's own and stay in PlanCanvas.
 */
export const NAVY = '#1a3045';
export const GOLD = '#d4b57f';
export const INK = '#18181b';
export const MUTED = '#71717a';
export const RULE = '#e4e4e7';
export const ERROR = '#b91c1c';
/** The navy, see-through, for a box being dragged out. */
export const NAVY_WASH = 'rgba(26, 48, 69, 0.08)';
export const NAVY_FILL = 'rgba(26, 48, 69, 0.12)';
export const NAVY_FILL_LIGHT = 'rgba(26, 48, 69, 0.10)';
