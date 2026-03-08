import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { BillingEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function TrialStartedEmail(p: BillingEmailPayload) {
  return (
    <EmailLayout preview="Your RooGPS trial has started">
      <Text style={heading}>Your RooGPS trial has started</Text>
      <Text style={paragraph}>
        Hello{p.recipientName ? ` ${p.recipientName}` : ''}, your free trial is now active. You won't be charged until the trial ends.
      </Text>
      <EmailInfoCard title="Trial details">
        {p.trialEndsAt ? <Text style={line}><strong>Trial ends</strong> {p.trialEndsAt}</Text> : null}
        {p.planName ? <Text style={line}><strong>Plan</strong> {p.planName}</Text> : null}
      </EmailInfoCard>
      <Text style={paragraph}>Cancel anytime before the trial ends if you don't wish to continue.</Text>
      <EmailButton href={`${appBaseUrl}/account/subscription`}>View subscription</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
