'use client';
/** Today (placeholder, demo data): the next three days of calls, today's tasks, designs in progress. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useClients, type ClientInfo } from '../clients';
import { DEMO_MEETINGS, demoClient, demoDate, type DemoMeeting } from '../demo-data';
import { jobProgress, type JobProgress } from '../job-progress';
import { useOffice } from './OfficeFrame';
import { AddTask, dayDiff, dayLabel, JobRow, studioHref, TaskRow, taskDue, timeLabel } from './parts';
import s from './office.module.css';

export function Today() {
  const { tasks, toast } = useOffice();
  const [open, setOpen] = useState<string | null>('m1');
  const [adding, setAdding] = useState(false);
  const { list } = useClients();
  const [jobs, setJobs] = useState<{ client: ClientInfo; progress: JobProgress }[]>([]);
  useEffect(() => {
    setJobs(list.flatMap((c) => {
      const p = jobProgress(c.id);
      return p && p.stage !== 'Designed' ? [{ client: c, progress: p }] : [];
    }));
  }, [list]);

  const meetings = [...DEMO_MEETINGS].sort((a, b) => demoDate(a.day, a.hour, a.minute).getTime() - demoDate(b.day, b.hour, b.minute).getTime());
  const days = [...new Set(meetings.map((m) => m.day))];
  const live = tasks.filter((t) => !t.done);
  const due = live.filter((t) => {
    const d = taskDue(t);
    return d !== null && dayDiff(d) <= 0;
  });
  const later = live.length - due.length;
  const now = new Date();

  return (
    <div className={s.screen}>
      <header className={s.screenHead}>
        <div>
          <h1 className={s.h1}>{now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
          <p className={s.sub}>
            {meetings.filter((m) => m.day === 0).length} calls and {due.length} tasks today · demo data
          </p>
        </div>
      </header>
      <div className={s.grid2}>
        <section>
          <div className={s.sectionTitle}>
            <h2 className={s.h2}>Your next three days</h2>
          </div>
          {days.map((day) => (
            <div key={day}>
              <p className={s.dayLabel}>{dayLabel(demoDate(day, 0))}</p>
              <div className={s.stack}>
                {meetings
                  .filter((m) => m.day === day)
                  .map((m) => (
                    <Meeting key={m.id} m={m} open={open === m.id} onToggle={() => setOpen((o) => (o === m.id ? null : m.id))} onJoin={() => toast(`Joining ${m.platform} is mocked in this preview.`)} />
                  ))}
              </div>
            </div>
          ))}
        </section>
        <section>
          <div className={s.sectionTitle}>
            <h2 className={s.h2}>Today’s tasks</h2>
            <Link className={s.btnGhostSm} href="/tasks/">
              All tasks{later ? ` · ${later} more` : ''}
            </Link>
          </div>
          <div className={s.stack}>
            {due.length ? due.map((t) => <TaskRow key={t.id} task={t} detail={false} />) : <div className={s.empty}>Nothing due today.</div>}
            {adding ? (
              <AddTask onDone={() => setAdding(false)} />
            ) : (
              <button className={s.btn} style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>
                + Add task
              </button>
            )}
          </div>
          {jobs.length > 0 && (
            <>
              <div className={s.sectionTitle} style={{ marginTop: 26 }}>
                <h2 className={s.h2}>Designs in progress</h2>
              </div>
              <div className={s.stack}>
                {jobs.map((j) => (
                  <JobRow key={j.client.id} client={j.client} progress={j.progress} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Meeting({ m, open, onToggle, onJoin }: { m: DemoMeeting; open: boolean; onToggle: () => void; onJoin: () => void }) {
  const c = demoClient(m.clientId);
  if (!c) return null;
  return (
    <article className={open ? s.meetingOpen : s.meeting}>
      <button className={s.meetingHead} onClick={onToggle} aria-expanded={open}>
        <span className={s.meetingTime}>{timeLabel(demoDate(m.day, m.hour, m.minute))}</span>
        <span style={{ minWidth: 0 }}>
          <span className={s.meetingClient}>{c.name}</span>
          <span className={s.meetingTitle}>{m.title}</span>
        </span>
        <span className={s.meetingTags}>
          <span className={m.visit === 1 ? s.pillSoft : s.pill}>{m.visit === 1 ? 'New lead' : `Visit ${m.visit}`}</span>
          <span className={s.pill}>{m.platform}</span>
        </span>
      </button>
      {open && (
        <div className={s.meetingBody}>
          {m.prior ? (
            <div>
              <p className={s.label} style={{ marginBottom: 6 }}>
                From the last session
              </p>
              <p className={s.prior}>{m.prior}</p>
            </div>
          ) : (
            <p className={s.muted}>First conversation. Nothing shared yet.</p>
          )}
          <div className={s.rowActions}>
            <button className={s.btnPrimary} onClick={onJoin}>
              Join {m.platform}
            </button>
            <Link className={s.btn} href={`/clients/${c.id}/`}>
              Open client
            </Link>
            <Link className={s.btn} href={studioHref(c)}>
              Start a design
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}
