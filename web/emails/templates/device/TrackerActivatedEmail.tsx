import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { DeviceEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function TrackerActivatedEmail(p: DeviceEmailPayload) {
  return (
    <EmailLayout preview="Your RooGPS tracker is activated">
      <Text style={heading}>Your tracker is activated</Text>
      <Text style={paragraph}>
        Hello, your RooGPS tracker has been successfully activated and is ready to use.
      </Text>
      <EmailInfoCard title="Device details">
        {p.deviceName ? <Text style={line}><strong>Name</strong> {p.deviceName}</Text> : null}
        {p.deviceId ? <Text style={line}><strong>Device ID</strong> {p.deviceId}</Text> : null}
      </EmailInfoCard>
      <EmailButton href={`${appBaseUrl}/track`}>Open dashboard</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
