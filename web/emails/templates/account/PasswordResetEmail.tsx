import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailButton } from '../../components/EmailButton';
import type { AccountEmailPayload } from '@/lib/email/emailEvents';

export default function PasswordResetEmail(p: AccountEmailPayload) {
  const href = p.resetLink ?? '#';
  return (
    <EmailLayout preview="Reset your RooGPS password">
      <Text style={heading}>Reset your password</Text>
      <Text style={paragraph}>
        Hello{p.recipientName ? ` ${p.recipientName}` : ''}, we received a request to reset your RooGPS password. Click the button below to set a new password.
      </Text>
      <Text style={paragraph}>This link will expire in 1 hour. If you didn't request this, you can ignore this email.</Text>
      <EmailButton href={href}>Reset password</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
