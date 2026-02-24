import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RooGPS',
  description: 'GPS device tracking',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/logo.png" as="image" />
      </head>
      <body>{children}</body>
    </html>
  );
}
