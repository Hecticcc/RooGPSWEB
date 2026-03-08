import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { TicketEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function TicketStatusChangedCustomerEmail(p: TicketEmailPayload) {
  const ticketUrl = `${appBaseUrl}/account/support/${p.ticketId}`;
  return (
    <EmailLayout preview={`Ticket #${p.ticketNumber} status updated`}>
      <Text style={heading}>Support ticket status updated</Text>
      <Text style={paragraph}>
        Hello{p.recipientName ? ` ${p.recipientName}` : ''}, the status of your support ticket has been updated to <strong>{p.newStatus ?? p.status}</strong>.
      </Text>
      <EmailInfoCard title="Ticket details">
        <Text style={line}><strong>Ticket #</strong> {p.ticketNumber}</Text>
        <Text style={line}><strong>Subject</strong> {p.subject}</Text>
        <Text style={line}><strong>Status</strong> {p.newStatus ?? p.status}</Text>
      </EmailInfoCard>
      <EmailButton href={ticketUrl}>View ticket</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
