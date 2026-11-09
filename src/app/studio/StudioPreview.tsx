'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { supabaseClient } from '@/platform/index';
import { loadCustomers } from '@/modules/projects/contract';
import { DEMO_INFO, fromCustomer, type ClientInfo } from '../clients';
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
  const session = useSession();
  const [job, setJob] = useState<{ value: string | null; client: ClientInfo | null; problem: string | null } | null>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('job');
    const demo = DEMO_INFO.find((c) => c.id === value) ?? null;
    if (value === null || demo || session.mode !== 'database') return setJob({ value, client: demo, problem: null });
    // A real client's job: their name comes from the database (never from the code).
    const db = supabaseClient();
    if (!db.ok) return setJob({ value, client: null, problem: db.reason });
    void loadCustomers(db.value).then((r) =>
      setJob(r.ok ? { value, client: r.value.map(fromCustomer).find((c) => c.id === value) ?? null, problem: null } : { value, client: null, problem: r.reason }),
    );
  }, [session]);
  if (job === null) return <p style={{ padding: 16 }}>Loading the design studio…</p>;
  if (job.problem) return <p style={{ padding: 16 }} role="alert">The client for this job can’t be read: {job.problem}</p>;
  return <JobWorkspace job={job.value}>{(status) => <Studio user={user} saveStatus={status} client={job.client} />}</JobWorkspace>;
}

export function StudioPreview() {
  return (
    <StaffGate>
      <SignedInStudio />
    </StaffGate>
  );
}
