/**
 * Email system tests: event names, mock payloads, idempotency key behaviour.
 * Run from web: npx ts-node -P tsconfig.test.json lib/email/__tests__/email.test.ts
 * Or: npm run test (if configured to run this file)
 */

import { EMAIL_EVENTS, type EmailEventName, type TicketEmailPayload, type OrderEmailPayload } from '../emailEvents';
import { MOCK_PAYLOADS, getMockPayload } from '../mockPayloads';

// Idempotency key logic (mirrors dispatcher) for testing without importing full dispatcher
function getIdempotencyKey(eventName: EmailEventName, p: Record<string, unknown>): string {
  const key = p.idempotencyKey;
  if (typeof key === 'string') return key;
  if (typeof (p as { ticketId?: string }).ticketId === 'string')
    return `${eventName}:${(p as { ticketId: string }).ticketId}`;
  if (typeof (p as { orderId?: string }).orderId === 'string')
    return `${eventName}:${(p as { orderId: string }).orderId}`;
  return `${eventName}:${(p as { recipientEmail?: string }).recipientEmail}:${Date.now()}`;
}

function run() {
  let passed = 0;
  let failed = 0;
  function ok(cond: boolean, msg: string) {
    if (cond) {
      passed++;
      console.log('  OK:', msg);
    } else {
      failed++;
      console.error('  FAIL:', msg);
    }
  }

  console.log('Email events and payloads\n');

  const eventNames = Object.values(EMAIL_EVENTS) as EmailEventName[];
  ok(eventNames.length >= 20, `EMAIL_EVENTS has at least 20 events (got ${eventNames.length})`);
  ok(eventNames.every((e) => typeof e === 'string' && e.includes('.')), 'all event names are dot-separated strings');
  ok(EMAIL_EVENTS.TICKET_CREATED_CUSTOMER === 'ticket.created.customer', 'ticket.created.customer present');
  ok(EMAIL_EVENTS.ORDER_CONFIRMATION === 'order.confirmation', 'order.confirmation present');
  ok(EMAIL_EVENTS.BILLING_PAYMENT_SUCCESS === 'billing.payment_success', 'billing.payment_success present');

  console.log('\nIdempotency key\n');
  const ticketPayload: TicketEmailPayload = {
    ticketId: '1',
    ticketNumber: '#1',
    subject: 'Test',
    status: 'open',
    recipientEmail: 'user@example.com',
  };
  ok(
    getIdempotencyKey(EMAIL_EVENTS.TICKET_CREATED_CUSTOMER, ticketPayload) === 'ticket.created.customer:1',
    'idempotency key for ticket uses event and ticketId'
  );
  const orderPayload: OrderEmailPayload = {
    orderId: 'o1',
    orderNumber: 'ORD-1',
    recipientEmail: 'customer@example.com',
  };
  ok(
    getIdempotencyKey(EMAIL_EVENTS.ORDER_CONFIRMATION, orderPayload) === 'order.confirmation:o1',
    'idempotency key for order uses event and orderId'
  );
  const withKey = { ...ticketPayload, idempotencyKey: 'custom-key' };
  ok(
    getIdempotencyKey(EMAIL_EVENTS.TICKET_REPLY_CUSTOMER, withKey) === 'custom-key',
    'idempotency key from payload is used when provided'
  );

  console.log('\nMock payloads\n');
  ok(
    eventNames.every((e) => MOCK_PAYLOADS[e] && (MOCK_PAYLOADS[e] as { recipientEmail?: string }).recipientEmail),
    'every mock payload has recipientEmail'
  );
  const ticketMock = getMockPayload(EMAIL_EVENTS.TICKET_REPLY_CUSTOMER) as TicketEmailPayload;
  ok(ticketMock.ticketId !== undefined && ticketMock.replyPreview !== undefined, 'ticket mock has ticketId and replyPreview');
  const orderMock = getMockPayload(EMAIL_EVENTS.ORDER_CONFIRMATION) as OrderEmailPayload;
  ok(orderMock.orderNumber !== undefined && orderMock.orderId !== undefined, 'order mock has orderNumber and orderId');

  console.log('\n---');
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
