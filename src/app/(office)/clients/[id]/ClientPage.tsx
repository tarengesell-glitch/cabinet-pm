'use client';
/** One client (placeholder, demo data): their design, contact, notes and open tasks. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PlanThumb } from '@/modules/designer/ui/index';
import { demoClient, jobName } from '../../../demo-data';
import { jobProgress, type JobProgress } from '../../../job-progress';
import { useOffice } from '../../OfficeFrame';
import { studioHref, TaskRow } from '../../parts';
import s from '../../office.module.css';

export function ClientPage({ id }: { id: string }) {
  const c = demoClient(id);
  const { tasks } = useOffice();
  const [progress, setProgress] = useState<JobProgress | null | undefined>(undefined);
  useEffect(() => setProgress(jobProgress(id)), [id]);
  if (!c) return <div className={s.screen}><div className={s.empty}>There is no client “{id}” in the demo data.</div></div>;
  const open = tasks.filter((t) => t.clientId === id && !t.done);
  return (
    <div className={s.screen}>
      <header className={s.screenHead}>
        <div>
          <Link className={s.btnGhostSm} href="/clients/" style={{ marginLeft: -10, marginBottom: 6 }}>
            ← Clients
          </Link>
          <h1 className={s.h1}>{c.name}</h1>
          <p className={s.sub}>{c.address}</p>
        </div>
        <div className={s.headActions}>
          <Link className={s.btnPrimaryLg} href={studioHref(c)}>
            {progress ? 'Open the design' : 'Start a design'}
          </Link>
        </div>
      </header>
      <div className={s.grid2}>
        <section>
          <div className={s.sectionTitle}>
            <h2 className={s.h2}>Design</h2>
          </div>
          {progress === undefined ? null : progress === null ? (
            <div className={s.empty}>
              No design yet. A design covers every room in the project: the kitchen first, then any others.
              <Link className={s.btnPrimary} href={studioHref(c)}>
                Start a design
              </Link>
            </div>
          ) : (
            <div className={s.jobBlock}>
              <div className={s.jobHead}>
                <div>
                  <h3 className={s.h3}>{jobName(c)}</h3>
                  <p className={s.muted}>
                    {progress.rooms.length} room{progress.rooms.length === 1 ? '' : 's'} · {progress.stage}
                  </p>
                  {progress.problem && (
                    <p className={s.error} role="alert">
                      {progress.problem}
                    </p>
                  )}
                </div>
                <Link className={s.btn} href={studioHref(c)}>
                  {progress.stage === 'Designed' ? 'Open' : 'Resume'}
                </Link>
              </div>
              <div className={s.roomsGrid}>
                {progress.rooms.map((r) => (
                  <Link key={r.id} className={s.roomCard} href={studioHref(c)}>
                    <span className={s.roomThumb}>{r.drawn ? <PlanThumb roomKey={r.id} showDesign={r.stage === 'Designed'} /> : <span className={s.muted}>Not drawn yet</span>}</span>
                    <span className={s.roomName}>{r.name}</span>
                    <span className={s.muted}>{r.stage}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className={s.card} style={{ padding: 18, display: 'grid', gap: 14, alignSelf: 'start' }}>
          <h2 className={s.h2}>Contact</h2>
          <dl className={s.kv}>
            <dt>Primary</dt>
            <dd>{c.primary}</dd>
            {c.secondary && (
              <>
                <dt>Also</dt>
                <dd>{c.secondary}</dd>
              </>
            )}
            <dt>Email</dt>
            <dd className={s.mono}>{c.email}</dd>
            <dt>Phone</dt>
            <dd className={s.mono}>{c.phone}</dd>
          </dl>
          <div>
            <p className={s.label} style={{ marginBottom: 6 }}>
              Notes
            </p>
            <p className={s.prior}>{c.notes}</p>
          </div>
          <div>
            <p className={s.label} style={{ marginBottom: 6 }}>
              Open tasks
            </p>
            <div className={s.stack}>{open.length ? open.map((t) => <TaskRow key={t.id} task={t} detail={false} />) : <p className={s.muted}>None.</p>}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
