import { describe, expect, it } from 'vitest';
import { checkNewCustomer, readCustomerRows, type NewCustomer } from '../model/customers';

// Made-up people only: real client details never go in the repository (it is public).
const blank = { name: '', email: '', phone: '' };
const form = (over: Partial<NewCustomer> = {}): NewCustomer => ({
  name: 'Ada & Ben Example',
  primary: { name: 'Ada Example', email: 'ada@example.com', phone: '204-555-0100' },
  secondary: blank,
  address: '1 Example Way, Winnipeg, MB',
  notes: '',
  ...over,
});

describe('a new client', () => {
  it('is saved with its contacts, and blank optional fields left empty, not filled in', () => {
    expect(checkNewCustomer(form({ secondary: { name: 'Ben Example', email: '', phone: '(204) 555-0101' } }))).toEqual({
      ok: true,
      value: {
        name: 'Ada & Ben Example',
        contacts: [
          { role: 'primary', name: 'Ada Example', email: 'ada@example.com', phone: '204-555-0100' },
          { role: 'secondary', name: 'Ben Example', email: null, phone: '(204) 555-0101' },
        ],
        address: '1 Example Way, Winnipeg, MB',
        notes: null,
      },
    });
  });

  it('refuses a client with no name, a primary contact who can\'t be reached, or a bad email or phone, naming each', () => {
    const r = checkNewCustomer(form({ name: ' ', primary: { name: 'Ada', email: '', phone: '' } }));
    expect(r).toEqual({
      ok: false,
      reason: 'The client needs a name (the household, for example "Ada & Ben Example"). The primary contact needs an email or a phone number, so they can be reached.',
    });
    expect(checkNewCustomer(form({ primary: { name: 'Ada', email: 'ada-at-example', phone: '12' } }))).toEqual({
      ok: false,
      reason: '"ada-at-example" isn\'t an email address. "12" isn\'t a phone number.',
    });
    expect(checkNewCustomer(form({ secondary: { name: '', email: 'ben@example.com', phone: '' } }))).toEqual({ ok: false, reason: 'The second contact needs a name.' });
  });

  it('reports a database row in the wrong shape instead of dropping it', () => {
    const good = { id: '11111111-1111-4111-8111-111111111111', name: 'B', contacts: [{ role: 'primary', name: 'B', email: null, phone: '204 555 0100' }], address: null, notes: null };
    const read = readCustomerRows([good, { id: 'x', name: '', contacts: [] }]);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason).toMatch(/^Client 2 in the database isn't in the expected shape/);
    expect(readCustomerRows([good])).toEqual({ ok: true, value: [good] });
  });
});
