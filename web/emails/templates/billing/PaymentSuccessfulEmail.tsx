import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { BillingEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function PaymentSuccessfulEmail(p: BillingEmailPayload) {
  const amount = p.amountCents != null && p.currency
    ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: p.currency }).format(p.amountCents / 100)
    : null;
  return (
    <EmailLayout preview="Payment received — RooGPS">
      <Text style={heading}>Payment received — RooGPS</Text>
      <Text style={paragraph}>
        Hello{p.recipientName ? ` ${p.recipientName}` : ''}, we've received your payment.
      </Text>
      <EmailInfoCard title="Payment details">
        {amount ? <Text style={line}><strong>Amount</strong> {amount}</Text> : null}
        {p.nextBillingDate ? <Text style={line}><strong>Next billing date</strong> {p.nextBillingDate}</Text> : null}
      </EmailInfoCard>
      {p.invoiceUrl ? (
        <EmailButton href={p.invoiceUrl}>View invoice</EmailButton>
      ) : (
        <EmailButton href={`${appBaseUrl}/account/subscription`}>View subscription</EmailButton>
      )}
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
