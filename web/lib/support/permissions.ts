/**
 * Support ticket system – permission helpers.
 * Uses existing user_roles: customer, staff, staff_plus, administrator.
 * support_agent => staff, support_manager => staff_plus, admin => administrator.
 */

import type { UserRole } from '@/lib/roles';
import { hasMinRole } from '@/lib/roles';

export function canAccessSupportStaffWorkspace(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}

export function canAssignTicketsToOthers(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff_plus');
}

export function canManageSavedReplies(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}

export function canBulkUpdateTickets(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}

export function canAddInternalNotes(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}

export function canChangeTicketStatus(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}

export function canChangeTicketPriority(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}

export function canAssignTicket(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}

export function canManageTags(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}

export function canViewAllTickets(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}

export function canViewActivityAudit(role: UserRole | null | undefined): boolean {
  return hasMinRole(role, 'staff');
}
