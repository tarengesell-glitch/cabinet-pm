'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { JobWorkspace } from '../sync/JobWorkspace';
import { StaffGate, useSession } from '../sync/session';

// The studio draws on a canvas and keeps a working copy in the browser, so it loads on the client only.
const Studio = dynamic(() => import('./Studio').then((m) => m.Studio), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Loading the design studio…</p>,
});

function SignedInStudio() {
  const { user } = useSession();
  // The page address is known only in the browser, not when the site is built.
  const [job, setJob] = useState<{ value: string | null } | null>(null);
  useEffect(() => setJob({ value: new URLSearchParams(window.location.search).get('job') }), []);
  if (job === null) return <p style={{ padding: 16 }}>Loading the design studio…</p>;
  return <JobWorkspace job={job.value}>{(status) => <Studio user={user} saveStatus={status} />}</JobWorkspace>;
}

export function StudioPreview() {
  return (
    <StaffGate>
      <SignedInStudio />
    </StaffGate>
  );
}
