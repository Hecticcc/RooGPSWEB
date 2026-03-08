import React from 'react';
import { render } from '@react-email/render';
import { sendEmail } from './sendEmail';
import { wasEmailSent, recordEmailSent } from './idempotency';
import {
  EMAIL_EVENTS,
  type EmailEventName,
  type EmailPayload,
  type TicketEmailPayload,
  type OrderEmailPayload,
  type BillingEmailPayload,
  type AccountEmailPayload,
  type DeviceEmailPayload,
} from './emailEvents';

// Ticket templates
import TicketCreatedCustomerEmail from '@/emails/templates/tickets/TicketCreatedCustomerEmail';
import TicketCreatedStaffEmail from '@/emails/templates/tickets/TicketCreatedStaffEmail';
import TicketReplyCustomerEmail from '@/emails/templates/tickets/TicketReplyCustomerEmail';
import TicketReplyStaffEmail from '@/emails/templates/tickets/TicketReplyStaffEmail';
import TicketAssignedStaffEmail from '@/emails/templates/tickets/TicketAssignedStaffEmail';
import TicketStatusChangedCustomerEmail from '@/emails/templates/tickets/TicketStatusChangedCustomerEmail';
import TicketClosedCustomerEmail from '@/emails/templates/tickets/TicketClosedCustomerEmail';
import TicketClosedStaffEmail from '@/emails/templates/tickets/TicketClosedStaffEmail';
import TicketReopenedCustomerEmail from '@/emails/templates/tickets/TicketReopenedCustomerEmail';
import TicketEscalatedStaffEmail from '@/emails/templates/tickets/TicketEscalatedStaffEmail';
import TicketMentionedStaffEmail from '@/emails/templates/tickets/TicketMentionedStaffEmail';
// Order templates
import OrderConfirmationEmail from '@/emails/templates/orders/OrderConfirmationEmail';
import OrderShippedEmail from '@/emails/templates/orders/OrderShippedEmail';
import OrderDeliveredEmail from '@/emails/templates/orders/OrderDeliveredEmail';
// Billing templates
import SubscriptionStartedEmail from '@/emails/templates/billing/SubscriptionStartedEmail';
import TrialStartedEmail from '@/emails/templates/billing/TrialStartedEmail';
import TrialEndingReminderEmail from '@/emails/templates/billing/TrialEndingReminderEmail';
import PaymentSuccessfulEmail from '@/emails/templates/billing/PaymentSuccessfulEmail';
import PaymentFailedEmail from '@/emails/templates/billing/PaymentFailedEmail';
// Account templates
import AccountCreatedEmail from '@/emails/templates/account/AccountCreatedEmail';
import PasswordResetEmail from '@/emails/templates/account/PasswordResetEmail';
import EmailVerificationEmail from '@/emails/templates/account/EmailVerificationEmail';
// Device templates
import TrackerActivatedEmail from '@/emails/templates/device/TrackerActivatedEmail';
import TrackerOfflineEmail from '@/emails/templates/device/TrackerOfflineEmail';

type TemplateMeta = {
  subject: string;
  tag: string;
  getTo: (p: EmailPayload) => string;
};

const SUBJECTS: Record<EmailEventName, string> = {
  [EMAIL_EVENTS.TICKET_CREATED_CUSTOMER]: 'We received your support request — RooGPS',
  [EMAIL_EVENTS.TICKET_CREATED_STAFF]: 'New support ticket submitted',
  [EMAIL_EVENTS.TICKET_REPLY_CUSTOMER]: 'New reply on your RooGPS support ticket',
  [EMAIL_EVENTS.TICKET_REPLY_STAFF]: 'Customer replied to ticket',
  [EMAIL_EVENTS.TICKET_ASSIGNED_STAFF]: 'Ticket assigned to you',
  [EMAIL_EVENTS.TICKET_STATUS_CHANGED_CUSTOMER]: 'Support ticket status updated',
  [EMAIL_EVENTS.TICKET_CLOSED_CUSTOMER]: 'Support ticket closed',
  [EMAIL_EVENTS.TICKET_CLOSED_STAFF]: 'Support ticket closed',
  [EMAIL_EVENTS.TICKET_REOPENED_CUSTOMER]: 'Support ticket reopened',
  [EMAIL_EVENTS.TICKET_ESCALATED_STAFF]: 'Ticket escalated',
  [EMAIL_EVENTS.TICKET_MENTIONED_STAFF]: 'You were mentioned on a support ticket',
  [EMAIL_EVENTS.ORDER_CONFIRMATION]: 'Thanks for your order — RooGPS',
  [EMAIL_EVENTS.ORDER_SHIPPED]: 'Your RooGPS tracker has shipped',
  [EMAIL_EVENTS.ORDER_DELIVERED]: 'Your RooGPS tracker has arrived',
  [EMAIL_EVENTS.BILLING_SUBSCRIPTION_STARTED]: 'Your RooGPS subscription has started',
  [EMAIL_EVENTS.BILLING_TRIAL_STARTED]: 'Your RooGPS trial has started',
  [EMAIL_EVENTS.BILLING_TRIAL_ENDING]: 'Your RooGPS trial ends soon',
  [EMAIL_EVENTS.BILLING_PAYMENT_SUCCESS]: 'Payment received — RooGPS',
  [EMAIL_EVENTS.BILLING_PAYMENT_FAILED]: 'Payment failed — action required',
  [EMAIL_EVENTS.ACCOUNT_CREATED]: 'Welcome to RooGPS',
  [EMAIL_EVENTS.ACCOUNT_PASSWORD_RESET]: 'Reset your RooGPS password',
  [EMAIL_EVENTS.ACCOUNT_EMAIL_VERIFICATION]: 'Verify your email — RooGPS',
  [EMAIL_EVENTS.DEVICE_TRACKER_ACTIVATED]: 'Your RooGPS tracker is activated',
  [EMAIL_EVENTS.DEVICE_TRACKER_OFFLINE]: 'Tracker offline — RooGPS',
};

