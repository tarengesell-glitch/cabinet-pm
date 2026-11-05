'use client';
import dynamic from 'next/dynamic';
import { PREVIEW_USER } from '@/platform/index';

// The plan canvas needs the browser, so the screen is loaded on the client only.
const RoomCapture = dynamic(() => import('@/modules/designer/ui/index').then((m) => m.RoomCapture), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Loading the room drawing…</p>,
});

export function RoomPreview() {
  // MOCKED user until sign-in exists (rule 14); the screen shows that it is mocked.
  return <RoomCapture user={PREVIEW_USER} />;
}
