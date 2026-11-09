'use client';
/**
 * The office screens (Today, Clients, a client's page) show the clients and how far each one's job
 * has got. Before they read anything, this loads the real clients from the shared database and
 * brings every client's job into step with it, so a browser that never opened a job still sees the
 * work saved from elsewhere. A job whose browser copy clashes with the saved one is left as it is
 * and named: opening it in the studio asks which to keep.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { can, supabaseClient } from '@/platform/index';
import { loadCustomers } from '@/modules/projects/contract';
import { ClientsProvider, DEMO_INFO, fromCustomer, type ClientInfo, type Clients } from '../clients';
import { BROWSER_RECORDS, openJob } from './job-sync';
import { BROWSER_WORKING_COPY } from './working-copy';
import { useSession } from './session';
import s from './sync.module.css';

export function OfficeSync({ children }: { children: ReactNode }) {
  const session = useSession();
  const [real, setReal] = useState<readonly ClientInfo[]>([]);
  const [state, setState] = useState<{ kind: 'opening' } | { kind: 'ready'; problems: string[] }>(() =>
    session.mode === 'database' ? { kind: 'opening' } : { kind: 'ready', problems: [] },
  );

  /** The real clients, or the reason they can't be read (never an empty list in its place). */
  const readReal = useCallback(async (): Promise<{ clients: ClientInfo[]; problem: string | null }> => {
    if (session.mode !== 'database' || !can(session.user, 'client.view')) return { clients: [], problem: null };
    const db = supabaseClient();
    if (!db.ok) return { clients: [], problem: db.reason };
    const r = await loadCustomers(db.value);
    return r.ok ? { clients: r.value.map(fromCustomer), problem: null } : { clients: [], problem: r.reason };
  }, [session]);

  useEffect(() => {
    if (session.mode !== 'database') return;
    let alive = true;
    void (async () => {
      const problems: string[] = [];
      const { clients, problem } = await readReal();
      if (problem) problems.push(problem);
      for (const c of [...clients, ...DEMO_INFO]) {
        const r = await openJob({ backend: session.backend, copy: BROWSER_WORKING_COPY, records: BROWSER_RECORDS }, c.id);
        if (r.kind === 'problem') problems.push(`${c.name}: ${r.reason}`);
        if (r.kind === 'clash') problems.push(`${c.name}: this browser has changes that clash with the saved job. Open the job to choose which to keep.`);
      }
      if (alive) {
        setReal(clients);
        setState({ kind: 'ready', problems });
      }
    })();
    return () => {
      alive = false;
    };
  }, [session, readReal]);

  const reload = useCallback(async () => {
    const { clients, problem } = await readReal();
    setReal(clients);
    if (problem) setState({ kind: 'ready', problems: [problem] });
  }, [readReal]);

  const clients: Clients = useMemo(() => {
    const list = [...real, ...DEMO_INFO];
    return { list, find: (id) => list.find((c) => c.id === id) ?? null, reload };
  }, [real, reload]);

  if (state.kind === 'opening') return <p className={s.centre}>Loading the clients and jobs from the shared database…</p>;
  return (
    <ClientsProvider value={clients}>
      {state.problems.length > 0 && (
        <div className={s.banner} role="alert">
          {state.problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}
      {children}
    </ClientsProvider>
  );
}
