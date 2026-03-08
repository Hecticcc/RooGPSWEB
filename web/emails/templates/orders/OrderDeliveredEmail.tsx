import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { OrderEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function OrderDeliveredEmail(p: OrderEmailPayload) {
  const orderUrl = `${appBaseUrl}/account/orders/${p.orderId}`;
  return (
    <EmailLayout preview={`Your RooGPS tracker has arrived`}>
      <Text style={heading}>Your RooGPS tracker has arrived</Text>
      <Text style={paragraph}>
        Hello{p.recipientName ? ` ${p.recipientName}` : ''}, your order has been delivered.
      </Text>
      <EmailInfoCard title="Order details">
        <Text style={line}><strong>Order #</strong> {p.orderNumber}</Text>
        {p.trackingNumber ? <Text style={line}><strong>Tracking</strong> {p.trackingNumber}</Text> : null}
      </EmailInfoCard>
      <Text style={paragraph}>Activate your tracker in the dashboard when you're ready.</Text>
      <EmailButton href={orderUrl}>View order</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
