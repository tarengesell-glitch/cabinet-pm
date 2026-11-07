/**
 * Permissions (CLAUDE.md rule 13). Every screen and action asks `can(user, permission)`.
 * Roles and their permissions are data (roles.json), never role names in code.
 * Fails closed: an unknown role or permission grants nothing.
 */
import rolesData from './roles.json';

export type Permission = 'room.view' | 'room.edit' | 'intake.view' | 'intake.answer';

export interface User {
  readonly id: string;
  readonly name: string;
  readonly roles: readonly string[];
  /** True for a stand-in user while there is no sign-in. Must be shown on screen (rule 14). */
  readonly mocked: boolean;
}

const ROLES: Readonly<Record<string, readonly string[]>> = rolesData.roles;

export function can(user: User, permission: Permission): boolean {
  return user.roles.some((role) => Object.hasOwn(ROLES, role) && (ROLES[role] ?? []).includes(permission));
}

/**
 * MOCKED: there is no sign-in yet. This stand-in user lets the room preview run.
 * Every screen that uses it says so. Replace with the signed-in user when auth exists.
 */
export const PREVIEW_USER: User = {
  id: '00000000-0000-4000-8000-00000000beef',
  name: 'Preview user (mocked, no sign-in yet)',
  roles: ['designer'],
  mocked: true,
};
