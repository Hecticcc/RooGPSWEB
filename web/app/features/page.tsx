'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import {
  MapPin, Route, Shield, Bell, Link2, BatteryFull,
  Radio, CircleDot, Moon, ArrowLeft, ChevronRight,
} from 'lucide-react';

const FEATURES = [
  {
    id: 'map',
    icon: MapPin,
    label: 'Live Map',
    title: 'Real-time location, always',
    desc: 'See exactly where your tracker is right now. The live map updates continuously and shows the last known address, GPS lock status, and how long ago data was received. Switch between dark and satellite views.',
    points: ['Continuous live updates', 'Reverse geocoded address', 'Dark & satellite map modes', 'Multi-device overview'],
    mockup: 'map',
  },
  {
    id: 'trips',
    icon: Route,
    label: 'Trip History',
    title: 'Every journey, recorded',
    desc: 'Browse a full log of past trips with start and end times, distance, and duration. Replay any route on the map to see the exact path taken, with speed data at each point along the way.',
    points: ['Full route replay', 'Distance & duration', 'Start & end locations', 'Speed at each point'],
    mockup: 'trips',
  },
  {
    id: 'alerts',
    icon: Shield,
    label: 'Smart Alerts',
    title: 'Know the moment something moves',
    desc: 'WatchDog mode alerts you if your tracker moves beyond a set speed or distance. Night Guard watches a zone overnight. Geofences trigger when a device enters or exits an area.',
    points: ['WatchDog — speed or distance trigger', 'Night Guard — overnight zone watch', 'Geofences — enter / exit zones', 'SMS & email delivery'],
    mockup: 'alerts',
  },
  {
    id: 'signal',
    icon: Radio,
    label: 'Signal & Battery',
    title: 'Know the health of your device',
    desc: 'Monitor battery level with a visual status and voltage reading. See which carrier the SIM is connected to and how strong the signal has been over time — so you always know your tracker is healthy.',
    points: ['Battery level & voltage', 'Carrier & signal strength', 'Historical signal chart', 'Low-battery notifications'],
    mockup: 'signal',
  },
  {
    id: 'share',
    icon: Link2,
    label: 'Shareable Links',
    title: 'Share live location instantly',
    desc: 'Generate a shareable link and send it to family, friends, or anyone who needs to see where your device is. Links work in any browser — no app or account needed for the viewer.',
    points: ['No app needed for viewer', 'Works on any device', 'One-click link generation', 'Full live map for recipient'],
    mockup: 'share',
  },
];

function MapMockup() {
  return (
    <div className="sf-mockup sf-mockup--map">
      <svg className="sf-map-svg" viewBox="0 0 480 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="sf-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(249,115,22,0.06)" strokeWidth="0.6"/>
          </pattern>
          <radialGradient id="sf-glow" cx="50%" cy="45%" r="40%">
            <stop offset="0%" stopColor="rgba(249,115,22,0.12)"/>
            <stop offset="100%" stopColor="transparent"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="#16141a"/>
        <rect width="100%" height="100%" fill="url(#sf-grid)"/>
        <rect width="100%" height="100%" fill="url(#sf-glow)"/>
        {/* Roads */}
        <path d="M 0 150 Q 120 120 240 150 T 480 140" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
        <path d="M 240 0 L 240 300" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6"/>
        <path d="M 0 200 Q 200 180 480 210" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5"/>
        {/* Trip path */}
        <path d="M 60 240 Q 140 180 240 150 T 400 100" fill="none" stroke="rgba(249,115,22,0.5)" strokeWidth="2.5" strokeDasharray="7 5"/>
        {/* Pulse rings */}
        <circle cx="240" cy="150" r="28" fill="rgba(249,115,22,0.07)"/>
        <circle cx="240" cy="150" r="18" fill="rgba(249,115,22,0.12)"/>
        {/* Car pin */}
        <circle cx="240" cy="150" r="10" fill="#f97316"/>
        <path d="M 234 150 h 12 M 237 146 l 3-4 3 4" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      </svg>
      {/* Floating info card */}
      <div className="sf-map-card">
        <div className="sf-map-card-row">
          <span className="sf-map-card-label">Last seen</span>
          <span className="sf-map-card-val">2 min ago</span>
        </div>
        <div className="sf-map-card-row">
          <span className="sf-map-card-label">Address</span>
          <span className="sf-map-card-val sf-map-card-val--addr">123 Example St, Melbourne VIC</span>
        </div>
        <div className="sf-map-card-row">
          <span className="sf-map-card-label">GPS lock</span>
          <span className="sf-map-card-val sf-map-card-val--green">Yes</span>
        </div>
      </div>
      {/* Status pill */}
      <div className="sf-status-pill sf-status-pill--online">
        <span className="sf-status-dot"/>Online
      </div>
    </div>
  );
}

