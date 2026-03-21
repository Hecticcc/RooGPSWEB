'use client';

import { useState } from 'react';
import MarketingHeader from '@/components/MarketingHeader';
import Logo from '@/components/Logo';
import Link from 'next/link';
import {
  Mail, ChevronDown, MessageSquare, Clock, Shield,
  Zap, HelpCircle, Send,
} from 'lucide-react';

const FAQS = [
  {
    category: 'Getting Started',
    items: [
      {
        q: 'How do I set up my RooGPS tracker?',
        a: "Setup takes under 2 minutes. Your tracker arrives pre-configured — simply insert the SIM card included in the box, power it on, and it will appear in your dashboard automatically. No app downloads, no technical knowledge required.",
      },
      {
        q: 'Do I need a separate SIM card?',
        a: 'No. Every RooGPS tracker comes with a SIM card included at no extra cost. It works across Telstra, Optus, and Vodafone networks and automatically switches to the strongest available signal wherever you are in Australia.',
      },
      {
        q: 'What is the difference between the battery and wired versions?',
        a: 'The battery-powered tracker is completely wireless — mount it anywhere with the heavy-duty magnet. The wired version connects directly to your vehicle\'s power supply for continuous operation without ever needing to recharge.',
      },
      {
        q: 'How long does the battery last?',
        a: 'The battery model lasts 2–3 months on a single charge under typical use. Battery life depends on how frequently the device reports its location and how often it detects motion.',
      },
    ],
  },
  {
    category: 'Subscription & Billing',
    items: [
      {
        q: 'What does the monthly SIM plan include?',
        a: 'Your SIM plan covers unlimited location updates, all network data usage, and full access to the RooGPS platform — including live tracking, trip history, alerts, and support. There are no hidden fees or usage limits.',
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes. There are no lock-in contracts. You can cancel your subscription at any time from your account dashboard, and you will retain access until the end of your current billing period.',
      },
      {
        q: 'Is there a free trial?',
        a: 'Yes — when available, new subscribers receive free months on their SIM subscription before the standard rate applies. Check the pricing section on our homepage for current offers.',
      },
      {
        q: 'How does the yearly plan save me money?',
        a: 'The yearly plan is billed at $60/year — that works out to $5.00/month, saving you $11.88 compared to paying month-to-month at $5.99/month.',
      },
    ],
  },
  {
    category: 'Tracking & Features',
    items: [
      {
        q: 'How often does the tracker update its location?',
        a: 'The tracker sends location updates continuously while in motion. When stationary, it sends regular heartbeat pings to confirm it is still online. Update frequency can be adjusted in your device settings.',
      },
      {
        q: 'Does it work in remote areas?',
        a: 'Yes. Because RooGPS uses multi-carrier SIM technology, it automatically connects to whichever of Telstra, Optus, or Vodafone has the strongest signal at your location — significantly reducing dead zones compared to single-carrier trackers.',
      },
      {
        q: 'What are Geofence alerts?',
        a: 'Geofences let you draw a virtual boundary on the map. When your tracker enters or exits that zone, you receive an instant SMS or email notification. Useful for monitoring vehicles, machinery, or assets at a specific location.',
      },
      {
        q: 'How do WatchDog and Night Guard alerts work?',
        a: 'WatchDog alerts you the moment your tracker moves beyond a set speed or distance — great for detecting unauthorised movement. Night Guard monitors a defined zone overnight and alerts you if anything moves during the hours you set.',
      },
    ],
  },
  {
    category: 'Account & Privacy',
    items: [
      {
        q: 'Where is my data stored?',
        a: 'All your location data and account information is stored on servers hosted in Australia. We do not use overseas third-party tracking platforms.',
      },
      {
        q: 'Can I share access to my tracker with someone else?',
        a: 'At this time, each account manages its own devices. Multi-user sharing is on our roadmap. If you have a specific requirement, reach out to us and we can discuss options.',
      },
      {
        q: 'How do I reset my password?',
        a: 'Go to the login page and click "Forgot password". Enter your email address and we will send you a reset link within a few minutes. Check your spam folder if it does not arrive.',
      },
    ],
  },
];

