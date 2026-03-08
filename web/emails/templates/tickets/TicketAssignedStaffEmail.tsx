import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { TicketEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function TicketAssignedStaffEmail(p: TicketEmailPayload) {
  const ticketUrl = `${appBaseUrl}/admin/support/tickets/${p.ticketId}`;
  return (
    <EmailLayout preview={`Ticket #${p.ticketNumber} assigned to you`}>
      <Text style={heading}>Ticket assigned to you</Text>
      <Text style={paragraph}>
        {p.assigneeName ? `Hi ${p.assigneeName}, ` : ''}Support ticket #{p.ticketNumber} has been assigned to you.
      </Text>
      <EmailInfoCard title="Ticket details">
        <Text style={line}><strong>Ticket #</strong> {p.ticketNumber}</Text>
        <Text style={line}><strong>Subject</strong> {p.subject}</Text>
        <Text style={line}><strong>Status</strong> {p.status}</Text>
        {p.priority ? <Text style={line}><strong>Priority</strong> {p.priority}</Text> : null}
      </EmailInfoCard>
      <EmailButton href={ticketUrl}>View ticket</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
