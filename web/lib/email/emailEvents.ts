/**
 * Transactional email event names and payload types.
 * Used by the dispatcher to select templates and enforce idempotency.
 */

export const EMAIL_EVENTS = {
  // Tickets
  TICKET_CREATED_CUSTOMER: 'ticket.created.customer',
  TICKET_CREATED_STAFF: 'ticket.created.staff',
  TICKET_REPLY_CUSTOMER: 'ticket.reply.customer',
  TICKET_REPLY_STAFF: 'ticket.reply.staff',
  TICKET_ASSIGNED_STAFF: 'ticket.assigned.staff',
  TICKET_STATUS_CHANGED_CUSTOMER: 'ticket.status_changed.customer',
  TICKET_CLOSED_CUSTOMER: 'ticket.closed.customer',
  TICKET_CLOSED_STAFF: 'ticket.closed.staff',
  TICKET_REOPENED_CUSTOMER: 'ticket.reopened.customer',
  TICKET_ESCALATED_STAFF: 'ticket.escalated.staff',
  TICKET_MENTIONED_STAFF: 'ticket.mentioned.staff',
  // Orders
  ORDER_CONFIRMATION: 'order.confirmation',
  ORDER_SHIPPED: 'order.shipped',
  ORDER_DELIVERED: 'order.delivered',
  // Billing
  BILLING_SUBSCRIPTION_STARTED: 'billing.subscription_started',
  BILLING_TRIAL_STARTED: 'billing.trial_started',
  BILLING_TRIAL_ENDING: 'billing.trial_ending',
  BILLING_PAYMENT_SUCCESS: 'billing.payment_success',
  BILLING_PAYMENT_FAILED: 'billing.payment_failed',
  // Account
  ACCOUNT_CREATED: 'account.created',
  ACCOUNT_PASSWORD_RESET: 'account.password_reset',
  ACCOUNT_EMAIL_VERIFICATION: 'account.email_verification',
  // Device
  DEVICE_TRACKER_ACTIVATED: 'device.tracker_activated',
  DEVICE_TRACKER_OFFLINE: 'device.tracker_offline',
} as const;

export type EmailEventName = (typeof EMAIL_EVENTS)[keyof typeof EMAIL_EVENTS];

/** Base: every event can have an idempotency key to prevent duplicate sends. */
export type BaseEmailPayload = {
  idempotencyKey?: string;
};

export type TicketEmailPayload = BaseEmailPayload & {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority?: string;
  category?: string;
  replyPreview?: string;
  recipientEmail: string;
  recipientName?: string;
  assigneeEmail?: string;
  assigneeName?: string;
  changedBy?: string;
  newStatus?: string;
};

export type OrderEmailPayload = BaseEmailPayload & {
  orderId: string;
  orderNumber: string;
  recipientEmail: string;
  recipientName?: string;
  productName?: string;
  orderDate?: string;
  shippingStatus?: string;
  trackingNumber?: string;
  totalCents?: number;
  currency?: string;
};

export type BillingEmailPayload = BaseEmailPayload & {
  recipientEmail: string;
  recipientName?: string;
  planName?: string;
  amountCents?: number;
  currency?: string;
  billingPeriod?: 'month' | 'year';
  nextBillingDate?: string;
  invoiceUrl?: string;
  trialEndsAt?: string;
};

export type AccountEmailPayload = BaseEmailPayload & {
  recipientEmail: string;
  recipientName?: string;
  resetLink?: string;
  verificationLink?: string;
};

export type DeviceEmailPayload = BaseEmailPayload & {
  recipientEmail: string;
  deviceName?: string;
  deviceId?: string;
  lastSeenAt?: string;
  lastLocation?: string;
};

export type EmailPayload =
  | TicketEmailPayload
  | OrderEmailPayload
  | BillingEmailPayload
  | AccountEmailPayload
  | DeviceEmailPayload;
