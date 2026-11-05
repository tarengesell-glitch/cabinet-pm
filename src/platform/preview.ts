/**
 * MOCKED: there are no shops in a database yet. The room preview needs a shop ID
 * for the master copy, so it uses this stand-in, labelled as such on screen (rule 14).
 */
export const PREVIEW_SHOP = {
  id: '00000000-0000-4000-8000-00000000c0de',
  name: 'Preview shop (mocked, no shops set up yet)',
  mocked: true,
} as const;