function TripsMockup() {
  const trips = [
    { date: 'Today, 8:14 am', from: 'Home', to: 'Work', dist: '18.4 km', dur: '27 min', active: true },
    { date: 'Yesterday, 5:42 pm', from: 'Work', to: 'Shops', dist: '4.1 km', dur: '9 min', active: false },
    { date: 'Yesterday, 8:02 am', from: 'Home', to: 'Work', dist: '18.4 km', dur: '31 min', active: false },
    { date: 'Mon, 6:20 pm', from: 'Work', to: 'Home', dist: '18.7 km', dur: '34 min', active: false },
  ];
  return (
    <div className="sf-mockup sf-mockup--trips">
      <div className="sf-trips-header">
        <span className="sf-trips-title">Trip history</span>
        <span className="sf-trips-count">24 trips this month</span>
      </div>
      <div className="sf-trips-list">
        {trips.map((t) => (
          <div key={t.date} className={`sf-trip-row${t.active ? ' sf-trip-row--active' : ''}`}>
            <div className="sf-trip-route-vis">
              <span className="sf-trip-dot sf-trip-dot--start"/>
              <span className="sf-trip-line"/>
              <span className="sf-trip-dot sf-trip-dot--end"/>
            </div>
            <div className="sf-trip-info">
              <div className="sf-trip-stops">
                <span>{t.from}</span>
                <ChevronRight size={11} className="sf-trip-arrow"/>
                <span>{t.to}</span>
              </div>
              <span className="sf-trip-meta">{t.date} · {t.dist} · {t.dur}</span>
            </div>
            {t.active && <span className="sf-trip-replay">Replay</span>}
          </div>
        ))}
      </div>
      <div className="sf-trips-stats">
        <div className="sf-trips-stat"><span className="sf-trips-stat-val">318 km</span><span className="sf-trips-stat-label">This month</span></div>
        <div className="sf-trips-stat"><span className="sf-trips-stat-val">7h 22m</span><span className="sf-trips-stat-label">Drive time</span></div>
        <div className="sf-trips-stat"><span className="sf-trips-stat-val">24</span><span className="sf-trips-stat-label">Trips</span></div>
      </div>
    </div>
  );
}

