import * as React from 'react';
import { Section, Img } from '@react-email/components';

const logoUrl = process.env.EMAIL_BRAND_LOGO_URL ?? 'https://roogps.com/logo.png';

export function EmailHeader() {
  return (
    <Section style={headerSection}>
      <Img src={logoUrl} alt="RooGPS" width={120} height={40} style={logo} />
    </Section>
  );
}

const headerSection = {
  backgroundColor: '#1a1a1a',
  padding: '20px 24px',
  borderRadius: '8px 8px 0 0',
  textAlign: 'center' as const,
};

const logo = {
  display: 'block',
  margin: '0 auto',
  objectFit: 'contain' as const,
};
