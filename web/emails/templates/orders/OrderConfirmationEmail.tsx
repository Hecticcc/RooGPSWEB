import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { OrderEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function OrderConfirmationEmail(p: OrderEmailPayload) {
  const orderUrl = `${appBaseUrl}/account/orders/${p.orderId}`;
  const total = p.totalCents != null && p.currency
    ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: p.currency }).format(p.totalCents / 100)
    : null;
  return (
    <EmailLayout preview={`Order ${p.orderNumber} confirmed`}>
      <Text style={heading}>Thanks for your order — RooGPS</Text>
      <Text style={paragraph}>
        Hello{p.recipientName ? ` ${p.recipientName}` : ''}, we've received your order and will process it shortly.
      </Text>
      <EmailInfoCard title="Order details">
        <Text style={line}><strong>Order #</strong> {p.orderNumber}</Text>
        {p.productName ? <Text style={line}><strong>Product</strong> {p.productName}</Text> : null}
        {p.orderDate ? <Text style={line}><strong>Date</strong> {p.orderDate}</Text> : null}
        {total ? <Text style={line}><strong>Total</strong> {total}</Text> : null}
      </EmailInfoCard>
      <EmailButton href={orderUrl}>View order</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
