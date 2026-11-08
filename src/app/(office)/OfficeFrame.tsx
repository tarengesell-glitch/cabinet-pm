'use client';
/**
 * The office frame (the owner's Kitchen Studio prototype, closet-builder's look): a white top bar
 * and a side menu that folds, around Today, Tasks and Clients. PLACEHOLDER screens on DEMO DATA:
 * the tasks you tick or add are kept only until the page is closed, and the screens say so.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { PREVIEW_USER } from '@/platform/index';
import { DEMO_TASKS, type DemoTask } from '../demo-data';
import s from './office.module.css';

interface Office {
  readonly tasks: readonly (DemoTask & { readonly done: boolean })[];
  readonly tickTask: (id: string) => void;
  readonly addTask: (title: string) => void;
  readonly toast: (text: string) => void;
}

const OfficeContext = createContext<Office | null>(null);

export function useOffice(): Office {
  const o = useContext(OfficeContext);
  if (!o) throw new Error('The office screens must sit inside the office frame.');
  return o;
}

const ICONS: Record<string, string> = {
  today: 'M4 5.5h12v10H4zM4 8.5h12M7.5 3.5v3M12.5 3.5v3',
  tasks: 'M3 6.2l1.8 1.8L8 4.6M3 13.2l1.8 1.8L8 11.6M11 6.5h6M11 13.5h6',
  clients: 'M2.5 16.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M7 9.5a2.75 2.75 0 100-5.5 2.75 2.75 0 000 5.5M13 12.8c2.2.3 3.5 1.7 3.5 3.7M13.5 9a2.4 2.4 0 100-4.8',
  collapse: 'M12.5 5l-5 5 5 5',
};
const Icon = ({ name }: { name: string }) => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function OfficeFrame({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '/';
  const [collapsed, setCollapsed] = useState(false);
  const [tasks, setTasks] = useState(() => DEMO_TASKS.map((t) => ({ ...t, done: false })));
  const [toastText, setToastText] = useState<string | null>(null);
  const toast = useCallback((text: string) => {
    setToastText(text);
    window.setTimeout(() => setToastText((t) => (t === text ? null : t)), 2800);
  }, []);
  const office = useMemo<Office>(
    () => ({
      tasks,
      tickTask: (id) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: true } : t))),
      addTask: (title) => setTasks((ts) => [...ts, { id: `new-${ts.length + 1}`, clientId: null, title, due: { day: 0, hour: 17 }, done: false }]),
      toast,
    }),
    [tasks, toast],
  );
  const open = tasks.filter((t) => !t.done).length;
  const here = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));
  const item = (href: string, name: string, label: string, extra?: ReactNode) => (
    <Link className={s.railItem} href={href} aria-current={here(href) ? 'page' : undefined} title={label}>
      <Icon name={name} />
      <span>{label}</span>
      {extra}
    </Link>
  );
  return (
    <OfficeContext.Provider value={office}>
      <div className={s.frame}>
        <header className={s.top}>
          <span className={s.logo} aria-hidden="true">
            C
          </span>
          <div>
            <div className={s.brand}>Cabinet design platform</div>
            <div className={s.brandSub}>Design studio</div>
          </div>
          <span className={s.spacer} />
          <span className={s.flag}>Placeholder screens · demo data · {PREVIEW_USER.name}</span>
        </header>
        <nav className={collapsed ? s.railCollapsed : s.rail} aria-label="Main">
          {item('/', 'today', 'Today')}
          {item('/tasks/', 'tasks', 'Tasks', open ? <span className={s.count}>{open}</span> : null)}
          {item('/clients/', 'clients', 'Clients')}
          <span className={s.grow} />
          <button className={s.collapse} onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
            <span style={{ display: 'inline-flex', transform: `rotate(${collapsed ? 180 : 0}deg)` }}>
              <Icon name="collapse" />
            </span>
            <span>Collapse</span>
          </button>
        </nav>
        <main className={s.main}>{children}</main>
      </div>
      {toastText && (
        <div className={s.toast} role="status">
          {toastText}
        </div>
      )}
    </OfficeContext.Provider>
  );
}
