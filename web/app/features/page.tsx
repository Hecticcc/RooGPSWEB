import type { Metadata } from 'next';
import FeaturesPage from './FeaturesPage';

const BASE_URL = 'https://www.roogps.com';

export const metadata: Metadata = {
  title: 'GPS Tracker Features — Live Tracking, Trip History & Alerts',
  description:
    'Explore RooGPS dashboard features: real-time live map, full trip history, geofence alerts, WatchDog mode, Night Guard, battery monitoring and signal health — all for vehicles across Australia.',
  alternates: { canonical: `${BASE_URL}/features` },
  openGraph: {
    title: 'GPS Tracker Features — RooGPS Australia',
    description:
      'Live map tracking, trip replay, geofence alerts, WatchDog mode and more — built for Australian vehicles, caravans and equipment.',
    url: `${BASE_URL}/features`,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RooGPS Dashboard Features' }],
  },
  twitter: {
    title: 'GPS Tracker Features — RooGPS Australia',
    description: 'Live map, trip history, geofence alerts and more for GPS tracking across Australia.',
  },
};

export default function Page() {
  return <FeaturesPage />;
}
