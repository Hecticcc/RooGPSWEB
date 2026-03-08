import * as React from 'react';
import { Section, Text, Link } from '@react-email/components';

const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, '');

export function EmailFooter() {
  return (
    <Section style={footerSection}>
      <Text style={footerText}>
        © {new Date().getFullYear()} RooGPS. Australian GPS tracking.
      </Text>
      <Text style={footerLinks}>
        <Link href={`${appBaseUrl}/track`} style={linkStyle}>Dashboard</Link>
        {' · '}
        <Link href={`${appBaseUrl}/account/support`} style={linkStyle}>Support</Link>
      </Text>
    </Section>
  );
}

const footerSection = {
  padding: '24px',
  backgroundColor: '#f4f4f5',
  borderRadius: '0 0 8px 8px',
};

const footerText = {
  margin: '0 0 4px 0',
  fontSize: '12px',
  color: '#71717a',
};

const footerLinks = {
  margin: 0,
  fontSize: '12px',
  color: '#71717a',
};

const linkStyle = {
  color: '#f97316',
  textDecoration: 'underline',
};
