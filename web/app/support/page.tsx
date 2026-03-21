import type { Metadata } from 'next';
import SupportPage from './SupportPage';

const BASE_URL = 'https://www.roogps.com';

export const metadata: Metadata = {
  title: 'Support & FAQ — GPS Tracker Help Australia',
  description:
    'Get help with your RooGPS GPS tracker. Contact our Australian support team, browse FAQs, setup guides and troubleshooting for vehicle, caravan and equipment tracking.',
  alternates: { canonical: `${BASE_URL}/support` },
  openGraph: {
    title: 'Support & FAQ — RooGPS Australia',
    description:
      'Australian GPS tracker support. Contact our team or browse FAQs for setup, billing, alerts and tracking questions.',
    url: `${BASE_URL}/support`,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RooGPS Support — Australian GPS Tracker Help' }],
  },
  twitter: {
    title: 'Support & FAQ — RooGPS Australia',
    description: 'Australian GPS tracker support. FAQs, setup guides and direct contact.',
  },
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How do I set up my RooGPS tracker?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Setup takes under 2 minutes. Your tracker arrives pre-configured with a SIM card already installed. Simply charge it, place it magnetically on your vehicle and log in to your dashboard to start tracking.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need a separate SIM card?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Every RooGPS tracker comes with a multi-network SIM already installed and configured. It automatically connects to Telstra, Optus or Vodafone — whichever has the best signal.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does the battery last?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The wireless battery tracker lasts 2–3 months on a full charge in standard tracking mode. A wired version is available for permanent installation.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I get SMS alerts when my tracker moves?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. RooGPS supports SMS and email alerts for movement, geofence entry/exit, speed threshold and overnight activity. Configure alerts from the dashboard.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is the tracker waterproof?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. RooGPS is IP65 rated — protected against dust and water jets. It can be mounted under vehicles, on trailers or exposed to Australian weather.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I contact RooGPS support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Email us at hello@roogps.com. Our Australian support team typically responds within one business day.',
      },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <SupportPage />
    </>
  );
}
