'use client';
/** Pieces shared by the placeholder office screens. */
import Link from 'next/link';
import { useState } from 'react';
import { demoClient, demoDate, jobName, type DemoClient, type DemoTask } from '../demo-data';
import type { JobProgress } from '../job-progress';
import { useOffice } from './OfficeFrame';
import s from './office.module.css';

const dayKey = (d: Date) => d.toDateString();
export const dayDiff = (d: Date): number => Math.round((new Date(d.toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / 864e5);
export const dayLabel = (d: Date): string => {
  const n = dayDiff(d);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
};
export const timeLabel = (d: Date): string => d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
export { dayKey };

export const taskDue = (t: DemoTask): Date | null => (t.due ? demoDate(t.due.day, t.due.hour) : null);

export function TaskRow({ task, detail }: { task: DemoTask; detail: boolean }) {
  const { tickTask } = useOffice();
  const c = demoClient(task.clientId);
  const due = taskDue(task);
  const n = due ? dayDiff(due) : null;
  const dueText = !due ? 'No date' : n! < 0 ? 'Overdue' : n === 0 ? timeLabel(due) : due.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  return (
    <article className={s.task}>
      <button className={s.checkBtn} onClick={() => tickTask(task.id)} aria-label={`Mark ${task.title} complete`}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M2.5 6.2l2.3 2.3L9.5 3.8" />
        </svg>
      </button>
      <div style={{ minWidth: 0 }}>
        <div className={s.taskTitle}>{task.title}</div>
        {c && (
          <Link className={s.taskClient} href={`/clients/${c.id}/`}>
            {c.name}
          </Link>
        )}
        {detail && task.detail && <p className={s.taskDetail}>{task.detail}</p>}
      </div>
      <span className={n !== null && n < 0 ? s.dueLate : n === 0 ? s.dueToday : s.due}>{dueText}</span>
    </article>
  );
}

export function AddTask({ onDone }: { onDone: () => void }) {
  const { addTask } = useOffice();
  const [title, setTitle] = useState('');
  return (
    <form
      className={s.addTask}
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) addTask(title.trim());
        onDone();
      }}
    >
      <input className={s.textIn} placeholder="What needs doing?" aria-label="Task" autoComplete="off" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      <button className={s.btnPrimary} type="submit">
        Add
      </button>
    </form>
  );
}

export const studioHref = (c: DemoClient): string => `/studio/?job=${encodeURIComponent(c.id)}`;

export function JobRow({ client, progress }: { client: DemoClient; progress: JobProgress }) {
  return (
    <Link className={s.clientRow} href={studioHref(client)}>
      <span className={s.avatar}>{client.name[0]}</span>
      <span style={{ minWidth: 0 }}>
        <span className={s.clientName} style={{ fontSize: 16, display: 'block' }}>
          {jobName(client)}
        </span>
        <span className={s.muted}>
          {client.name} · {progress.rooms.length} room{progress.rooms.length === 1 ? '' : 's'} · {progress.stage}
        </span>
      </span>
      <span className={progress.stage === 'Designed' ? s.pillOk : s.pillWarn}>{progress.stage === 'Designed' ? 'Designed' : 'Not finished'}</span>
    </Link>
  );
}
