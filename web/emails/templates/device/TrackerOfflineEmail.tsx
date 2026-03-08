import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../components/EmailLayout';
import { EmailInfoCard } from '../../components/EmailInfoCard';
import { EmailButton } from '../../components/EmailButton';
import type { DeviceEmailPayload } from '@/lib/email/emailEvents';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export default function TrackerOfflineEmail(p: DeviceEmailPayload) {
  return (
    <EmailLayout preview="Tracker offline — RooGPS">
      <Text style={heading}>Tracker offline</Text>
      <Text style={paragraph}>
        Your RooGPS tracker appears to be offline. This may be due to low battery, poor signal, or the device being powered off.
      </Text>
      <EmailInfoCard title="Device details">
        {p.deviceName ? <Text style={line}><strong>Tracker</strong> {p.deviceName}</Text> : null}
        {p.deviceId ? <Text style={line}><strong>Device ID</strong> {p.deviceId}</Text> : null}
        {p.lastSeenAt ? <Text style={line}><strong>Last seen</strong> {p.lastSeenAt}</Text> : null}
        {p.lastLocation ? <Text style={line}><strong>Last location</strong> {p.lastLocation}</Text> : null}
      </EmailInfoCard>
      <EmailButton href={`${appBaseUrl}/track`}>View dashboard</EmailButton>
    </EmailLayout>
  );
}

const heading = { fontSize: '18px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' };
const paragraph = { fontSize: '14px', color: '#3f3f46', margin: '0 0 16px 0', lineHeight: 1.5 };
const line = { fontSize: '14px', color: '#3f3f46', margin: '0 0 8px 0' };
