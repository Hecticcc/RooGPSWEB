import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Logo from '@/components/Logo';
import MarketingHeader from '@/components/MarketingHeader';
import MarketingPricing from '@/components/MarketingPricing';
import MarketingDevicePrice from '@/components/MarketingDevicePrice';
import MarketingFeaturesExpand from '@/components/MarketingFeaturesExpand';
import { getTrialOffer } from '@/lib/get-trial-offer';
import {
  Shield,
  Server,
  Check,
  X,
  BatteryFull,
  Droplets,
  Radio,
  Wifi,
  Monitor,
  Magnet,
  Headphones,
  Route,
  CircleDot,
  Bell,
  Link2,
  MapPin,
  BadgeCheck,
  Package,
} from 'lucide-react';

const BASE_URL = 'https://www.roogps.com';

export const metadata: Metadata = {
  title: 'Wireless GPS Tracker Australia — RooGPS',
  description:
    'Australia\'s wireless GPS tracker for cars, vehicles, caravans & equipment. Multi-network SIM (Telstra, Optus, Vodafone) included. Real-time tracking, geofence alerts & trip history. From $5/month. Australian owned & supported.',
  alternates: { canonical: BASE_URL },
  openGraph: {
    title: 'Wireless GPS Tracker Australia — RooGPS',
    description:
      'GPS tracking for vehicles, caravans & equipment across Australia. Multi-network SIM included. Real-time location, alerts & trip history. From $5/month.',
    url: BASE_URL,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RooGPS Wireless GPS Tracker Australia' }],
  },
  twitter: {
    title: 'Wireless GPS Tracker Australia — RooGPS',
    description: 'GPS tracking for vehicles & caravans across Australia. Multi-network SIM. From $5/month.',
  },
};

// FAQ + Product JSON-LD for homepage
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How does a wireless GPS tracker work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A wireless GPS tracker uses a built-in GPS module to determine its location via satellite, then transmits that location over a mobile network (Telstra, Optus or Vodafone in Australia) to our servers. You can then view the location in real-time on the RooGPS app or dashboard.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I track my car anywhere in Australia?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. RooGPS uses a multi-network SIM that connects to Telstra, Optus and Vodafone — giving you maximum coverage across Australia, including regional and rural areas.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do GPS trackers require a SIM card?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, a SIM card is required to transmit location data. RooGPS includes a multi-network SIM in every device — no need to source or configure your own SIM.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does the battery last?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The RooGPS wireless battery tracker lasts 2–3 months on a full charge, depending on tracking frequency. It recharges via USB and also has a wired vehicle power option.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is the GPS tracker waterproof?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. The RooGPS tracker is IP67 rated, making it waterproof and dustproof — suitable for outdoor use, under vehicles, on trailers and in harsh Australian conditions.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I attach the GPS tracker to my vehicle?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The RooGPS tracker features a strong built-in magnet that attaches directly to any metal surface. No installation or tools required — simply place it under your vehicle, on a trailer, or inside your caravan.',
      },
    },
  ],
};

const productJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'RooGPS Wireless GPS Tracker',
  description:
    'Wireless magnetic GPS tracker for vehicles, cars, caravans and equipment in Australia. Includes multi-network SIM (Telstra, Optus, Vodafone), real-time tracking, trip history, geofence alerts, IP67 waterproof rating and 2–3 month battery life.',
  brand: { '@type': 'Brand', name: 'RooGPS' },
  image: `${BASE_URL}/images/product-wireless.png`,
  url: `${BASE_URL}/order`,
  sku: 'ROOGPS-WIRELESS-1',
  mpn: 'ROOGPS-W1',
  category: 'GPS Tracker',
  audience: { '@type': 'Audience', geographicArea: { '@type': 'Country', name: 'Australia' } },
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

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/track');
  }
  const trialOffer = await getTrialOffer();
  const showTrial = trialOffer.trial_enabled && (trialOffer.trial_months ?? 0) > 0;
  const trialMonths = trialOffer.trial_months ?? 0;

  return (
    <main className="marketing-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <MarketingHeader />

      {/* ── Hero ── */}
      <section className="marketing-hero">
        <div className="marketing-hero-bg marketing-hero-bg--gps" aria-hidden="true">
          <svg className="marketing-hero-bg-svg" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(249,115,22,0.06)" strokeWidth="0.5" />
              </pattern>
              <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(249,115,22,0.08)" />
                <stop offset="70%" stopColor="rgba(249,115,22,0.02)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
              <linearGradient id="hero-base" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#211f24" />
                <stop offset="50%" stopColor="#1e1c23" />
                <stop offset="100%" stopColor="#1a181c" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-base)" />
            <rect width="100%" height="100%" fill="url(#hero-grid)" />
            <circle cx="85%" cy="35%" r="140" fill="none" stroke="rgba(249,115,22,0.12)" strokeWidth="1" />
            <circle cx="85%" cy="35%" r="100" fill="none" stroke="rgba(249,115,22,0.08)" strokeWidth="1" />
            <circle cx="85%" cy="35%" r="60" fill="url(#hero-glow)" />
            <path d="M 200 400 Q 400 200 700 350 T 1100 280" fill="none" stroke="rgba(249,115,22,0.07)" strokeWidth="2" strokeDasharray="8 12" />
            <path d="M 150 450 Q 500 300 900 400" fill="none" stroke="rgba(249,115,22,0.05)" strokeWidth="1.5" strokeDasharray="6 10" />
          </svg>
        </div>
        <div className="marketing-hero-overlay marketing-hero-overlay--gps" aria-hidden="true" />
        <div className="marketing-hero-inner">
          <div className="marketing-hero-content marketing-animate-in">
            <div className="marketing-hero-eyebrow">
              <img
                src="https://flagcdn.com/w80/au.png"
                srcSet="https://flagcdn.com/w160/au.png 2x"
                width={20} height={12} alt="" aria-hidden
                className="marketing-hero-eyebrow-flag"
              />
              Australian Owned &amp; Operated
            </div>
            <h1 className="marketing-hero-title">
              Wireless GPS Tracker<br />
              <span className="marketing-hero-title-sub">for Australia</span>
            </h1>
            <p className="marketing-hero-desc">
              Track your vehicle, caravan or equipment anywhere in Australia. Multi-network SIM (Telstra, Optus &amp; Vodafone) included — real-time location, trip history and geofence alerts from $5/month.
            </p>
            <div className="marketing-hero-actions">
              <a href="#pricing" className="marketing-btn marketing-btn-primary marketing-hero-cta">
                View Pricing
              </a>
              <Link href="/features" className="marketing-btn marketing-btn-ghost">
                See dashboard
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
            {showTrial && (
              <div className="marketing-hero-promo" role="region" aria-label="Free trial offer">
                <span className="marketing-hero-promo-tag">Offer</span>
                <span className="marketing-hero-promo-main">
                  {trialMonths === 1 ? '1 month' : `${trialMonths} months`} free
                </span>
                <span className="marketing-hero-promo-sub">on SIM subscription · then standard rate</span>
              </div>
            )}
          </div>
          <div className="marketing-hero-visual marketing-animate-in marketing-animate-in--delay">
            <picture>
              <source media="(max-width: 767px)" srcSet="/hero-kangaroo-mobile.webp" type="image/webp" />
              <img
                src="/hero-kangaroo.webp"
                alt="RooGPS wireless GPS tracker – compact device for vehicles, bikes and caravans"
                width={560}
                height={373}
                className="marketing-hero-kangaroo"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </div>
        </div>
      </section>

      {/* ── Stats Strip ── */}
      <div className="marketing-stats-strip" role="region" aria-label="Key product facts">
        <div className="marketing-stats-inner">
          <div className="marketing-stat">
            <span className="marketing-stat-value">3</span>
            <span className="marketing-stat-label">Mobile Networks</span>
          </div>
          <div className="marketing-stat-divider" aria-hidden="true" />
          <div className="marketing-stat">
            <span className="marketing-stat-value">6+</span>
            <span className="marketing-stat-label">Month Battery</span>
          </div>
          <div className="marketing-stat-divider" aria-hidden="true" />
          <div className="marketing-stat">
            <span className="marketing-stat-value">IP65</span>
            <span className="marketing-stat-label">Waterproof</span>
          </div>
          <div className="marketing-stat-divider" aria-hidden="true" />
          <div className="marketing-stat">
            <span className="marketing-stat-value">AU</span>
            <span className="marketing-stat-label">Servers &amp; Support</span>
          </div>
        </div>
      </div>

      {/* ── 3 Pillars ── */}
      <section id="features" className="marketing-section">
        <div className="marketing-section-inner">
          <h2 className="marketing-section-title">Track Your Vehicle Anywhere in Australia</h2>
          <p className="marketing-section-subtitle">Everything you need — nothing extra to buy.</p>
          <div className="marketing-pillars">
            <div className="marketing-pillar">
              <div className="marketing-pillar-icon-wrap">
                <Wifi size={30} strokeWidth={1.8} />
              </div>
              <h3 className="marketing-pillar-title">Multi-Network SIM Included</h3>
              <p className="marketing-pillar-desc">Automatically switches between Telstra, Optus &amp; Vodafone for the best coverage — no BYO SIM required.</p>
            </div>
            <div className="marketing-pillar">
              <div className="marketing-pillar-icon-wrap">
                <Magnet size={30} strokeWidth={1.8} />
              </div>
              <h3 className="marketing-pillar-title">Wireless &amp; Hidden</h3>
              <p className="marketing-pillar-desc">Heavy-duty magnet, 2–3 month battery and IP65 waterproof rating. Mount it anywhere — no wires, no drilling, no fuss.</p>
            </div>
            <div className="marketing-pillar">
              <div className="marketing-pillar-icon-wrap">
                <Server size={30} strokeWidth={1.8} />
              </div>
              <h3 className="marketing-pillar-title">Australian Infrastructure</h3>
              <p className="marketing-pillar-desc">Custom dashboard, Australian servers and a local support team. Not a rebadged overseas product.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature chips ── */}
      <section id="benefits" className="marketing-section marketing-section-alt">
        <div className="marketing-section-inner">
          <h2 className="marketing-section-title">Everything included</h2>
          <p className="marketing-section-subtitle">One device. One subscription. Complete peace of mind.</p>
          <div className="marketing-chips-grid">
            {[
              { icon: MapPin,      text: 'Real-time live location' },
              { icon: Route,       text: 'Trip history & replay' },
              { icon: CircleDot,   text: 'Geofence alerts' },
              { icon: Shield,      text: 'WatchDog & Night Guard' },
              { icon: Bell,        text: 'SMS & battery alerts' },
              { icon: Link2,       text: 'Shareable location links' },
              { icon: BadgeCheck,  text: 'Insurance-friendly' },
              { icon: Headphones,  text: 'Australian support' },
              { icon: Package,     text: 'Pre-configured, ready to use' },
              { icon: Monitor,     text: 'Works on any device' },
              { icon: Radio,       text: 'Real-time tracking' },
              { icon: BatteryFull, text: '2–3 month battery' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="marketing-chip">
                <span className="marketing-chip-icon"><Icon size={16} strokeWidth={2} /></span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard CTA ── */}
      <section className="marketing-dashboard-cta-section">
        <div className="marketing-section-inner">
          <div className="marketing-dashboard-cta-block">
            <div className="marketing-dashboard-cta-left">
              <span className="marketing-dashboard-cta-eyebrow">Built in-house</span>
              <h2 className="marketing-dashboard-cta-title">
                See our dashboard<br />in action
              </h2>
              <p className="marketing-dashboard-cta-desc">
                Custom-built from the ground up. Real-time map, trip history, smart alerts, signal monitoring and more — all in one place.
              </p>
              <Link href="/features" className="marketing-dashboard-cta-btn">
                Explore the dashboard
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
            <div className="marketing-dashboard-cta-right" aria-hidden="true">
              <div className="marketing-dashboard-cta-preview">
                <div className="mktp-chrome">
                  <div className="mktp-chrome-bar">
                    <span className="mktp-chrome-dot" />
                    <span className="mktp-chrome-dot" />
                    <span className="mktp-chrome-dot" />
                    <span className="mktp-chrome-url">track.roogps.com</span>
                  </div>
                  <div className="mktp-map-bg">
                    <svg className="mktp-map-grid" viewBox="0 0 360 200" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <pattern id="cta-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(249,115,22,0.07)" strokeWidth="0.5"/>
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="#1a181e"/>
                      <rect width="100%" height="100%" fill="url(#cta-grid)"/>
                      <path d="M 20 160 Q 80 80 160 110 T 340 60" fill="none" stroke="rgba(249,115,22,0.35)" strokeWidth="2" strokeDasharray="6 5"/>
                      <circle cx="160" cy="110" r="6" fill="#f97316" opacity="0.9"/>
                      <circle cx="160" cy="110" r="12" fill="rgba(249,115,22,0.2)"/>
                      <circle cx="160" cy="110" r="20" fill="rgba(249,115,22,0.08)"/>
                      <rect x="100" y="130" width="120" height="36" rx="7" fill="rgba(30,28,34,0.95)" stroke="rgba(249,115,22,0.2)" strokeWidth="1"/>
                      <rect x="108" y="138" width="60" height="5" rx="2" fill="#e4e4e7" opacity="0.7"/>
                      <rect x="108" y="148" width="40" height="4" rx="2" fill="#71717a" opacity="0.6"/>
                    </svg>
                    <div className="mktp-status-chip">
                      <span className="mktp-status-dot"/>Online · 2 min ago
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why RooGPS vs competitors ── */}
      <section id="why-choose" className="marketing-section">
        <div className="marketing-section-inner">
          <h2 className="marketing-section-title">Why RooGPS?</h2>
          <p className="marketing-section-subtitle">
            A complete solution — not a device with a bill of extras.
          </p>
          <div className="mkt-cmp-table">
            {/* Header */}
            <div className="mkt-cmp-head">
              <div className="mkt-cmp-col-feat" />
              <div className="mkt-cmp-col-head-us">
                <span className="mkt-cmp-us-badge">
                  <Logo size={18} wide />
                </span>
              </div>
              <div className="mkt-cmp-col-head-them">Others</div>
            </div>
            {/* Rows */}
            {[
              { feat: 'SIM card',         us: 'Included — no extra cost',       them: 'BYO SIM required' },
              { feat: 'Network coverage', us: 'Telstra, Optus & Vodafone',       them: 'Single carrier only' },
              { feat: 'Remote areas',     us: 'Auto-switch for best signal',     them: 'Dead zones' },
              { feat: 'Dashboard',        us: 'Built in house — Hosted in Australia',        them: 'Overseas third-party platform' },
              { feat: 'Setup',            us: 'Pre-configured, plug in & go',    them: 'Technical knowledge needed' },
              { feat: 'Support',          us: 'Australian — same time zone',     them: 'Overseas call centres' },
            ].map((row, i) => (
              <div key={row.feat} className={`mkt-cmp-row${i % 2 !== 0 ? ' mkt-cmp-row--alt' : ''}`}>
                <div className="mkt-cmp-col-feat">{row.feat}</div>
                <div className="mkt-cmp-col-us">
                  <span className="mkt-cmp-check"><Check size={13} strokeWidth={2.5} /></span>
                  {row.us}
                </div>
                <div className="mkt-cmp-col-them">
                  <span className="mkt-cmp-cross"><X size={13} strokeWidth={2.5} /></span>
                  {row.them}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="marketing-pricing-section">
        <div className="marketing-section-inner">
          <div className="marketing-showcase">

            {/* ── Left: product image + hardware specs ── */}
            <div className="marketing-showcase-left">
              <div className="marketing-showcase-img-wrap">
                <div className="marketing-showcase-img-glow" aria-hidden="true" />
                <Image
                  src="/images/product-wireless.png"
                  alt="RooGPS wireless magnetic GPS tracker — compact vehicle tracking device for cars, caravans and trailers in Australia"
                  width={480}
                  height={480}
                  className="marketing-showcase-img"
                />
              </div>
              <div className="marketing-showcase-specs">
                <div className="marketing-showcase-spec">
                  <span className="marketing-showcase-spec-icon"><BatteryFull size={15} strokeWidth={2} /></span>
                  <div><strong>2–3 Month</strong><span>Battery life</span></div>
                </div>
                <div className="marketing-showcase-spec">
                  <span className="marketing-showcase-spec-icon"><Droplets size={15} strokeWidth={2} /></span>
                  <div><strong>IP65</strong><span>Waterproof</span></div>
                </div>
                <div className="marketing-showcase-spec">
                  <span className="marketing-showcase-spec-icon"><Magnet size={15} strokeWidth={2} /></span>
                  <div><strong>Wireless</strong><span>Magnetic mount</span></div>
                </div>
                <div className="marketing-showcase-spec">
                  <span className="marketing-showcase-spec-icon"><Wifi size={15} strokeWidth={2} /></span>
                  <div><strong>Multi-Carrier Connectivity</strong><span>Telstra · Optus · Vodafone</span></div>
                </div>
              </div>

              {/* Expandable full feature list */}
              <MarketingFeaturesExpand />

              {/* Device price — connected to the image */}
              <MarketingDevicePrice />
            </div>

            {/* ── Right: product info + pricing ── */}
            <div className="marketing-showcase-right">
              <div className="marketing-showcase-eyebrow">GPS Tracker — Australia</div>
              <h2 className="marketing-showcase-title">Magnetic GPS Tracker for Cars, Caravans &amp; Equipment</h2>
              <p className="marketing-showcase-desc">
                Pre-configured and ready in minutes. Multi-network SIM (Telstra, Optus &amp; Vodafone) included — no extra cost. Tracks anywhere in Australia.
              </p>

              <MarketingPricing />
            </div>

          </div>
        </div>
      </section>

      {/* ── FAQ Section ── */}
      <section id="faq" className="marketing-section marketing-section-alt" aria-labelledby="faq-heading">
        <div className="marketing-section-inner">
          <h2 id="faq-heading" className="marketing-section-title">Frequently Asked Questions</h2>
          <p className="marketing-section-subtitle">Everything you need to know about GPS tracking in Australia.</p>
          <div className="mkt-faq-list">
            {[
              {
                q: 'How does a wireless GPS tracker work?',
                a: 'A wireless GPS tracker uses satellite positioning to pinpoint its location, then transmits that data over a mobile network. RooGPS uses a multi-network SIM (Telstra, Optus & Vodafone) to ensure maximum coverage across Australia, sending live location updates to your dashboard.',
              },
              {
                q: 'Can I track my car anywhere in Australia?',
                a: 'Yes. RooGPS automatically switches between Telstra, Optus and Vodafone — giving you the best available signal in cities, suburbs, regional and rural Australia. If one carrier has a dead zone, another picks up.',
              },
              {
                q: 'Do GPS trackers require a SIM card?',
                a: 'Yes — GPS trackers need a mobile connection to transmit location data. Every RooGPS device includes a pre-configured multi-network SIM at no extra cost. Simply place the tracker and start tracking.',
              },
              {
                q: 'How long does the battery last?',
                a: 'The RooGPS wireless tracker lasts 2–3 months on a full charge in standard tracking mode. Battery life depends on update frequency. A wired version is also available for permanent installation.',
              },
              {
                q: 'Is the GPS tracker waterproof?',
                a: 'Yes. RooGPS is IP65 rated — protected against dust and water jets. You can mount it under a vehicle, on a trailer, inside a caravan or anywhere exposed to Australian weather conditions.',
              },
              {
                q: 'How do I install a GPS tracker on my vehicle?',
                a: 'No installation required. The built-in magnet attaches to any metal surface in seconds. Place it under your car, inside your caravan or on your trailer. No tools, no drilling, no wiring.',
              },
            ].map(({ q, a }) => (
              <details key={q} className="mkt-faq-item">
                <summary className="mkt-faq-q">{q}</summary>
                <p className="mkt-faq-a">{a}</p>
              </details>
            ))}
          </div>
          <p className="mkt-faq-more">
            More questions?{' '}
            <Link href="/support" className="mkt-faq-more-link">Visit our Support page</Link>
            {' '}or email{' '}
            <a href="mailto:hello@roogps.com" className="mkt-faq-more-link">hello@roogps.com</a>
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="marketing-cta-section">
        <div className="marketing-section-inner">
          <h2 className="marketing-cta-title">Ready to protect your gear?</h2>
          <p className="marketing-cta-desc">Sign in or create an account to access your dashboard.</p>
          <div className="marketing-cta-buttons">
            <Link href="/login" className="marketing-btn marketing-btn-primary">Log in</Link>
            <Link href="/register" className="marketing-btn marketing-btn-secondary">Create account</Link>
          </div>
        </div>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-footer-inner">
          <div className="marketing-footer-left">
            <Link href="/" className="marketing-logo marketing-logo-footer">
              <Logo size={28} wide />
            </Link>
            <nav className="marketing-footer-nav" aria-label="Footer">
              <Link href="/order" className="marketing-footer-link">Buy Tracker</Link>
              <Link href="/features" className="marketing-footer-link">Features</Link>
              <Link href="/support" className="marketing-footer-link">Support</Link>
              <Link href="/theft-stats" className="marketing-footer-link">Theft Stats</Link>
              <a href="https://status.roogps.com" target="_blank" rel="noopener noreferrer" className="marketing-footer-link">Status</a>
            </nav>
          </div>
          <div className="marketing-footer-right">
            <div className="marketing-footer-aussie">
              <img
                src="https://flagcdn.com/w80/au.png"
                srcSet="https://flagcdn.com/w160/au.png 2x"
                width={20} height={12} alt="" aria-hidden
                className="marketing-aussie-flag-img"
                loading="lazy"
              />
              <span>Australian Owned &amp; Supported</span>
            </div>
            <p className="marketing-footer-copy">
              © {new Date().getFullYear()} RooGPS
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
