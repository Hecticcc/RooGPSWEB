import * as React from 'react';
import { Html, Head, Body, Container } from '@react-email/components';
import { EmailHeader } from './EmailHeader';
import { EmailFooter } from './EmailFooter';

type Props = {
  children: React.ReactNode;
  preview?: string;
};

export function EmailLayout({ children, preview }: Props) {
  return (
    <Html>
      <Head />
      {preview ? (
        // Preview text (shown in inbox list)
        <div data-id="preview" style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>
          {preview}
        </div>
      ) : null}
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />
          <Container style={contentStyle}>{children}</Container>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  backgroundColor: '#f4f4f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: 0,
  padding: '24px 0',
};

const containerStyle = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  overflow: 'hidden' as const,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

const contentStyle = {
  padding: '24px',
};
