import { describe, expect, it } from 'vitest';
import { can, PREVIEW_USER, type User } from '../permissions/can';

const user = (roles: string[]): User => ({ id: 'u', name: 'U', roles, mocked: false });

describe('can()', () => {
  it('grants what the role data grants', () => {
    expect(can(user(['designer']), 'room.edit')).toBe(true);
    expect(can(PREVIEW_USER, 'room.view')).toBe(true);
  });
  it('fails closed for unknown roles and no roles', () => {
    expect(can(user(['visitor']), 'room.view')).toBe(false);
    expect(can(user([]), 'room.view')).toBe(false);
    expect(can(user(['toString']), 'room.view')).toBe(false);
  });
  it('labels the preview user as mocked', () => {
    expect(PREVIEW_USER.mocked).toBe(true);
    expect(PREVIEW_USER.name).toMatch(/mocked/i);
  });
});
