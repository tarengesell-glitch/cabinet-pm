'use client';
import { useEffect, useState } from 'react';
import { ClientPage } from '../[id]/ClientPage';
import s from '../../office.module.css';

export function ClientById() {
  // The page address is known only in the browser, not when the site is built.
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => setId(new URLSearchParams(window.location.search).get('id')), []);
  if (id === undefined) return null;
  if (!id)
    return (
      <div className={s.screen}>
        <div className={s.empty}>No client was named in the address.</div>
      </div>
    );
  return <ClientPage id={id} />;
}
