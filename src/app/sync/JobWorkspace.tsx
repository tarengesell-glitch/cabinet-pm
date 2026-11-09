'use client';
/**
 * Opens a studio job from the shared database before any screen reads it, then saves every change
 * automatically (owner, 2026-11-09). The save status is handed to the screen to show at all times.
 * Without the database (browser-only mode) it does nothing and the screen says work stays here.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AutoSaver, openJob, BROWSER_RECORDS, type Clash, type SaveStatus, type SyncDeps } from './job-sync';
import { BROWSER_WORKING_COPY } from './working-copy';
import { useSession } from './session';
import s from './sync.module.css';

const TICK_MS = 1200;

type Phase =
  | { readonly kind: 'opening' }
  | { readonly kind: 'clash'; readonly clashes: readonly Clash[] }
  | { readonly kind: 'problem'; readonly reason: string }
  | { readonly kind: 'ready'; readonly notes: readonly string[] };

export function JobWorkspace({ job, children }: { job: string | null; children: (status: ReactNode) => ReactNode }) {
  const session = useSession();
  const [phase, setPhase] = useState<Phase>({ kind: 'opening' });
  const [status, setStatus] = useState<SaveStatus>({ kind: 'saved' });
  const saver = useRef<AutoSaver | null>(null);
  const deps: SyncDeps | null = session.mode === 'database' ? { backend: session.backend, copy: BROWSER_WORKING_COPY, records: BROWSER_RECORDS } : null;
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const open = useCallback(
    async (resolve?: 'take_shared' | 'keep_mine') => {
      const d = depsRef.current;
      if (!d) return setPhase({ kind: 'ready', notes: [] });
      setPhase({ kind: 'opening' });
      const r = await openJob(d, job, resolve);
      if (r.kind === 'ready') saver.current = new AutoSaver(d, job);
      setPhase(r);
    },
    [job],
  );

  useEffect(() => {
    void open();
  }, [open]);

  // Save as the person works, and warn before closing the page with changes not yet saved.
  useEffect(() => {
    if (phase.kind !== 'ready' || !saver.current) return;
    const s0 = saver.current;
    let alive = true;
    const id = window.setInterval(() => {
      void s0.tick().then((st) => alive && setStatus(st));
    }, TICK_MS);
    const warn = (e: BeforeUnloadEvent) => {
      if (s0.pending()) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener('beforeunload', warn);
    };
  }, [phase.kind]);

  if (phase.kind === 'opening') return <p className={s.centre}>Opening the job from the shared database…</p>;
  if (phase.kind === 'problem') {
    return (
      <main className={s.card}>
        <h1 className={s.heading}>The job can’t be opened</h1>
        <p className={s.error} role="alert">
          {phase.reason}
        </p>
        <button className={s.secondary} onClick={() => void open()}>
          Try again
        </button>
      </main>
    );
  }
  if (phase.kind === 'clash') return <ClashChoice clashes={phase.clashes} onChoose={(c) => void open(c)} />;

  const statusNode =
    session.mode === 'browser_only' ? (
      <span className={s.status}>Kept in this browser only: not connected to the shared database</span>
    ) : status.kind === 'saved' ? (
      <span className={s.status}>Saved to the shared database</span>
    ) : status.kind === 'saving' ? (
      <span className={s.status}>Saving…</span>
    ) : status.kind === 'clash' ? (
      <span className={s.statusBad}>Not saved: someone else saved this job</span>
    ) : (
      <span className={s.statusBad} title={status.reason}>
        Not saved
      </span>
    );

  return (
    <>
      {status.kind === 'clash' && (
        <div className={s.banner} role="alert">
          Someone else saved this job while you were working on it, so your latest changes were not saved. Nothing has been overwritten.
          <div className={s.actions}>
            <button className={s.secondary} onClick={() => window.location.reload()}>
              Reload and choose which copy to keep
            </button>
          </div>
        </div>
      )}
      {status.kind === 'problem' && (
        <p className={s.banner} role="alert">
          Your latest changes are not saved yet: {status.reason} It tries again every second or two.
        </p>
      )}
      {phase.notes.length > 0 && <p className={s.notice}>{phase.notes.join(' ')}</p>}
      {children(statusNode)}
    </>
  );
}

function ClashChoice({ clashes, onChoose }: { clashes: readonly Clash[]; onChoose: (c: 'take_shared' | 'keep_mine') => void }) {
  return (
    <main className={s.card}>
      <h1 className={s.heading}>Two copies of this job</h1>
      <p>
        This browser has changes to {[...new Set(clashes.map((c) => c.what))].join(' and ')} that were never saved, and someone has saved a newer version
        since. Which should continue?
      </p>
      <div className={s.actions}>
        <button className={s.primary} onClick={() => onChoose('take_shared')}>
          Use the saved copy (this browser’s changes are dropped)
        </button>
        <button className={s.secondary} onClick={() => onChoose('keep_mine')}>
          Keep this browser’s copy (saved as a new version; the other stays in the history)
        </button>
      </div>
    </main>
  );
}
