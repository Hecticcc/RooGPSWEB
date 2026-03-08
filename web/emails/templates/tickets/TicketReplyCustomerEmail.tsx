import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { TicketEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function TicketReplyCustomerEmail(p: TicketEmailPayload) {
  const ticketUrl = `${appBaseUrl}/account/support/${p.ticketId}`;
  return (
    <EmailLayout preview={`New reply on ticket #${p.ticketNumber}`}>
      <Text style={heading}>New reply on your support ticket</Text>
      <Text style={paragraph}>
        Hello{p.recipientName ? ` ${p.recipientName}` : ''}, there is a new reply on your RooGPS support ticket.
      </Text>
      <EmailInfoCard title="Ticket details">
        <Text style={line}><strong>Ticket #</strong> {p.ticketNumber}</Text>
        <Text style={line}><strong>Subject</strong> {p.subject}</Text>
        <Text style={line}><strong>Status</strong> {p.status}</Text>
        {p.replyPreview ? (
          <Text style={replyPreview}>{p.replyPreview.slice(0, 300)}{p.replyPreview.length > 300 ? '…' : ''}</Text>
        ) : null}
      </EmailInfoCard>
      <EmailButton href={ticketUrl}>View ticket</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
const replyPreview = { fontSize: '13px', color: '#71717a', margin: '12px 0 0 0', fontStyle: 'italic' as const };
