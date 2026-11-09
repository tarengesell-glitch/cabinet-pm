/**
 * MOCKED: there are no shops in a database yet. The preview needs a shop ID for the master copy,
 * so it uses this stand-in, labelled as such on screen (rule 14). Since 2026-11-08 it carries the
 * ID the catalog gives "The colony shop" (the one manufacturing partner today, OA-1), so the
 * catalog's checks can run on the preview's cabinets. It replaced an earlier stand-in ID, which
 * saved rooms are moved off when they load.
 */
export const PREVIEW_SHOP = {
  id: '526e7ec9-47a3-5c86-9fd3-4db7010be90a',
  name: 'The colony shop (mocked: no shops set up yet)',
  mocked: true,
  retiredId: '00000000-0000-4000-8000-00000000c0de',
} as const;
