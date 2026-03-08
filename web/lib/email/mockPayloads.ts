/**
 * Mock payloads for email template preview and tests.
 * Keys match EMAIL_EVENTS values.
 */
import type { EmailEventName, EmailPayload } from './emailEvents';
import { EMAIL_EVENTS } from './emailEvents';

const BASE_URL = process.env.APP_BASE_URL ?? 'https://roogps.com';

const ticketBase = {
  ticketId: 'tkt-123',
  ticketNumber: 'RTS-0042',
  subject: 'Tracker not updating location',
  status: 'open',
  priority: 'high',
  category: 'technical',
  replyPreview: 'The device was working until yesterday. I have tried restarting it.',
  recipientEmail: 'customer@example.com',
  recipientName: 'Jane Customer',
};

export const MOCK_PAYLOADS: Record<EmailEventName, EmailPayload> = {
  [EMAIL_EVENTS.TICKET_CREATED_CUSTOMER]: { ...ticketBase },
  [EMAIL_EVENTS.TICKET_CREATED_STAFF]: { ...ticketBase, recipientEmail: 'staff@roogps.com' },
  [EMAIL_EVENTS.TICKET_REPLY_CUSTOMER]: { ...ticketBase },
  [EMAIL_EVENTS.TICKET_REPLY_STAFF]: { ...ticketBase, recipientEmail: 'support@roogps.com' },
  [EMAIL_EVENTS.TICKET_ASSIGNED_STAFF]: { ...ticketBase, recipientEmail: 'agent@roogps.com', assigneeEmail: 'agent@roogps.com', assigneeName: 'Alex Agent' },
  [EMAIL_EVENTS.TICKET_STATUS_CHANGED_CUSTOMER]: { ...ticketBase, newStatus: 'answered', changedBy: 'Support' },
  [EMAIL_EVENTS.TICKET_CLOSED_CUSTOMER]: { ...ticketBase, status: 'closed' },
  [EMAIL_EVENTS.TICKET_CLOSED_STAFF]: { ...ticketBase, recipientEmail: 'staff@roogps.com', status: 'closed' },
  [EMAIL_EVENTS.TICKET_REOPENED_CUSTOMER]: { ...ticketBase, status: 'open' },
  [EMAIL_EVENTS.TICKET_ESCALATED_STAFF]: { ...ticketBase, recipientEmail: 'manager@roogps.com' },
  [EMAIL_EVENTS.TICKET_MENTIONED_STAFF]: { ...ticketBase, recipientEmail: 'agent@roogps.com' },

  [EMAIL_EVENTS.ORDER_CONFIRMATION]: {
    orderId: 'ord-456',
    orderNumber: 'ROO-7890',
    recipientEmail: 'customer@example.com',
    recipientName: 'Jane Customer',
    productName: 'GPS Tracker + SIM Monthly',
    orderDate: new Date().toISOString(),
    totalCents: 19900,
    currency: 'AUD',
  },
  [EMAIL_EVENTS.ORDER_SHIPPED]: {
    orderId: 'ord-456',
    orderNumber: 'ROO-7890',
    recipientEmail: 'customer@example.com',
    productName: 'GPS Tracker',
    trackingNumber: 'AU123456789',
    shippingStatus: 'In transit',
  },
  [EMAIL_EVENTS.ORDER_DELIVERED]: {
    orderId: 'ord-456',
    orderNumber: 'ROO-7890',
    recipientEmail: 'customer@example.com',
    productName: 'GPS Tracker',
    shippingStatus: 'Delivered',
  },

  [EMAIL_EVENTS.BILLING_SUBSCRIPTION_STARTED]: {
    recipientEmail: 'customer@example.com',
    planName: 'SIM Monthly',
    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    billingPeriod: 'month',
  },
  [EMAIL_EVENTS.BILLING_TRIAL_STARTED]: {
    recipientEmail: 'customer@example.com',
    planName: 'SIM Monthly',
    trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    billingPeriod: 'month',
  },
  [EMAIL_EVENTS.BILLING_TRIAL_ENDING]: {
    recipientEmail: 'customer@example.com',
    planName: 'SIM subscription',
    trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  [EMAIL_EVENTS.BILLING_PAYMENT_SUCCESS]: {
    recipientEmail: 'customer@example.com',
    planName: 'SIM Monthly',
    amountCents: 999,
    currency: 'AUD',
    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  [EMAIL_EVENTS.BILLING_PAYMENT_FAILED]: {
    recipientEmail: 'customer@example.com',
    planName: 'SIM subscription',
  },

  [EMAIL_EVENTS.ACCOUNT_CREATED]: {
    recipientEmail: 'newuser@example.com',
    recipientName: 'New User',
  },
  [EMAIL_EVENTS.ACCOUNT_PASSWORD_RESET]: {
    recipientEmail: 'user@example.com',
    resetLink: `${BASE_URL}/auth/reset-password?token=sample-token`,
  },
  [EMAIL_EVENTS.ACCOUNT_EMAIL_VERIFICATION]: {
    recipientEmail: 'user@example.com',
    verificationLink: `${BASE_URL}/auth/verify?token=sample-verify`,
  },

  [EMAIL_EVENTS.DEVICE_TRACKER_ACTIVATED]: {
    recipientEmail: 'customer@example.com',
    deviceId: '123456789012345',
    deviceName: 'GPS Tracker Wired',
  },
  [EMAIL_EVENTS.DEVICE_TRACKER_OFFLINE]: {
    recipientEmail: 'customer@example.com',
    deviceId: '123456789012345',
    deviceName: 'My Tracker',
    lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
};

export function getMockPayload(eventName: EmailEventName): EmailPayload {
  return MOCK_PAYLOADS[eventName] ?? MOCK_PAYLOADS[EMAIL_EVENTS.TICKET_CREATED_CUSTOMER];
}
