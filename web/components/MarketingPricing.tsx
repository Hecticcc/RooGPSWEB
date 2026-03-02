'use client';

import { useEffect, useState } from 'react';

type PricingMap = Record<string, { label: string; price_cents: number; sale_price_cents: number | null; period: string }>;

function effectiveCents(p: { price_cents: number; sale_price_cents: number | null }): number {
  return p.sale_price_cents != null && p.sale_price_cents <= p.price_cents ? p.sale_price_cents : p.price_cents;
}

const DEFAULTS = {
  gps: 4900,
  simMonthly: 2999,
  simYearly: 24900,
};

export default function MarketingPricing() {
  const [pricing, setPricing] = useState<PricingMap | null>(null);

  useEffect(() => {
    fetch('/api/pricing', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPricing(data?.pricing ?? null))
      .catch(() => setPricing(null));
  }, []);

  const gps = pricing?.gps_tracker;
  const simMonthly = pricing?.sim_monthly;
  const simYearly = pricing?.sim_yearly;
  const gpsCents = gps ? effectiveCents(gps) : DEFAULTS.gps;
  const monthlyCents = simMonthly ? effectiveCents(simMonthly) : DEFAULTS.simMonthly;
  const yearlyCents = simYearly ? effectiveCents(simYearly) : DEFAULTS.simYearly;
  const gpsHasSale = gps && gps.sale_price_cents != null && gps.sale_price_cents < gps.price_cents;
  const monthlyHasSale = simMonthly && simMonthly.sale_price_cents != null && simMonthly.sale_price_cents < simMonthly.price_cents;
  const yearlyHasSale = simYearly && simYearly.sale_price_cents != null && simYearly.sale_price_cents < simYearly.price_cents;

  const yearlyPerMonth = Math.round(yearlyCents / 12);
  const saveVsMonthly = monthlyCents * 12 - yearlyCents;

  const hardwareLabel = gps?.label?.trim() || 'Hardware';
  const monthlyLabel = simMonthly?.label?.trim() || 'Monthly';
  const yearlyLabel = simYearly?.label?.trim() || 'Yearly';

  return (
    <div className="marketing-pricing-tray">
      {/* GPS / hardware – main focus */}
      <div className="marketing-price-hardware-block">
        <div className="marketing-price-hardware-label">GPS Tracker</div>
        <div className="marketing-price-hardware-amount">
          {gpsHasSale && (
            <span className="marketing-price-was marketing-price-was--hero">
              ${(gps!.price_cents / 100).toFixed(0)}
            </span>
          )}
          <span className="marketing-price-currency marketing-price-currency--hero">$</span>
          <span className="marketing-price-hardware-number">
            {(gpsCents / 100).toFixed(gpsCents % 100 === 0 ? 0 : 2)}
          </span>
        </div>
        <div className="marketing-price-hardware-note">one-time · device included</div>
      </div>

      {/* SIM plan – required, choose one (more subtle) */}
      <div className="marketing-price-sim-group">
        <p className="marketing-price-sim-heading">SIM plan required — choose one</p>
        <div className="marketing-pricing-grid marketing-pricing-grid--sim">
          <div className="marketing-price-card marketing-price-card--sim">
            <div className="marketing-price-card-label">{monthlyLabel}</div>
            <div className="marketing-price-card-amount marketing-price-card-amount--sim">
              {monthlyHasSale && (
                <span className="marketing-price-was">
                  ${((simMonthly!.price_cents) / 100).toFixed(2)}
                </span>
              )}
              <span className="marketing-price-currency">$</span>
              {(monthlyCents / 100).toFixed(2)}
              <span className="marketing-price-period">/month</span>
            </div>
          </div>
          <div className="marketing-price-card marketing-price-card--sim marketing-price-card-featured">
            <div className="marketing-price-badge">Best value</div>
            <div className="marketing-price-card-label">{yearlyLabel}</div>
            <div className="marketing-price-card-amount marketing-price-card-amount--sim">
              {yearlyHasSale && (
                <span className="marketing-price-was">
                  ${((simYearly!.price_cents) / 12 / 100).toFixed(2)}/mo
                </span>
              )}
              <span className="marketing-price-currency">$</span>
              {(yearlyPerMonth / 100).toFixed(2)}
              <span className="marketing-price-period">/month</span>
            </div>
            <div className="marketing-price-card-note">${(yearlyCents / 100).toFixed(0)} billed yearly</div>
            {saveVsMonthly > 0 && (
              <div className="marketing-price-save">Save ${(saveVsMonthly / 100).toFixed(2)}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
