import {
  MapPin, Route, CircleDot, Shield, Bell, Link2,
  BadgeCheck, Headphones, Package, Monitor, Radio, BatteryFull,
  RotateCcw, History, BatteryCharging, Wifi, Siren, ChevronDown,
} from 'lucide-react';

const FEATURES = [
  { icon: MapPin,          text: 'Live location' },
  { icon: Route,           text: 'Trip history' },
  { icon: RotateCcw,       text: 'Trip replay' },
  { icon: History,         text: 'Location history' },
  { icon: CircleDot,       text: 'Geofence alerts' },
  { icon: Shield,          text: 'WatchDog & Night Guard' },
  { icon: Siren,           text: 'Emergency mode' },
  { icon: Bell,            text: 'SMS & battery alerts' },
  { icon: BatteryCharging, text: 'Battery monitoring' },
  { icon: Wifi,            text: 'Network intelligence' },
  { icon: Link2,           text: 'Shareable links' },
  { icon: BadgeCheck,      text: 'Insurance-friendly' },
  { icon: Headphones,      text: 'AU support' },
  { icon: Package,         text: 'Ready to use' },
  { icon: Monitor,         text: 'Any device' },
  { icon: Radio,           text: 'Real-time tracking' },
  { icon: BatteryFull,     text: '2–3 month battery' },
];

export default function MarketingFeaturesExpand() {
  return (
    <details className="mkt-feat-expand">
      <summary className="mkt-feat-expand-toggle">
        <span>All features included</span>
        <ChevronDown size={14} className="mkt-feat-expand-chevron" />
      </summary>

      <div className="mkt-feat-expand-body">
        <div className="mkt-feat-expand-list">
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} className="mkt-feat-expand-item">
              <Icon size={13} strokeWidth={2} />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
