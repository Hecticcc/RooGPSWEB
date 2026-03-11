'use client';

import { useEffect, useState } from 'react';

type Pricing = { price_cents: number; sale_price_cents: number | null };

function effectiveCents(p: Pricing) {
  return p.sale_price_cents != null && p.sale_price_cents <= p.price_cents
    ? p.sale_price_cents
    : p.price_cents;
}

export default function MarketingDevicePrice() {
  const [gps, setGps] = useState<Pricing | null>(null);

  useEffect(() => {
    fetch('/api/pricing', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGps(d?.pricing?.gps_tracker ?? null))
      .catch(() => {});
  }, []);

  const cents = gps ? effectiveCents(gps) : 12000;
  const hasSale = gps && gps.sale_price_cents != null && gps.sale_price_cents < gps.price_cents;

  return (
    <div className="mkt-device-price-card">
      <div className="mkt-device-price-left">
        <span className="mkt-device-price-label">Device</span>
        <span className="mkt-device-price-note">One-time · SIM card included</span>
      </div>
      <div className="mkt-device-price-right">
        {hasSale && (
          <span className="mkt-device-price-was">
            ${(gps!.price_cents / 100).toFixed(0)}
          </span>
        )}
        <span className="mkt-device-price-amount">
          <sup>$</sup>
          {(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}
        </span>
      </div>
    </div>
  );
}
