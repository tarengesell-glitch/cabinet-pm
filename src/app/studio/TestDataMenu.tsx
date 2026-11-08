'use client';
/** The studio's Test data menu: save this job as a test start, load it, or use a file. */
import { useRef, useState } from 'react';
import { downloadJob, loadTestStart, readJobFile, restoreJob, saveTestStart, snapshotJob } from './test-data';
import s from './Studio.module.css';

export function TestDataMenu({ job, fileName }: { job: string | null; fileName: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const start = loadTestStart();
  const replace = (fn: () => string | null) => {
    if (!window.confirm('Replace this job’s design choices, drawings and designs with the saved ones?')) return;
    const problem = fn();
    if (problem) setMessage({ error: true, text: problem });
    else window.location.reload();
  };
  return (
    <div className={s.testMenu}>
      <button className={s.testBtn} aria-expanded={open} onClick={() => (setOpen((o) => !o), setMessage(null))}>
        Test data ▾
      </button>
      {open && (
        <div className={s.testDrop} role="menu" aria-label="Test data">
          <button
            role="menuitem"
            onClick={() => {
              const snap = snapshotJob(job);
              const problem = snap.ok ? saveTestStart(snap.value) : snap.reason;
              setMessage(problem ? { error: true, text: problem } : { error: false, text: 'Saved as your test start. Load it into any job from this menu.' });
            }}
          >
            Save this job as my test start
          </button>
          <button
            role="menuitem"
            disabled={!start.ok || start.value === null}
            onClick={() => start.ok && start.value && replace(() => restoreJob(job, start.value!))}
            title={start.ok ? (start.value ? `Saved ${new Date(start.value.saved_at).toLocaleString('en-CA')}` : 'Nothing saved yet') : start.reason}
          >
            Load my test start into this job
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const snap = snapshotJob(job);
              if (snap.ok) downloadJob(snap.value, fileName);
              else setMessage({ error: true, text: snap.reason });
            }}
          >
            Download this job as a file
          </button>
          <button role="menuitem" onClick={() => fileRef.current?.click()}>
            Load a job file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Job file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const read = readJobFile(JSON.parse(await f.text()));
                if (!read.ok) return setMessage({ error: true, text: read.reason });
                replace(() => restoreJob(job, read.value));
              } catch (err) {
                setMessage({ error: true, text: `That file can’t be read (${err instanceof Error ? err.message : String(err)}).` });
              }
            }}
          />
          {message && (
            <p className={message.error ? s.testError : s.testNote} role="status">
              {message.text}
            </p>
          )}
          <p className={s.testNote}>Work is already kept in this browser, separately for each job. This copies one job’s work into another.</p>
        </div>
      )}
    </div>
  );
}
