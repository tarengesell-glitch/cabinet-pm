'use client';
/** Tasks (placeholder, demo data): everything outstanding; tick one off and it drops away. */
import { useState } from 'react';
import { useOffice } from '../OfficeFrame';
import { AddTask, TaskRow, taskDue } from '../parts';
import s from '../office.module.css';

export function Tasks() {
  const { tasks } = useOffice();
  const [adding, setAdding] = useState(false);
  const open = tasks.filter((t) => !t.done).sort((a, b) => (taskDue(a)?.getTime() ?? Infinity) - (taskDue(b)?.getTime() ?? Infinity));
  return (
    <div className={s.screen} style={{ maxWidth: 820 }}>
      <header className={s.screenHead}>
        <div>
          <h1 className={s.h1}>{open.length} outstanding</h1>
          <p className={s.sub}>Tick one off and it drops away. Demo data: kept only until the page is closed.</p>
        </div>
        <div className={s.headActions}>
          <button className={s.btnPrimary} onClick={() => setAdding(true)}>
            + Add task
          </button>
        </div>
      </header>
      <div className={s.stack}>
        {adding && <AddTask onDone={() => setAdding(false)} />}
        {open.length ? open.map((t) => <TaskRow key={t.id} task={t} detail />) : <div className={s.empty}>Nothing outstanding.</div>}
      </div>
    </div>
  );
}
