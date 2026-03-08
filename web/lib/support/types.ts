/**
 * Support ticket system – shared types.
 * Enums align with Postgres support_* enums.
 */

export const SUPPORT_TICKET_STATUSES = [
  'open',
  'answered',
  'pending',
  'in_progress',
  'resolved',
  'closed',
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const SUPPORT_TICKET_SOURCES = ['dashboard', 'email', 'system', 'api'] as const;
export type SupportTicketSource = (typeof SUPPORT_TICKET_SOURCES)[number];

export const SUPPORT_MESSAGE_SENDER_TYPES = ['customer', 'staff', 'system'] as const;
export type SupportMessageSenderType = (typeof SUPPORT_MESSAGE_SENDER_TYPES)[number];

export const SUPPORT_CATEGORIES = [
  'general',
  'billing',
  'device',
  'tracking',
  'subscription',
  'order',
  'technical',
  'other',
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  category: string;
  source: SupportTicketSource;
  assigned_to: string | null;
  linked_device_id: string | null;
  linked_order_id: string | null;
  created_at: string;
  updated_at: string;
  last_reply_at: string | null;
  last_customer_reply_at: string | null;
  last_staff_reply_at: string | null;
  closed_at: string | null;
  resolved_at: string | null;
  reopened_at: string | null;
  closed_by: string | null;
  allow_customer_close: boolean;
  allow_customer_reopen: boolean;
  reopen_window_hours: number;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_type: SupportMessageSenderType;
  sender_user_id: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
  edited_at: string | null;
}

export interface SupportTicketAttachment {
  id: string;
  ticket_id: string;
  message_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface SupportTicketActivity {
  id: string;
  ticket_id: string;
  action: string;
  actor_user_id: string | null;
  message_id: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface SupportTicketTag {
  id: string;
  name: string;
  color: string | null;
}

export interface SupportSavedReply {
  id: string;
  created_by: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export const SUPPORT_TICKET_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: 'Open',
  answered: 'Answered',
  pending: 'Pending',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** CSS background + text colour for status badges (use with support-status-badge class). */
export const SUPPORT_TICKET_STATUS_COLORS: Record<SupportTicketStatus, { bg: string; color: string }> = {
  open: { bg: 'rgba(34, 197, 94, 0.18)', color: 'var(--success)' },
  answered: { bg: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa' },
  pending: { bg: 'rgba(234, 179, 8, 0.2)', color: '#eab308' },
  in_progress: { bg: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' },
  resolved: { bg: 'rgba(34, 197, 94, 0.12)', color: 'var(--success)' },
  closed: { bg: 'rgba(113, 113, 122, 0.2)', color: 'var(--muted)' },
};

export const SUPPORT_TICKET_PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  general: 'General',
  billing: 'Billing',
  device: 'Device',
  tracking: 'Tracking',
  subscription: 'Subscription',
  order: 'Order',
  technical: 'Technical',
  other: 'Other',
};

/** Colour-coded department/category badges for admin list. */
export const SUPPORT_CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  general: { bg: 'rgba(113, 113, 122, 0.2)', color: 'var(--muted)' },
  billing: { bg: 'rgba(34, 197, 94, 0.18)', color: 'var(--success)' },
  device: { bg: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' },
  tracking: { bg: 'rgba(168, 85, 247, 0.2)', color: '#a855f7' },
  subscription: { bg: 'rgba(249, 115, 22, 0.2)', color: 'var(--accent)' },
  order: { bg: 'rgba(234, 179, 8, 0.2)', color: '#eab308' },
  technical: { bg: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4' },
  other: { bg: 'rgba(113, 113, 122, 0.15)', color: 'var(--muted)' },
};
