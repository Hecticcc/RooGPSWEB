import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Logo from '@/components/Logo';
import {
  Car,
  Bike,
  Caravan,
  Shield,
  Smartphone,
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

      <section className="marketing-hero">
        <div className="marketing-hero-inner">
          <h1 className="marketing-hero-title">
            GPS Tracker Australia – Vehicle &amp; Bike Theft Prevention
          </h1>
          <p className="marketing-hero-desc">
            Australian owned GPS tracking solutions to prevent vehicle, bike, and caravan theft.
            Everything pre-configured for your peace of mind. Includes SIM card with multi-network coverage.
          </p>
          <Link href="/login" className="marketing-btn marketing-btn-primary">
            View dashboard
          </Link>
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
              { icon: Smartphone, title: 'Mobile App Access', desc: 'Monitor your assets from anywhere with our user-friendly app. Real-time updates at your fingertips.' },
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
              { title: 'Mobile App Convenience', desc: 'Stay connected wherever you are with our easy-to-use app. Get instant alerts, view live location, and share tracking links with family or friends directly from your pocket.', icon: Smartphone },
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
                <li><span className="marketing-compare-li-icon check"><Check size={16} /></span>App, website & unlimited data included</li>
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

          <div className="marketing-pricing-tray">
            <div className="marketing-pricing-grid">
              <div className="marketing-price-card marketing-price-hardware">
                <div className="marketing-price-card-label">Hardware</div>
                <div className="marketing-price-card-amount">
                  <span className="marketing-price-currency">$</span>150
                </div>
                <div className="marketing-price-card-note">one-time</div>
              </div>
              <div className="marketing-price-card">
                <div className="marketing-price-card-label">Monthly</div>
                <div className="marketing-price-card-amount">
                  <span className="marketing-price-currency">$</span>6.99
                  <span className="marketing-price-period">/month</span>
                </div>
              </div>
              <div className="marketing-price-card marketing-price-card-featured">
                <div className="marketing-price-badge">Best value</div>
                <div className="marketing-price-card-label">Yearly</div>
                <div className="marketing-price-card-amount">
                  <span className="marketing-price-currency">$</span>5.00
                  <span className="marketing-price-period">/month</span>
                </div>
                <div className="marketing-price-card-note">$60 billed yearly</div>
                <div className="marketing-price-save">Save $23.88</div>
              </div>
            </div>

            <div className="marketing-included">
              <div className="marketing-included-item"><Wifi size={20} strokeWidth={2} />Unlimited data</div>
              <div className="marketing-included-item"><Radio size={20} strokeWidth={2} />Multi-carrier networks</div>
              <div className="marketing-included-item"><Monitor size={20} strokeWidth={2} />Track Anywhere</div>
            </div>
          </div>

          <div className="marketing-order-wrap">
            <a href="mailto:info@ruthet.com?subject=RooGPS%20Order" className="marketing-btn marketing-btn-primary marketing-btn-order">
              Order now
            </a>
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
        <div className="marketing-header-inner">
          <Link href="/" className="marketing-logo marketing-logo-footer">
            <Logo size={32} wide />
          </Link>
          <p className="marketing-footer-copy">© RooGPS. Australian GPS tracking.</p>
        </div>
      </footer>
    </main>
  );
}
