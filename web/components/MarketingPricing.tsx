'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type PricingMap = Record<string, { label: string; price_cents: number; sale_price_cents: number | null; period: string }>;
type TrialOffer = { trial_enabled: boolean; trial_months: number | null };

function effectiveCents(p: { price_cents: number; sale_price_cents: number | null }): number {
  return p.sale_price_cents != null && p.sale_price_cents <= p.price_cents ? p.sale_price_cents : p.price_cents;
}

export default function MarketingPricing() {
  const [pricing, setPricing] = useState<PricingMap | null>(null);
  const [trialOffer, setTrialOffer] = useState<TrialOffer | null>(null);

  useEffect(() => {
    fetch('/api/pricing', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPricing(data?.pricing ?? null))
      .catch(() => setPricing(null));
  }, []);

  useEffect(() => {
    fetch('/api/trial-offer', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTrialOffer(data ?? null))
      .catch(() => setTrialOffer(null));
  }, []);

  const simMonthly = pricing?.sim_monthly;
  const simYearly = pricing?.sim_yearly;
  const monthlyCents = simMonthly ? effectiveCents(simMonthly) : 599;
  const yearlyCents = simYearly ? effectiveCents(simYearly) : 6000;
  const yearlyHasSale = simYearly && simYearly.sale_price_cents != null && simYearly.sale_price_cents < simYearly.price_cents;
  const monthlyHasSale = simMonthly && simMonthly.sale_price_cents != null && simMonthly.sale_price_cents < simMonthly.price_cents;

  const yearlyPerMonth = Math.round(yearlyCents / 12);
  const saveVsMonthly = monthlyCents * 12 - yearlyCents;

  const monthlyLabel = simMonthly?.label?.trim() || 'Monthly';
  const yearlyLabel = simYearly?.label?.trim() || 'Yearly';
  const showTrial = trialOffer?.trial_enabled && (trialOffer?.trial_months ?? 0) > 0;
  const trialMonths = trialOffer?.trial_months ?? 0;

  return (
    <div className="mkt-sim-section">

      {/* Trial banner – shown above plans when active */}
      {showTrial && (
        <div className="mkt-trial-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
          <strong>{trialMonths === 1 ? '1 month' : `${trialMonths} months`} free</strong>
          <span>on SIM subscription — then standard rate</span>
        </div>
      )}

      {/* Section header */}
      <div className="mkt-sim-header">
        <span className="mkt-sim-label">+ SIM plan required</span>
      </div>

      {/* Compact plan row */}
      <div className="mkt-sim-plans">
        <div className="mkt-sim-plan">
          <div className="mkt-sim-plan-top">
            <span className="mkt-sim-plan-name">{monthlyLabel}</span>
          </div>
          <div className="mkt-sim-plan-price">
            {monthlyHasSale && (
              <s className="mkt-sim-plan-was">${((simMonthly!.price_cents) / 100).toFixed(2)}</s>
            )}
            <span className="mkt-sim-plan-amount">${(monthlyCents / 100).toFixed(2)}</span>
            <span className="mkt-sim-plan-period">/mo</span>
          </div>
        </div>

        <div className="mkt-sim-plan mkt-sim-plan--best">
          <div className="mkt-sim-plan-top">
            <span className="mkt-sim-plan-name">{yearlyLabel}</span>
            <span className="mkt-sim-best-badge">Best value</span>
          </div>
          <div className="mkt-sim-plan-price">
            {yearlyHasSale && (
              <s className="mkt-sim-plan-was">${(simYearly!.price_cents / 100).toFixed(0)}</s>
            )}
            <span className="mkt-sim-plan-amount">${(yearlyCents / 100).toFixed(0)}</span>
            <span className="mkt-sim-plan-period">/yr</span>
          </div>
          <div className="mkt-sim-plan-sub">Just ${(yearlyPerMonth / 100).toFixed(2)}/mo</div>
          {saveVsMonthly > 0 && (
            <div className="mkt-sim-plan-save">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
              Save ${(saveVsMonthly / 100).toFixed(2)} a year
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      <Link href="/order" className="mkt-order-btn">
        Order now
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </Link>
      <p className="mkt-order-note">No hidden fees · Cancel anytime · 1-year warranty</p>
    </div>
  );
}
