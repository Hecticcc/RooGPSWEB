import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailButton } from '../../components/EmailButton';
import type { AccountEmailPayload } from '@/lib/email/emailEvents';

export default function EmailVerificationEmail(p: AccountEmailPayload) {
  const href = p.verificationLink ?? '#';
  return (
    <EmailLayout preview="Verify your email — RooGPS">
      <Text style={heading}>Verify your email</Text>
      <Text style={paragraph}>
        Hello{p.recipientName ? ` ${p.recipientName}` : ''}, please verify your email address by clicking the button below.
      </Text>
      <EmailButton href={href}>Verify email</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
