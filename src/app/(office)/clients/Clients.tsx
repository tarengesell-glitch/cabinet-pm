'use client';
/** Clients (placeholder, demo data). */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DEMO_CLIENTS, DEMO_MEETINGS, demoDate } from '../../demo-data';
import { jobProgress } from '../../job-progress';
import { dayLabel, timeLabel } from '../parts';
import s from '../office.module.css';

export function Clients() {
  const [rooms, setRooms] = useState<Record<string, number>>({});
  useEffect(() => setRooms(Object.fromEntries(DEMO_CLIENTS.map((c) => [c.id, jobProgress(c.id)?.rooms.length ?? 0]))), []);
  return (
    <div className={s.screen} style={{ maxWidth: 900 }}>
      <header className={s.screenHead}>
        <div>
          <h1 className={s.h1}>Clients</h1>
          <p className={s.sub}>{DEMO_CLIENTS.length} clients · demo data</p>
        </div>
      </header>
      <div className={s.stack}>
        {DEMO_CLIENTS.map((c) => {
          const next = DEMO_MEETINGS.filter((m) => m.clientId === c.id).map((m) => demoDate(m.day, m.hour, m.minute)).sort((a, b) => a.getTime() - b.getTime())[0];
          const n = rooms[c.id] ?? 0;
          return (
            <Link key={c.id} className={s.clientRow} href={`/clients/${c.id}/`}>
              <span className={s.avatar}>{c.name[0]}</span>
              <span style={{ minWidth: 0 }}>
                <span className={s.clientName} style={{ display: 'block' }}>
                  {c.name}
                </span>
                <span className={s.muted}>{c.address}</span>
              </span>
              <span style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                {next && (
                  <span className={s.pill}>
                    {dayLabel(next)} {timeLabel(next)}
                  </span>
                )}
                <span className={s.muted}>
                  {n} room{n === 1 ? '' : 's'}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
