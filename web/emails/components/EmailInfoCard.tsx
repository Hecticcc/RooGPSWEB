import * as React from 'react';
import { Section, Text } from '@react-email/components';

type Props = {
  title?: string;
  children: React.ReactNode;
};

export function EmailInfoCard({ title, children }: Props) {
  return (
    <Section style={cardStyle}>
      {title ? <Text style={cardTitle}>{title}</Text> : null}
      {children}
    </Section>
  );
}

const cardStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e4e4e7',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '16px',
};

const cardTitle = {
  margin: '0 0 12px 0',
  fontSize: '14px',
  fontWeight: 600,
  color: '#18181b',
};