function AlertsMockup() {
  return (
    <div className="sf-mockup sf-mockup--alerts">
      <div className="sf-alerts-header">
        <Bell size={15} strokeWidth={2}/>
        <span>Smart Alerts</span>
      </div>
      <div className="sf-alert-cards">
        <div className="sf-alert-card sf-alert-card--active">
          <div className="sf-alert-card-top">
            <Shield size={16} strokeWidth={2} className="sf-alert-icon"/>
            <div>
              <div className="sf-alert-name">WatchDog</div>
              <div className="sf-alert-desc">Alert if moves &gt; 50 m</div>
            </div>
            <div className="sf-toggle sf-toggle--on"/>
          </div>
          <div className="sf-alert-status sf-alert-status--ok">Armed</div>
        </div>
        <div className="sf-alert-card">
          <div className="sf-alert-card-top">
            <Moon size={16} strokeWidth={2} className="sf-alert-icon"/>
            <div>
              <div className="sf-alert-name">Night Guard</div>
              <div className="sf-alert-desc">10pm – 6am · 200 m zone</div>
            </div>
            <div className="sf-toggle sf-toggle--on"/>
          </div>
          <div className="sf-alert-status sf-alert-status--ok">Active</div>
        </div>
        <div className="sf-alert-card">
          <div className="sf-alert-card-top">
            <CircleDot size={16} strokeWidth={2} className="sf-alert-icon"/>
            <div>
              <div className="sf-alert-name">Geofence</div>
              <div className="sf-alert-desc">Home zone · on exit</div>
            </div>
            <div className="sf-toggle"/>
          </div>
        </div>
        <div className="sf-alert-card">
          <div className="sf-alert-card-top">
            <BatteryFull size={16} strokeWidth={2} className="sf-alert-icon"/>
            <div>
              <div className="sf-alert-name">Low battery</div>
              <div className="sf-alert-desc">Alert below 20%</div>
            </div>
            <div className="sf-toggle sf-toggle--on"/>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalMockup() {
  const bars = [12, 15, 14, 16, 17, 15, 16, 14, 17, 18, 16, 17];
  const maxB = Math.max(...bars);
  return (
    <div className="sf-mockup sf-mockup--signal">
      <div className="sf-signal-top">
        <div className="sf-battery-ring">
          <svg viewBox="0 0 80 80" width="80" height="80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
            <circle cx="40" cy="40" r="34" fill="none" stroke="#22c55e" strokeWidth="6"
              strokeDasharray={`${213 * 0.78} 213`} strokeLinecap="round"
              transform="rotate(-90 40 40)"/>
          </svg>
          <div className="sf-battery-ring-inner">
            <span className="sf-battery-pct">78%</span>
            <span className="sf-battery-lbl">Battery</span>
          </div>
        </div>
        <div className="sf-signal-info">
          <div className="sf-signal-row"><span className="sf-signal-key">Carrier</span><span className="sf-signal-val" style={{color:'#fecd07'}}>Optus</span></div>
          <div className="sf-signal-row"><span className="sf-signal-key">Voltage</span><span className="sf-signal-val">3.98 V</span></div>
          <div className="sf-signal-row"><span className="sf-signal-key">Status</span><span className="sf-signal-val sf-signal-val--green">High</span></div>
          <div className="sf-signal-row"><span className="sf-signal-key">CSQ</span><span className="sf-signal-val">17</span></div>
        </div>
      </div>
      <div className="sf-signal-chart-label">Signal history</div>
      <div className="sf-signal-chart">
        {bars.map((b, i) => (
          <div key={i} className="sf-signal-bar-wrap">
            <div className="sf-signal-bar" style={{height: `${(b/maxB)*100}%`, opacity: i === bars.length-1 ? 1 : 0.5 + (i/bars.length)*0.5}}/>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShareMockup() {
  return (
    <div className="sf-mockup sf-mockup--share">
      <div className="sf-share-device">
        <div className="sf-share-device-dot"/>
        <div>
          <div className="sf-share-device-name">Car · RG-B1</div>
          <div className="sf-share-device-sub">Online · 2 min ago</div>
        </div>
      </div>
      <div className="sf-share-link-card">
        <div className="sf-share-link-label">Shareable link</div>
        <div className="sf-share-link-row">
          <span className="sf-share-link-url">track.roogps.com/s/abc123</span>
          <button className="sf-share-copy-btn" type="button">Copy</button>
        </div>
        <div className="sf-share-link-hint">Anyone with this link can view the live location — no account needed.</div>
      </div>
      <div className="sf-share-preview">
        <div className="sf-share-preview-label">Recipient sees</div>
        <div className="sf-share-preview-card">
          <svg viewBox="0 0 260 110" xmlns="http://www.w3.org/2000/svg" style={{width:'100%', height:'auto', borderRadius:8}}>
            <rect width="100%" height="100%" fill="#16141a"/>
            <rect width="100%" height="100%" fill="url(#sf-grid)"/>
            <path d="M 30 80 Q 100 50 130 55 T 230 35" fill="none" stroke="rgba(249,115,22,0.4)" strokeWidth="2" strokeDasharray="5 4"/>
            <circle cx="130" cy="55" r="14" fill="rgba(249,115,22,0.12)"/>
            <circle cx="130" cy="55" r="7" fill="#f97316"/>
            <rect x="70" y="68" width="110" height="28" rx="5" fill="rgba(25,23,30,0.95)" stroke="rgba(249,115,22,0.2)" strokeWidth="1"/>
            <rect x="78" y="74" width="55" height="4" rx="2" fill="#e4e4e7" opacity="0.7"/>
            <rect x="78" y="83" width="35" height="3" rx="2" fill="#71717a" opacity="0.5"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

const MOCKUPS: Record<string, React.ReactNode> = {
  map: <MapMockup />,
  trips: <TripsMockup />,
  alerts: <AlertsMockup />,
  signal: <SignalMockup />,
  share: <ShareMockup />,
};

const AUTO_CYCLE_MS = 4500;

export default function FeaturesPage() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function goTo(idx: number) {
    if (idx === active) return;
    setAnimating(true);
    setTimeout(() => {
      setActive(idx);
      setAnimating(false);
    }, 180);
  }

  useEffect(() => {
    if (paused) return;
    timerRef.current = setTimeout(() => {
      const next = (active + 1) % FEATURES.length;
      goTo(next);
    }, AUTO_CYCLE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active, paused]);

  const feat = FEATURES[active];

  return (
    <div className="sf-page">
      {/* Nav */}
      <header className="sf-nav">
        <Link href="/" className="sf-nav-logo">
          <Logo size={28} wide />
        </Link>
        <nav className="sf-nav-links">
          <Link href="/" className="sf-nav-link">
            <ArrowLeft size={14} aria-hidden /> Home
          </Link>
          <Link href="/order" className="sf-nav-cta">Get started</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="sf-hero">
        <span className="sf-hero-eyebrow">Dashboard overview</span>
        <h1 className="sf-hero-title">Everything you need, nothing you don&apos;t</h1>
        <p className="sf-hero-sub">A custom-built dashboard designed around how real people use GPS tracking. Simple, fast, and powerful.</p>
      </section>

      {/* Interactive showcase */}
      <section
        className="sf-showcase"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="sf-showcase-inner">

          {/* Tab nav */}
          <div className="sf-tabs" role="tablist">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={i === active}
                  className={`sf-tab${i === active ? ' sf-tab--active' : ''}`}
                  onClick={() => { setPaused(true); goTo(i); }}
                  type="button"
                >
                  <Icon size={16} aria-hidden strokeWidth={2} />
                  <span>{f.label}</span>
                  {i === active && <span className="sf-tab-indicator" aria-hidden />}
                </button>
              );
            })}
            {/* Progress bar */}
            <div className="sf-tabs-progress" aria-hidden>
              <div
                className="sf-tabs-progress-fill"
                style={{ animationDuration: `${AUTO_CYCLE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                key={`${active}-${paused}`}
              />
            </div>
          </div>

          {/* Content */}
          <div className={`sf-content${animating ? ' sf-content--out' : ''}`}>
            <div className="sf-content-left">
              <div className="sf-feature-label">
                <feat.icon size={18} strokeWidth={2} aria-hidden />
                {feat.label}
              </div>
              <h2 className="sf-feature-title">{feat.title}</h2>
              <p className="sf-feature-desc">{feat.desc}</p>
              <ul className="sf-feature-points">
                {feat.points.map((p) => (
                  <li key={p}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
                    {p}
                  </li>
                ))}
              </ul>
              <Link href="/order" className="sf-feature-cta">
                Get started <ChevronRight size={15} aria-hidden />
              </Link>
            </div>
            <div className="sf-content-right">
              <div className="sf-device-frame">
                <div className="sf-device-frame-chrome">
                  <div className="sf-device-frame-dots">
                    <span/><span/><span/>
                  </div>
                  <div className="sf-device-frame-url">track.roogps.com</div>
                  <div/>
                </div>
                <div className="sf-device-frame-screen">
                  {MOCKUPS[feat.mockup]}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="sf-bottom-cta">
        <h2 className="sf-bottom-cta-title">Ready to protect what matters?</h2>
        <p className="sf-bottom-cta-sub">One device. Everything included. Ships in 1–3 business days.</p>
        <div className="sf-bottom-cta-actions">
          <Link href="/order" className="sf-bottom-btn sf-bottom-btn--primary">Order now</Link>
          <Link href="/" className="sf-bottom-btn">Back to home</Link>
        </div>
      </section>
    </div>
  );
}
