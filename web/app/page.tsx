import Link from 'next/link';
import Image from 'next/image';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Logo from '@/components/Logo';
import MarketingPricing from '@/components/MarketingPricing';
import {
  Car,
  Bike,
  Caravan,
  Shield,
  Server,
  Settings,
  CreditCard,
  BadgeCheck,
  LayoutDashboard,
  MapPin,
  Package,
  Check,
  X,
  Battery,
  Droplets,
  Radio,
  Wifi,
  Monitor,
  Magnet,
  Headphones,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/track');
  }

  return (
    <main className="marketing-page">
      <header className="marketing-header">
        <div className="marketing-header-inner">
          <Link href="/" className="marketing-logo">
            <Logo size={40} wide />
          </Link>
          <nav className="marketing-nav">
            <a href="#benefits">Benefits</a>
            <a href="#features">Features</a>
            <a href="#why-choose">Why RooGPS</a>
            <a href="#pricing">Pricing</a>
            <Link href="/login" className="marketing-cta-header">Dashboard</Link>
          </nav>
        </div>
      </header>

      <div className="marketing-aussie-bar" role="region" aria-label="Australian business">
        <img
          src="https://flagcdn.com/w80/au.png"
          srcSet="https://flagcdn.com/w160/au.png 2x"
          width={40}
          height={20}
          alt=""
          className="marketing-aussie-flag-img"
          aria-hidden
        />
        <span className="marketing-aussie-text">
          Australian Owned · Australian Support · For Australians
        </span>
      </div>

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
            <h1 className="marketing-hero-title">
              GPS Tracker Australia – Vehicle &amp; Bike Theft Prevention
            </h1>
            <p className="marketing-hero-desc">
              Australian owned GPS tracking solutions to prevent vehicle, bike, and caravan theft.
              Everything pre-configured for your peace of mind. Includes SIM card with multi-network coverage.
            </p>
            <a href="#pricing" className="marketing-btn marketing-btn-primary marketing-hero-cta">
              View Pricing
            </a>
          </div>
          <div className="marketing-hero-visual marketing-animate-in marketing-animate-in--delay">
            <Image
              src="/hero-kangaroo.png"
              alt=""
              width={560}
              height={620}
              className="marketing-hero-kangaroo"
              priority
            />
          </div>
        </div>
      </section>

      <section id="benefits" className="marketing-section">
        <div className="marketing-section-inner">
          <h2 className="marketing-section-title">The RooGPS Tracking Benefits</h2>
          <p className="marketing-section-subtitle">
            Protect your valuable assets with our reliable tracking technology
          </p>
          <div className="marketing-benefits-grid">
            {[
              { icon: Car, title: 'Vehicle Theft Prevention', desc: 'Real-time tracking and instant alerts if your vehicle moves without authorization. Recover stolen vehicles quickly with precise location data.' },
              { icon: Bike, title: 'Bike Security', desc: 'Protect your expensive bikes and motorcycles. Get notified immediately if they\'re moved or tampered with.' },
              { icon: Caravan, title: 'Caravan Protection', desc: 'Keep your caravan safe from theft. Track its location and receive alerts for any unauthorized movement.' },
              { icon: Shield, title: '24/7 Monitoring', desc: 'Round-the-clock surveillance with instant notifications. Our system never sleeps, ensuring your assets are always protected.' },
              { icon: Server, title: 'Custom Dashboard & Australian Servers', desc: 'Our dashboard is completely custom. We run our own backend Australian servers – most other companies use third‑party services that are not in Australia.' },
              { icon: Settings, title: 'Pre-Configured', desc: 'Everything is set up and ready to use. No technical knowledge required – just install and start tracking.' },
              { icon: CreditCard, title: 'Multi-Network SIM Included', desc: 'Includes SIM card with automatic network selection between Telstra, Optus & Vodafone. No BYO SIM required – we handle the connectivity.' },
              { icon: BadgeCheck, title: 'Insurance Benefits', desc: 'Many insurers offer discounts for GPS-protected vehicles, making tracking essential for lowering costs.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="marketing-card">
                <div className="marketing-card-icon-wrap">
                  <Icon size={24} strokeWidth={2} />
                </div>
                <h3 className="marketing-card-title">{title}</h3>
                <p className="marketing-card-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="marketing-section marketing-section-alt">
        <div className="marketing-section-inner">
          <h2 className="marketing-section-title">Built for Simplicity</h2>
          <div className="marketing-features-grid">
            {[
              { title: 'Powerful Dashboard', desc: 'Manage everything from one simple, intuitive dashboard. See real-time location updates, review trip history, and customize alerts with ease. Designed so anyone can use it without training.', icon: LayoutDashboard },
              { title: 'Custom Dashboard & Australian Infrastructure', desc: 'Our dashboard is completely custom. We run our own backend Australian servers where most other companies use third‑party services that are not in Australia.', icon: Server },
              { title: 'Completely Wireless & Hidden', desc: 'Fully wireless with a heavy-duty magnet so you can hide it anywhere – under the chassis, in a toolbox, or out of sight. Unlike wired GPS trackers, which are limited and often found by thieves.', icon: Magnet },
              { title: 'Australian Support', desc: 'No need for long waits or overseas call centres. All our support is local – when you need help, you get it from someone here in Australia, in your time zone.', icon: Headphones },
              { title: 'Hassle-Free Setup', desc: 'Our trackers are pre-configured and ready to go out of the box. Simply place the device, power it up, and start tracking immediately – no complicated setup required.', icon: Package },
              { title: 'Built for Simplicity', desc: 'Technology should make life easier, not harder. That\'s why our system is designed to be clear, intuitive, and reliable, giving you peace of mind without the complexity.', icon: MapPin },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="marketing-feature-card">
                <div className="marketing-feature-icon">
                  <Icon size={28} strokeWidth={2} />
                </div>
                <h3 className="marketing-feature-title">{title}</h3>
                <p className="marketing-feature-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="why-choose" className="marketing-section">
        <div className="marketing-section-inner">
          <h2 className="marketing-section-title">Why Choose RooGPS Over Competitors?</h2>
          <p className="marketing-section-subtitle">
            We provide complete solutions while others leave you with limitations
          </p>
          <div className="marketing-compare">
            <div className="marketing-compare-card marketing-compare-good">
              <div className="marketing-compare-header">
                <span className="marketing-compare-icon marketing-compare-icon-check">
                  <Check size={20} strokeWidth={2.5} />
                </span>
                <h3>RooGPS – Complete Solution</h3>
              </div>
              <ul>
                <li><span className="marketing-compare-li-icon check"><Check size={16} /></span>SIM card included – no extra purchase needed</li>
                <li><span className="marketing-compare-li-icon check"><Check size={16} /></span>Multi-network coverage (Telstra, Optus & Vodafone)</li>
                <li><span className="marketing-compare-li-icon check"><Check size={16} /></span>Automatic network selection for best coverage</li>
                <li><span className="marketing-compare-li-icon check"><Check size={16} /></span>Custom web dashboard, website & unlimited data included</li>
                <li><span className="marketing-compare-li-icon check"><Check size={16} /></span>Everything pre-configured and ready to use</li>
              </ul>
            </div>
            <div className="marketing-compare-card marketing-compare-bad">
              <div className="marketing-compare-header">
                <span className="marketing-compare-icon marketing-compare-icon-cross">
                  <X size={20} strokeWidth={2.5} />
                </span>
                <h3>Other Companies – Limited Options</h3>
              </div>
              <ul>
                <li><span className="marketing-compare-li-icon cross"><X size={16} /></span>BYO SIM card required – additional cost</li>
                <li><span className="marketing-compare-li-icon cross"><X size={16} /></span>Limited to single network coverage</li>
                <li><span className="marketing-compare-li-icon cross"><X size={16} /></span>Poor coverage in remote areas</li>
                <li><span className="marketing-compare-li-icon cross"><X size={16} /></span>Hidden fees for app access</li>
                <li><span className="marketing-compare-li-icon cross"><X size={16} /></span>Complex setup and configuration</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="marketing-pricing-section">
        <div className="marketing-section-inner">
          <h2 className="marketing-section-title">Wireless GPS Tracker</h2>
          <p className="marketing-section-subtitle">
            One device. Simple pricing. Everything included.
          </p>

          <div className="marketing-product-block">
            <div className="marketing-product-image-wrap">
              <div className="marketing-product-image-placeholder">
                <Package size={64} strokeWidth={1.5} />
                <span>Product image</span>
              </div>
            </div>
            <div className="marketing-product-detail">
              <h3 className="marketing-product-title">RooGPS Tracker</h3>
              <p className="marketing-product-desc">
                Advanced wireless GPS tracker with long battery life and easy installation.
                Perfect for vehicles, bikes, and caravans.
              </p>
              <ul className="marketing-product-features">
                <li><Battery size={20} strokeWidth={2} /><span>6+ months battery life</span></li>
                <li><Droplets size={20} strokeWidth={2} /><span>IP65 waterproof</span></li>
                <li><Radio size={20} strokeWidth={2} /><span>Real-time tracking</span></li>
              </ul>
            </div>
          </div>

          <p className="marketing-pricing-intro">Simple, transparent pricing</p>

          <MarketingPricing />

          <div className="marketing-included">
            <div className="marketing-included-item"><Wifi size={20} strokeWidth={2} />Unlimited data</div>
            <div className="marketing-included-item"><Radio size={20} strokeWidth={2} />Multi-carrier networks</div>
            <div className="marketing-included-item"><Monitor size={20} strokeWidth={2} />Track Anywhere</div>
          </div>

          <div className="marketing-order-wrap">
            <Link href="/order" className="marketing-btn marketing-btn-primary marketing-btn-order">
              Order now
            </Link>
            <p className="marketing-order-note">No hidden fees. Cancel anytime. 1-year warranty included.</p>
          </div>
        </div>
      </section>

      <section className="marketing-cta-section">
        <div className="marketing-section-inner">
          <h2 className="marketing-cta-title">Ready to protect your assets?</h2>
          <p className="marketing-cta-desc">Sign in or create an account to access your dashboard.</p>
          <div className="marketing-cta-buttons">
            <Link href="/login" className="marketing-btn marketing-btn-primary">Log in</Link>
            <Link href="/register" className="marketing-btn marketing-btn-secondary">Create account</Link>
          </div>
        </div>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-header-inner marketing-footer-inner">
          <Link href="/" className="marketing-logo marketing-logo-footer">
            <Logo size={32} wide />
          </Link>
          <div className="marketing-footer-aussie-wrap">
            <div className="marketing-footer-aussie">
              <img
                src="https://flagcdn.com/w80/au.png"
                srcSet="https://flagcdn.com/w160/au.png 2x"
                width={36}
                height={18}
                alt=""
                className="marketing-aussie-flag-img"
                aria-hidden
              />
              <span>Australian Owned · Australian Support · For Australians</span>
            </div>
          </div>
          <p className="marketing-footer-copy">© RooGPS. Australian GPS tracking.</p>
        </div>
      </footer>
    </main>
  );
}