export function getTo(p: EmailPayload): string {
  if ('recipientEmail' in p && (p as { recipientEmail?: string }).recipientEmail)
    return (p as { recipientEmail: string }).recipientEmail;
  if ('assigneeEmail' in p && (p as { assigneeEmail?: string }).assigneeEmail)
    return (p as { assigneeEmail: string }).assigneeEmail;
  return '';
}

export function getIdempotencyKey(eventName: EmailEventName, p: EmailPayload): string {
  const key = p.idempotencyKey;
  if (key) return key;
  if ('ticketId' in p) return `${eventName}:${(p as TicketEmailPayload).ticketId}`;
  if ('orderId' in p) return `${eventName}:${(p as OrderEmailPayload).orderId}`;
  if ('recipientEmail' in p && 'resetLink' in p && (p as AccountEmailPayload).resetLink)
    return `${eventName}:${(p as AccountEmailPayload).recipientEmail}:reset`;
  if ('recipientEmail' in p && 'verificationLink' in p && (p as AccountEmailPayload).verificationLink)
    return `${eventName}:${(p as AccountEmailPayload).recipientEmail}:verify`;
  return `${eventName}:${getTo(p)}:${Date.now()}`;
}

const TEMPLATES: Record<EmailEventName, React.ComponentType<EmailPayload>> = {
  [EMAIL_EVENTS.TICKET_CREATED_CUSTOMER]: TicketCreatedCustomerEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.TICKET_CREATED_STAFF]: TicketCreatedStaffEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.TICKET_REPLY_CUSTOMER]: TicketReplyCustomerEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.TICKET_REPLY_STAFF]: TicketReplyStaffEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.TICKET_ASSIGNED_STAFF]: TicketAssignedStaffEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.TICKET_STATUS_CHANGED_CUSTOMER]: TicketStatusChangedCustomerEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.TICKET_CLOSED_CUSTOMER]: TicketClosedCustomerEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.TICKET_CLOSED_STAFF]: TicketClosedStaffEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.TICKET_REOPENED_CUSTOMER]: TicketReopenedCustomerEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.TICKET_ESCALATED_STAFF]: TicketEscalatedStaffEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.TICKET_MENTIONED_STAFF]: TicketMentionedStaffEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.ORDER_CONFIRMATION]: OrderConfirmationEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.ORDER_SHIPPED]: OrderShippedEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.ORDER_DELIVERED]: OrderDeliveredEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.BILLING_SUBSCRIPTION_STARTED]: SubscriptionStartedEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.BILLING_TRIAL_STARTED]: TrialStartedEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.BILLING_TRIAL_ENDING]: TrialEndingReminderEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.BILLING_PAYMENT_SUCCESS]: PaymentSuccessfulEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.BILLING_PAYMENT_FAILED]: PaymentFailedEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.ACCOUNT_CREATED]: AccountCreatedEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.ACCOUNT_PASSWORD_RESET]: PasswordResetEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.ACCOUNT_EMAIL_VERIFICATION]: EmailVerificationEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.DEVICE_TRACKER_ACTIVATED]: TrackerActivatedEmail as React.ComponentType<EmailPayload>,
  [EMAIL_EVENTS.DEVICE_TRACKER_OFFLINE]: TrackerOfflineEmail as React.ComponentType<EmailPayload>,
};

/**
 * Handle a transactional email event: idempotency check, render template, send via Resend.
 * Does not throw; logs errors. Safe to call from request handlers.
 */
export async function handleEmailEvent(
  eventName: EmailEventName,
  payload: EmailPayload
): Promise<{ sent: boolean; error?: string }> {
  const to = getTo(payload);
  if (!to || !to.includes('@')) {
    return { sent: false, error: 'No recipient email' };
  }

  const idempotencyKey = getIdempotencyKey(eventName, payload);
  const alreadySent = await wasEmailSent(eventName, idempotencyKey);
  if (alreadySent) {
    return { sent: false };
  }

  const Template = TEMPLATES[eventName];
  const subject = SUBJECTS[eventName];
  if (!Template || !subject) {
    return { sent: false, error: `Unknown event: ${eventName}` };
  }

  let html: string;
  try {
    html = await render(React.createElement(Template, payload));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Template render failed', { eventName, message });
    return { sent: false, error: message };
  }

  const tag = eventName.replace(/\./g, '_');
  const result = await sendEmail({
    to,
    subject,
    html,
    tags: [{ name: 'type', value: tag }],
  });

  if (result.ok) {
    await recordEmailSent(eventName, idempotencyKey, to);
    return { sent: true };
  }
  return { sent: false, error: result.error };
}

/** Fire-and-forget: schedule send without awaiting. Use when you don't want to block the request. */
export function scheduleEmailEvent(eventName: EmailEventName, payload: EmailPayload): void {
  void handleEmailEvent(eventName, payload);
}

/**
 * Render a template to HTML (for preview or testing). Does not send email.
 */
export async function renderEmailPreview(eventName: EmailEventName, payload: EmailPayload): Promise<string> {
  const Template = TEMPLATES[eventName];
  if (!Template) return `<p>Unknown event: ${eventName}</p>`;
  return render(React.createElement(Template, payload));
}
