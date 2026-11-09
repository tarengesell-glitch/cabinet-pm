'use client';
/**
 * The office screens (Today, Clients, a client's page) show how far each demo client's job has
 * got. Before they read it, each job is brought into step with the shared database, so a browser
 * that never opened a job still sees the work saved from elsewhere. A job whose browser copy clashes
 * with the saved one is left as it is and named: opening it in the studio asks which to keep.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { DEMO_CLIENTS } from '../demo-data';
import { BROWSER_RECORDS, openJob } from './job-sync';
import { BROWSER_WORKING_COPY } from './working-copy';
import { useSession } from './session';
import s from './sync.module.css';

export function OfficeSync({ children }: { children: ReactNode }) {
  const session = useSession();
  const [state, setState] = useState<{ kind: 'opening' } | { kind: 'ready'; problems: string[] }>(() =>
    session.mode === 'database' ? { kind: 'opening' } : { kind: 'ready', problems: [] },
  );

  useEffect(() => {
    if (session.mode !== 'database') return;
    let alive = true;
    void (async () => {
      const problems: string[] = [];
      for (const c of DEMO_CLIENTS) {
        const r = await openJob({ backend: session.backend, copy: BROWSER_WORKING_COPY, records: BROWSER_RECORDS }, c.id);
        if (r.kind === 'problem') problems.push(`${c.name}: ${r.reason}`);
        if (r.kind === 'clash') problems.push(`${c.name}: this browser has changes that clash with the saved job. Open the job to choose which to keep.`);
      }
      if (alive) setState({ kind: 'ready', problems });
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  if (state.kind === 'opening') return <p className={s.centre}>Loading the jobs from the shared database…</p>;
  return (
    <>
      {state.problems.length > 0 && (
        <div className={s.banner} role="alert">
          {state.problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}
      {children}
    </>
  );
}
