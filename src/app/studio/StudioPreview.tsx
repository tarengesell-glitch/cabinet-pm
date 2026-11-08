'use client';
import dynamic from 'next/dynamic';

// The studio keeps its work in the browser and draws on a canvas, so it loads on the client only.
const Studio = dynamic(() => import('./Studio').then((m) => m.Studio), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Loading the design studio…</p>,
});

export function StudioPreview() {
  return <Studio />;
}
