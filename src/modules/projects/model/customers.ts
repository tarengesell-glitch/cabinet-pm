/**
 * Real clients (owner, 2026-11-09), kept only in the shared database: staff only, never in code,
 * because the repository is public and the site's code reaches every visitor. Table `customers`
 * (supabase/migrations/20261109000004_customers.sql), owned by this module.
 *
 * Everything is checked before it is saved, and refused with plain reasons; nothing is filled in.
 */
import { z } from 'zod';
import { ok, refuse, type Result } from '@/core/index';
import type { supabaseClient } from '@/platform/index';

type Db = Extract<ReturnType<typeof supabaseClient>, { ok: true }>['value'];

export interface Contact {
  readonly role: 'primary' | 'secondary';
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface Customer {
  readonly id: string;
  /** The household, as the office calls them ("Ada & Ben Example"). */
  readonly name: string;
  readonly contacts: readonly Contact[];
  readonly address: string | null;
  readonly notes: string | null;
}

/** What the "New client" form sends. Blank fields are empty strings. */
export interface NewCustomer {
  readonly name: string;
  readonly primary: { readonly name: string; readonly email: string; readonly phone: string };
  readonly secondary: { readonly name: string; readonly email: string; readonly phone: string };
  readonly address: string;
  readonly notes: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A phone number as people type it: digits, spaces, dashes, dots, brackets and a leading +; 7 to 15 digits. */
const PHONE = /^\+?[\d\s().-]+$/;
const digits = (s: string) => s.replace(/\D/g, '').length;

/** Checks the form and returns the row to save, or every problem with it. */
export function checkNewCustomer(input: NewCustomer): Result<Omit<Customer, 'id'>> {
  const problems: string[] = [];
  const t = (s: string) => s.trim();
  const contact = (role: 'primary' | 'secondary', c: NewCustomer['primary'], label: string): Contact | null => {
    const name = t(c.name);
    const email = t(c.email);
    const phone = t(c.phone);
    if (role === 'secondary' && !name && !email && !phone) return null;
    if (!name) problems.push(`The ${label} contact needs a name.`);
    if (role === 'primary' && !email && !phone) problems.push('The primary contact needs an email or a phone number, so they can be reached.');
    if (email && !EMAIL.test(email)) problems.push(`"${email}" isn't an email address.`);
    if (phone && (!PHONE.test(phone) || digits(phone) < 7 || digits(phone) > 15)) problems.push(`"${phone}" isn't a phone number.`);
    return { role, name, email: email || null, phone: phone || null };
  };
  if (!t(input.name)) problems.push('The client needs a name (the household, for example "Ada & Ben Example").');
  const primary = contact('primary', input.primary, 'primary');
  const secondary = contact('secondary', input.secondary, 'second');
  if (problems.length > 0) return refuse(problems.join(' '));
  return ok({ name: t(input.name), contacts: [primary!, ...(secondary ? [secondary] : [])], address: t(input.address) || null, notes: t(input.notes) || null });
}

const ContactSchema = z.strictObject({
  role: z.enum(['primary', 'secondary']),
  name: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
const RowSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  contacts: z.array(ContactSchema).min(1).max(2),
  address: z.string().nullable(),
  notes: z.string().nullable(),
});

/** Reads rows from the database; a row in the wrong shape is reported, never dropped. */
export function readCustomerRows(rows: readonly unknown[]): Result<Customer[]> {
  const out: Customer[] = [];
  const problems: string[] = [];
  rows.forEach((row, i) => {
    const r = RowSchema.safeParse(row);
    if (r.success) out.push(r.data);
    else problems.push(`Client ${i + 1} in the database isn't in the expected shape (${r.error.issues.map((x) => x.message).join('; ')}).`);
  });
  return problems.length ? refuse(problems.join(' ')) : ok(out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
}

const COLUMNS = 'id, name, contacts, address, notes';

export async function loadCustomers(db: Db): Promise<Result<Customer[]>> {
  try {
    const { data, error } = await db.from('customers').select(COLUMNS);
    if (error) return refuse(`The clients couldn't be loaded: ${error.message}.`);
    return readCustomerRows(data ?? []);
  } catch (e) {
    return refuse(`The clients couldn't be loaded: the shared database couldn't be reached (${e instanceof Error ? e.message : String(e)}).`);
  }
}

export async function addCustomer(db: Db, input: NewCustomer): Promise<Result<Customer>> {
  const checked = checkNewCustomer(input);
  if (!checked.ok) return checked;
  try {
    const { data, error } = await db.from('customers').insert(checked.value).select(COLUMNS).single();
    if (error) return refuse(`The client wasn't saved: ${error.message}.`);
    const read = readCustomerRows([data]);
    return read.ok ? ok(read.value[0]!) : read;
  } catch (e) {
    return refuse(`The client wasn't saved: the shared database couldn't be reached (${e instanceof Error ? e.message : String(e)}).`);
  }
}
