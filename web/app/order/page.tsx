import type { Metadata } from 'next';
import OrderPage from './OrderPage';

const BASE_URL = 'https://www.roogps.com';

export const metadata: Metadata = {
  title: 'Buy a GPS Tracker — Wireless Vehicle Tracker Australia',
  description:
    'Order the RooGPS wireless GPS tracker for cars, vehicles, caravans and equipment. Includes multi-network SIM (Telstra, Optus, Vodafone). Real-time tracking from $5/month. Ships Australia-wide.',
  alternates: { canonical: `${BASE_URL}/order` },
  openGraph: {
    title: 'Buy a GPS Tracker — RooGPS Australia',
    description:
      'Wireless magnetic GPS tracker with multi-network SIM included. Real-time tracking, geofence alerts, trip history. From $5/month. Ships Australia-wide.',
    url: `${BASE_URL}/order`,
    images: [
      {
        url: '/images/product-wireless.png',
        width: 800,
        height: 800,
        alt: 'RooGPS Wireless GPS Tracker — Australia',
      },
    ],
  },
  twitter: {
    title: 'Buy a GPS Tracker — RooGPS Australia',
    description: 'Wireless GPS tracker with multi-network SIM. From $5/month. Ships Australia-wide.',
  },
};

// Product schema for the order/product page
const productJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'RooGPS Wireless GPS Tracker',
  description:
    'Wireless magnetic GPS tracker for vehicles, cars, caravans and equipment in Australia. Includes multi-network SIM (Telstra, Optus, Vodafone). IP65 waterproof. 2–3 month battery. Real-time tracking, geofence alerts, trip history.',
  brand: { '@type': 'Brand', name: 'RooGPS' },
  image: `${BASE_URL}/images/product-wireless.png`,
  url: `${BASE_URL}/order`,
  sku: 'ROOGPS-WIRELESS-1',
  mpn: 'ROOGPS-W1',
  category: 'GPS Tracker',
  audience: {
    '@type': 'Audience',
    geographicArea: { '@type': 'Country', name: 'Australia' },
  },
  additionalProperty: [
    { '@type': 'PropertyValue', name: 'Battery Life', value: '2–3 months' },
    { '@type': 'PropertyValue', name: 'Waterproof Rating', value: 'IP65' },
    { '@type': 'PropertyValue', name: 'Mount', value: 'Magnetic' },
    { '@type': 'PropertyValue', name: 'Networks', value: 'Telstra, Optus, Vodafone' },
    { '@type': 'PropertyValue', name: 'SIM', value: 'Included' },
    { '@type': 'PropertyValue', name: 'Country', value: 'Australia' },
  ],
  offers: {
    '@type': 'Offer',
    url: `${BASE_URL}/order`,
    priceCurrency: 'AUD',
    price: '5.00',
    priceValidUntil: '2026-12-31',
    availability: 'https://schema.org/InStock',
    seller: { '@type': 'Organization', name: 'RooGPS' },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'AU' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        businessDays: { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
      },
    },
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    reviewCount: '47',
    bestRating: '5',
    worstRating: '1',
  },
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <OrderPage />
    </>
  );
}
