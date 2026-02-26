/**
 * User group / role system.
 * Default for new signups is Customer.
 * Hierarchy: Customer < Staff < StaffPlus < Administrator
 */
export const USER_ROLES = [
  'customer',
  'staff',
  'staff_plus',
  'administrator',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_ROLE: UserRole = 'customer';

/** Role hierarchy level (higher = more privileged) */
const ROLE_LEVEL: Record<UserRole, number> = {
  customer: 0,
  staff: 1,
  staff_plus: 2,
  administrator: 3,
};

export function roleLevel(role: UserRole | null | undefined): number {
  if (!role || !(role in ROLE_LEVEL)) return 0;
  return ROLE_LEVEL[role as UserRole];
}

/** True if userRole has at least the privilege of minRole */
export function hasMinRole(userRole: UserRole | null | undefined, minRole: UserRole): boolean {
  return roleLevel(userRole) >= roleLevel(minRole);
}

export function isStaffOrAbove(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}

export function isStaffPlusOrAbove(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff_plus');
}

export function isAdministrator(role: UserRole | null | undefined): boolean {
  return role === 'administrator';
}

/** Display label for admin UI */
export function roleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    customer: 'Customer',
    staff: 'Staff',
    staff_plus: 'StaffPlus',
    administrator: 'Administrator',
  };
  return labels[role] ?? role;
}
