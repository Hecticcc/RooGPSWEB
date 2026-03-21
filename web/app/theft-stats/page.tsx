import type { Metadata } from 'next';
import TheftStatsPage from './TheftStatsPage';

const BASE_URL = 'https://www.roogps.com';

export const metadata: Metadata = {
  title: 'Victoria Vehicle Theft Statistics — GPS Tracker Protection',
  description:
    'Interactive vehicle theft statistics for Victoria, Australia. Search your suburb to see theft trends, compare yearly data and find out how a GPS tracker can protect your vehicle.',
  alternates: { canonical: `${BASE_URL}/theft-stats` },
  openGraph: {
    title: 'Victoria Vehicle Theft Statistics — RooGPS',
    description:
      'Is vehicle theft rising in your suburb? Interactive map, charts and suburb data for Victoria. Protect your car with a GPS tracker.',
    url: `${BASE_URL}/theft-stats`,
    images: [{ url: '/theft-hero.png', width: 1200, height: 630, alt: 'Victoria Vehicle Theft Statistics Map' }],
  },
  twitter: {
    title: 'Victoria Vehicle Theft Statistics — RooGPS',
    description: 'Is vehicle theft rising in your suburb? Check interactive stats for Victoria, Australia.',
  },
};

export default function Page() {
  return <TheftStatsPage />;
}
