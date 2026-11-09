'use client';
/**
 * The office's client list: real clients from the shared database (projects; staff only, never in
 * code, because the repository is public), then the made-up demo clients, still labelled demo.
 * Each client has one design job, keyed by the client's ID, until jobs have their own records.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { Customer } from '@/modules/projects/contract';
import { DEMO_CLIENTS, type DemoClient } from './demo-data';

export interface ClientInfo extends DemoClient {
  /** True for the made-up demo clients; false for real clients from the database. */
  readonly demo: boolean;
  readonly secondaryEmail?: string;
  readonly secondaryPhone?: string;
}

export function fromCustomer(c: Customer): ClientInfo {
  const primary = c.contacts.find((x) => x.role === 'primary') ?? c.contacts[0]!;
  const second = c.contacts.find((x) => x.role === 'secondary');
  return {
    id: c.id,
    name: c.name,
    primary: primary.name,
    ...(second ? { secondary: second.name, ...(second.email ? { secondaryEmail: second.email } : {}), ...(second.phone ? { secondaryPhone: second.phone } : {}) } : {}),
    email: primary.email ?? '',
    phone: primary.phone ?? '',
    address: c.address ?? '',
    notes: c.notes ?? '',
    demo: false,
  };
}

export const DEMO_INFO: readonly ClientInfo[] = DEMO_CLIENTS.map((c) => ({ ...c, demo: true }));

export interface Clients {
  readonly list: readonly ClientInfo[];
  readonly find: (id: string | null) => ClientInfo | null;
  /** Reads the real clients again (after one is added). */
  readonly reload: () => Promise<void>;
}

const ClientsContext = createContext<Clients | null>(null);
export const ClientsProvider = ({ value, children }: { value: Clients; children: ReactNode }) => <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;

export function useClients(): Clients {
  const c = useContext(ClientsContext);
  if (!c) throw new Error('This screen must sit inside the office, which loads the clients.');
  return c;
}

/** A client's page: demo clients have pages made when the site is built; real clients are opened by ID. */
export const clientHref = (c: ClientInfo): string => (c.demo ? `/clients/${c.id}/` : `/clients/view/?id=${encodeURIComponent(c.id)}`);
