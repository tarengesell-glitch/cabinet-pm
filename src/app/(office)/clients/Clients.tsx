'use client';
/**
 * Clients: the real clients from the shared database (staff only), then the made-up demo clients,
 * labelled. "New client" adds a real client (owner, 2026-11-09); it needs the database, because
 * real client details are never kept in the code (the repository is public).
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { can, supabaseClient } from '@/platform/index';
import { addCustomer, type NewCustomer } from '@/modules/projects/contract';
import { clientHref, useClients } from '../../clients';
import { DEMO_MEETINGS, demoDate } from '../../demo-data';
import { jobProgress } from '../../job-progress';
import { useSession } from '../../sync/session';
import { dayLabel, timeLabel } from '../parts';
import s from '../office.module.css';

export function Clients() {
  const { list } = useClients();
  const session = useSession();
  const [rooms, setRooms] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  useEffect(() => setRooms(Object.fromEntries(list.map((c) => [c.id, jobProgress(c.id)?.rooms.length ?? 0]))), [list]);
  const real = list.filter((c) => !c.demo).length;
  const mayAdd = can(session.user, 'client.add');
  return (
    <div className={s.screen} style={{ maxWidth: 900 }}>
      <header className={s.screenHead}>
        <div>
          <h1 className={s.h1}>Clients</h1>
          <p className={s.sub}>
            {real} client{real === 1 ? '' : 's'} · {list.length - real} demo
          </p>
        </div>
        {mayAdd && !adding && (
          <div className={s.headActions}>
            <button className={s.btnPrimaryLg} onClick={() => setAdding(true)}>
              New client
            </button>
          </div>
        )}
      </header>
      {adding && <NewClientForm onClose={() => setAdding(false)} />}
      <div className={s.stack}>
        {list.map((c) => {
          const next = DEMO_MEETINGS.filter((m) => m.clientId === c.id).map((m) => demoDate(m.day, m.hour, m.minute)).sort((a, b) => a.getTime() - b.getTime())[0];
          const n = rooms[c.id] ?? 0;
          return (
            <Link key={c.id} className={s.clientRow} href={clientHref(c)}>
              <span className={s.avatar}>{c.name[0]}</span>
              <span style={{ minWidth: 0 }}>
                <span className={s.clientName} style={{ display: 'block' }}>
                  {c.name}
                </span>
                <span className={s.muted}>
                  {c.address}
                  {c.demo ? ' · demo' : ''}
                </span>
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

const EMPTY: NewCustomer = { name: '', primary: { name: '', email: '', phone: '' }, secondary: { name: '', email: '', phone: '' }, address: '', notes: '' };

function NewClientForm({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const { reload } = useClients();
  const router = useRouter();
  const [form, setForm] = useState<NewCustomer>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (session.mode !== 'database') {
    return (
      <p className={s.error} role="alert">
        Adding a client needs the shared database, and this copy of the site isn’t connected to it. Real client details are never kept in this browser or in the code.
      </p>
    );
  }

  const set = (path: 'name' | 'address' | 'notes', v: string) => setForm((f) => ({ ...f, [path]: v }));
  const setContact = (who: 'primary' | 'secondary', field: 'name' | 'email' | 'phone', v: string) => setForm((f) => ({ ...f, [who]: { ...f[who], [field]: v } }));
  const save = async () => {
    const db = supabaseClient();
    if (!db.ok) return setProblem(db.reason);
    setBusy(true);
    const r = await addCustomer(db.value, form);
    setBusy(false);
    if (!r.ok) return setProblem(r.reason);
    await reload();
    router.push(`/clients/view/?id=${encodeURIComponent(r.value.id)}`);
  };
  const field = (id: string, label: string, value: string, onChange: (v: string) => void, type = 'text', autoComplete = 'off') => (
    <label htmlFor={id} style={{ display: 'grid', gap: 4 }}>
      <span className={s.label}>{label}</span>
      <input id={id} className={s.textIn} type={type} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );

  return (
    <form
      className={s.card}
      style={{ padding: 18, display: 'grid', gap: 14, marginBottom: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className={s.h2}>New client</h2>
      {field('client-name', 'Household name (for example "Ada & Ben Example")', form.name, (v) => set('name', v))}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {field('primary-name', 'Primary contact', form.primary.name, (v) => setContact('primary', 'name', v))}
        {field('primary-email', 'Email', form.primary.email, (v) => setContact('primary', 'email', v), 'email')}
        {field('primary-phone', 'Phone', form.primary.phone, (v) => setContact('primary', 'phone', v), 'tel')}
        {field('secondary-name', 'Second contact (optional)', form.secondary.name, (v) => setContact('secondary', 'name', v))}
        {field('secondary-email', 'Email', form.secondary.email, (v) => setContact('secondary', 'email', v), 'email')}
        {field('secondary-phone', 'Phone', form.secondary.phone, (v) => setContact('secondary', 'phone', v), 'tel')}
      </div>
      {field('client-address', 'Address', form.address, (v) => set('address', v))}
      {field('client-notes', 'Notes (optional)', form.notes, (v) => set('notes', v))}
      {problem && (
        <p className={s.error} role="alert">
          {problem}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className={s.btnPrimary} type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save client'}
        </button>
        <button className={s.btn} type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      <p className={s.muted}>Saved to the shared database, where only signed-in staff can see it.</p>
    </form>
  );
}
