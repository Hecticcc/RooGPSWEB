import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { TicketEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function TicketCreatedStaffEmail(p: TicketEmailPayload) {
  const ticketUrl = `${appBaseUrl}/admin/support/tickets/${p.ticketId}`;
  return (
    <EmailLayout preview={`New ticket #${p.ticketNumber}`}>
      <Text style={heading}>New support ticket submitted</Text>
      <Text style={paragraph}>A customer has opened a new support ticket.</Text>
      <EmailInfoCard title="Ticket details">
        <Text style={line}><strong>Ticket #</strong> {p.ticketNumber}</Text>
        <Text style={line}><strong>Subject</strong> {p.subject}</Text>
        <Text style={line}><strong>Status</strong> {p.status}</Text>
        {p.priority ? <Text style={line}><strong>Priority</strong> {p.priority}</Text> : null}
        {p.category ? <Text style={line}><strong>Category</strong> {p.category}</Text> : null}
        {p.replyPreview ? <Text style={line}><strong>Preview</strong> {p.replyPreview.slice(0, 200)}{p.replyPreview.length > 200 ? '…' : ''}</Text> : null}
      </EmailInfoCard>
      <EmailButton href={ticketUrl}>View ticket</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
