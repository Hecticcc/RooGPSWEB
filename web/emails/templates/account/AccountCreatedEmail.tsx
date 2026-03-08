import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailButton } from '../../components/EmailButton';
import type { AccountEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function AccountCreatedEmail(p: AccountEmailPayload) {
  return (
    <EmailLayout preview="Welcome to RooGPS">
      <Text style={heading}>Welcome to RooGPS</Text>
      <Text style={paragraph}>
        Hello{p.recipientName ? ` ${p.recipientName}` : ''}, your account has been created. You can now sign in and set up your tracker.
      </Text>
      <EmailButton href={`${appBaseUrl}/track`}>Go to dashboard</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
