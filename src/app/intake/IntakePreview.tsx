'use client';
import dynamic from 'next/dynamic';
import { PREVIEW_USER } from '@/platform/index';

// The intake keeps its answers in the browser, so the screen is loaded on the client only.
const IntakeScreen = dynamic(() => import('@/modules/intake/ui/index').then((m) => m.IntakeScreen), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Loading the design choices…</p>,
});

// The intake comes before the room drawing (owner, 2026-11-08): walls, openings, cabinets and appliances.
const NEXT = { href: '/rooms/preview/', label: 'Next: walls, cabinets and appliances' } as const;

export function IntakePreview() {
  // MOCKED user until sign-in exists (rule 14); the screen shows that it is mocked.
  return <IntakeScreen user={PREVIEW_USER} next={NEXT} />;
}
