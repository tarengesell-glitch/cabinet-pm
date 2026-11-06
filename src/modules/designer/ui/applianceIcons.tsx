/**
 * Line icons for the appliance tray (owner approved them in the layout mockup, 2026-11-06).
 * Keyed by the appliance IDs in data/layout-rules.json. Display only: an appliance with no icon
 * here simply shows its name.
 */
import type { ReactNode } from 'react';

const ICONS: Readonly<Record<string, ReactNode>> = {
  fridge: (
    <>
      <rect x="9" y="3" width="16" height="22" rx="1.5" />
      <line x1="17" y1="3" x2="17" y2="25" />
    </>
  ),
  range: (
    <>
      <path d="M12 1h10v3l4 4H8l4-4z" />
      <rect x="5" y="10" width="24" height="16" rx="1.5" />
      <circle cx="11" cy="15" r="2.4" />
      <circle cx="23" cy="15" r="2.4" />
      <circle cx="11" cy="21" r="2.4" />
      <circle cx="23" cy="21" r="2.4" />
    </>
  ),
  cooktop: (
    <>
      <path d="M12 1h10v3l4 4H8l4-4z" />
      <rect x="5" y="12" width="24" height="12" rx="1.5" />
      <circle cx="11" cy="16" r="2" />
      <circle cx="23" cy="16" r="2" />
      <circle cx="11" cy="21" r="2" />
      <circle cx="23" cy="21" r="2" />
    </>
  ),
  wall_oven: (
    <>
      <rect x="6" y="3" width="22" height="22" rx="1.5" />
      <rect x="9" y="9" width="16" height="12" rx="1" />
      <line x1="10" y1="6" x2="24" y2="6" />
    </>
  ),
  sink: (
    <>
      <rect x="4" y="6" width="26" height="16" rx="1.5" />
      <rect x="7" y="9" width="20" height="10" rx="2" />
      <circle cx="17" cy="14" r="1.2" />
    </>
  ),
  bar_sink: (
    <>
      <rect x="8" y="7" width="18" height="14" rx="1.5" />
      <rect x="11" y="10" width="12" height="8" rx="2" />
      <circle cx="17" cy="14" r="1" />
    </>
  ),
  dishwasher: (
    <>
      <rect x="7" y="4" width="20" height="20" rx="1.5" />
      <line x1="7" y1="9" x2="27" y2="9" />
      <line x1="12" y1="6.5" x2="22" y2="6.5" />
    </>
  ),
  microwave: (
    <>
      <rect x="4" y="7" width="26" height="15" rx="1.5" />
      <rect x="7" y="10" width="15" height="9" rx="1" />
      <line x1="25" y1="10" x2="25" y2="19" />
    </>
  ),
  wine_fridge: (
    <>
      <rect x="9" y="3" width="16" height="22" rx="1.5" />
      <line x1="12" y1="9" x2="22" y2="9" />
      <line x1="12" y1="14" x2="22" y2="14" />
      <line x1="12" y1="19" x2="22" y2="19" />
    </>
  ),
};

/** The icon for an appliance type, or null when there is none. */
export function ApplianceIcon({ id }: { id: string }) {
  const icon = ICONS[id];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 34 28" width={34} height={28} fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true" data-icon={id}>
      {icon}
    </svg>
  );
}

/** Opening tiles: door, window, passthrough. */
const OPENING_ICONS: Readonly<Record<string, ReactNode>> = {
  door: (
    <>
      <line x1="4" y1="24" x2="30" y2="24" />
      <line x1="8" y1="24" x2="8" y2="5" />
      <path d="M8 5a19 19 0 0 1 19 19" strokeDasharray="2 2" />
    </>
  ),
  window: (
    <>
      <rect x="3" y="10" width="28" height="8" />
      <line x1="3" y1="14" x2="31" y2="14" />
    </>
  ),
  passthrough: (
    <>
      <line x1="3" y1="10" x2="10" y2="10" />
      <line x1="24" y1="10" x2="31" y2="10" />
      <line x1="3" y1="18" x2="10" y2="18" />
      <line x1="24" y1="18" x2="31" y2="18" />
      <line x1="10" y1="10" x2="10" y2="18" strokeDasharray="2 2" />
      <line x1="24" y1="10" x2="24" y2="18" strokeDasharray="2 2" />
    </>
  ),
};

export function OpeningIcon({ kind }: { kind: string }) {
  const icon = OPENING_ICONS[kind];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 34 28" width={34} height={28} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      {icon}
    </svg>
  );
}
