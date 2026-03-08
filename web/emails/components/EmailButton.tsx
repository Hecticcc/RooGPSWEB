import * as React from 'react';
import { Button } from '@react-email/components';

type Props = {
  href: string;
  children: React.ReactNode;
};

export function EmailButton({ href, children }: Props) {
  return (
    <Button href={href} style={buttonStyle}>
      {children}
    </Button>
  );
}

const buttonStyle = {
  backgroundColor: '#f97316',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '14px',
  textDecoration: 'none',
};
