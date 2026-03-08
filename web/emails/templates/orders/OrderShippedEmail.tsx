import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { OrderEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function OrderShippedEmail(p: OrderEmailPayload) {
  const orderUrl = `${appBaseUrl}/account/orders/${p.orderId}`;
  return (
    <EmailLayout preview={`Your RooGPS tracker has shipped`}>
      <Text style={heading}>Your RooGPS tracker has shipped</Text>
      <Text style={paragraph}>
        Hello{p.recipientName ? ` ${p.recipientName}` : ''}, your order has been shipped.
      </Text>
      <EmailInfoCard title="Shipping details">
        <Text style={line}><strong>Order #</strong> {p.orderNumber}</Text>
        {p.trackingNumber ? <Text style={line}><strong>Tracking number</strong> {p.trackingNumber}</Text> : null}
        {p.shippingStatus ? <Text style={line}><strong>Status</strong> {p.shippingStatus}</Text> : null}
      </EmailInfoCard>
      <EmailButton href={orderUrl}>View order</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
