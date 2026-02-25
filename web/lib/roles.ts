/**
 * User group / role system.
 * Default for new signups is Customer.
 */
export const USER_ROLES = [
  'customer',
  'staff',
  'staff_plus',
  'administrator',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_ROLE: UserRole = 'customer';

export function isStaffOrAbove(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return role === 'staff' || role === 'staff_plus' || role === 'administrator';
}

export function isAdministrator(role: UserRole | null | undefined): boolean {
  return role === 'administrator';
}
