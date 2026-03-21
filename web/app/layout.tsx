import type { Metadata, Viewport } from 'next';
import './globals.css';

const BASE_URL = 'https://www.roogps.com';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'RooGPS — Wireless GPS Tracker Australia',
    template: '%s | RooGPS Australia',
  },
  description:
    'Australia\'s wireless GPS tracker for vehicles, cars, caravans and equipment. Multi-network SIM included (Telstra, Optus, Vodafone). Real-time tracking from $5/month. Australian owned & supported.',
  keywords: [
    'wireless gps tracker australia',
    'gps tracker australia',
    'car gps tracker australia',
    'vehicle tracker australia',
    'magnetic gps tracker australia',
    'gps tracker for caravan australia',
    'anti theft gps tracker australia',
    'gps tracking device australia',
    'track my car australia',
    'portable gps tracker australia',
  ],
  authors: [{ name: 'RooGPS', url: BASE_URL }],
  creator: 'RooGPS',
  publisher: 'RooGPS',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    url: BASE_URL,
    siteName: 'RooGPS',
    title: 'RooGPS — Wireless GPS Tracker Australia',
    description:
      'Australia\'s wireless GPS tracker for vehicles, cars, caravans and equipment. Multi-network SIM (Telstra, Optus, Vodafone). Real-time tracking from $5/month.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'RooGPS — Wireless GPS Tracker Australia',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RooGPS — Wireless GPS Tracker Australia',
    description:
      'Wireless GPS tracker for vehicles, caravans & equipment. Multi-network SIM included. Real-time tracking from $5/month.',
    images: ['/og-image.png'],
    creator: '@roogps',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
  alternates: {
    canonical: BASE_URL,
    languages: { 'en-AU': BASE_URL },
  },
  category: 'technology',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f97316',
};

// Organisation JSON-LD — appears on every page
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'RooGPS',
  url: BASE_URL,
  logo: `${BASE_URL}/favicon.png`,
  description:
    'Australian wireless GPS tracker company providing real-time vehicle tracking for cars, caravans, bikes and equipment.',
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'AU',
    addressRegion: 'Victoria',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'hello@roogps.com',
    contactType: 'customer support',
    availableLanguage: 'English',
    areaServed: 'AU',
  },
  sameAs: [],
};

// WebSite JSON-LD with SearchAction for sitelinks search box
const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'RooGPS',
  url: BASE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${BASE_URL}/support?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