export default function SupportPage() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [formState, setFormState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });

  function toggleFaq(key: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState('sending');
    try {
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setFormState('sent');
        setFormData({ name: '', email: '', subject: '', message: '' });
      } else {
        setFormState('error');
      }
    } catch {
      setFormState('error');
    }
  }

  return (
    <main className="marketing-page">
      <MarketingHeader />

      {/* ── Hero ── */}
      <section className="sup-hero">
        <div className="sup-hero-inner">
          <div className="sup-hero-badge">
            <HelpCircle size={14} aria-hidden />
            Support Centre
          </div>
          <h1 className="sup-hero-title">How can we help?</h1>
          <p className="sup-hero-sub">
            Australian-based support, same time zone. We reply fast.
          </p>
          <div className="sup-hero-stats">
            <div className="sup-stat">
              <Clock size={16} aria-hidden />
              <span>Typically replies within a few hours</span>
            </div>
            <div className="sup-stat-divider" aria-hidden />
            <div className="sup-stat">
              <Shield size={16} aria-hidden />
              <span>Australian team</span>
            </div>
            <div className="sup-stat-divider" aria-hidden />
            <div className="sup-stat">
              <Zap size={16} aria-hidden />
              <span>No call centres</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact + FAQ two-col ── */}
      <section className="marketing-section">
        <div className="sup-content-grid">

          {/* Contact form */}
          <div className="sup-contact-col">
            <div className="sup-contact-card">
              <div className="sup-contact-header">
                <div className="sup-contact-icon">
                  <Mail size={20} aria-hidden />
                </div>
                <div>
                  <h2 className="sup-contact-title">Send us a message</h2>
                  <p className="sup-contact-sub">We&apos;ll get back to you at <strong>hello@roogps.com</strong></p>
                </div>
              </div>

              {formState === 'sent' ? (
                <div className="sup-success">
                  <div className="sup-success-icon">
                    <Send size={22} aria-hidden />
                  </div>
                  <h3 className="sup-success-title">Message sent!</h3>
                  <p className="sup-success-body">
                    Thanks for reaching out. We&apos;ll reply to your email within a few hours.
                  </p>
                  <button
                    type="button"
                    className="sup-success-reset"
                    onClick={() => setFormState('idle')}
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form className="sup-form" onSubmit={handleSubmit} noValidate>
                  <div className="sup-form-row">
                    <div className="sup-form-group">
                      <label className="sup-label" htmlFor="sup-name">Your name</label>
                      <input
                        id="sup-name"
                        type="text"
                        className="sup-input"
                        placeholder="Jane Smith"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                      />
                    </div>
                    <div className="sup-form-group">
                      <label className="sup-label" htmlFor="sup-email">Email address</label>
                      <input
                        id="sup-email"
                        type="email"
                        className="sup-input"
                        placeholder="you@example.com"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="sup-form-group">
                    <label className="sup-label" htmlFor="sup-subject">Subject</label>
                    <input
                      id="sup-subject"
                      type="text"
                      className="sup-input"
                      placeholder="What can we help with?"
                      required
                      value={formData.subject}
                      onChange={(e) => setFormData((p) => ({ ...p, subject: e.target.value }))}
                    />
                  </div>
                  <div className="sup-form-group">
                    <label className="sup-label" htmlFor="sup-message">Message</label>
                    <textarea
                      id="sup-message"
                      className="sup-textarea"
                      rows={5}
                      placeholder="Describe your question or issue in as much detail as you like…"
                      required
                      value={formData.message}
                      onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                    />
                  </div>
                  {formState === 'error' && (
                    <p className="sup-form-error">
                      Something went wrong. Please try again or email us directly at hello@roogps.com
                    </p>
                  )}
                  <button
                    type="submit"
                    className="sup-submit-btn"
                    disabled={formState === 'sending'}
                  >
                    {formState === 'sending' ? (
                      <>
                        <span className="sup-spinner" aria-hidden /> Sending…
                      </>
                    ) : (
                      <>
                        <Send size={15} aria-hidden /> Send message
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Direct email card */}
            <a href="mailto:hello@roogps.com" className="sup-email-card">
              <div className="sup-email-card-icon">
                <MessageSquare size={18} aria-hidden />
              </div>
              <div>
                <p className="sup-email-card-label">Prefer to email directly?</p>
                <p className="sup-email-card-addr">hello@roogps.com</p>
              </div>
              <svg className="sup-email-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>

          {/* FAQ */}
          <div className="sup-faq-col">
            <div className="sup-faq-header">
              <h2 className="sup-faq-title">Frequently asked questions</h2>
              <p className="sup-faq-sub">Quick answers to common questions.</p>
            </div>

            {FAQS.map((cat) => (
              <div key={cat.category} className="sup-faq-cat">
                <h3 className="sup-faq-cat-title">{cat.category}</h3>
                {cat.items.map((item, i) => {
                  const key = `${cat.category}-${i}`;
                  const isOpen = openItems.has(key);
                  return (
                    <div key={key} className={`sup-faq-item${isOpen ? ' sup-faq-item--open' : ''}`}>
                      <button
                        type="button"
                        className="sup-faq-q"
                        onClick={() => toggleFaq(key)}
                        aria-expanded={isOpen}
                      >
                        <span>{item.q}</span>
                        <ChevronDown size={16} className="sup-faq-chevron" aria-hidden />
                      </button>
                      <div className="sup-faq-a-wrap">
                        <div className="sup-faq-a-inner">
                          <p className="sup-faq-a">{item.a}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="sup-faq-footer">
              <p>Still have questions?</p>
              <Link href="#contact" className="sup-faq-footer-link" onClick={() => document.querySelector('.sup-contact-card')?.scrollIntoView({ behavior: 'smooth' })}>
                Send us a message →
              </Link>
            </div>
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
              />
              <span>Australian Owned &amp; Supported</span>
            </div>
            <p className="marketing-footer-copy">© {new Date().getFullYear()} RooGPS</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
