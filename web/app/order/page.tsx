'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Logo from '@/components/Logo';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import {
  LayoutDashboard,
  MapPin,
  Route,
  CircleDot,
  Shield,
  Moon,
  Bell,
  Server,
  Wifi,
  Radio,
  Battery,
  Droplets,
  Package,
} from 'lucide-react';

type PricingMap = Record<string, { label: string; price_cents: number; sale_price_cents: number | null; period: string }>;
type SimPlan = 'monthly' | 'yearly';

function formatPrice(cents: number, period?: 'one-time' | 'month' | 'year') {
  const d = (cents / 100).toFixed(2);
  if (period === 'month') return `$${d} / month`;
  if (period === 'year') return `$${d} / year`;
  return `$${d}`;
}

function effectiveCents(p: { price_cents: number; sale_price_cents: number | null }): number {
  return p.sale_price_cents != null && p.sale_price_cents <= p.price_cents ? p.sale_price_cents : p.price_cents;
}

export default function OrderPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [pricing, setPricing] = useState<PricingMap | null>(null);
  const [simPlan, setSimPlan] = useState<SimPlan>('monthly');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherApplying, setVoucherApplying] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [appliedVoucher, setAppliedVoucher] = useState<{ voucher_id: string; discount_cents: number; message: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setSignedIn(!!user);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    fetch('/api/pricing', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPricing(data?.pricing ?? null))
      .catch(() => setPricing(null));
  }, []);

  const gps = pricing?.gps_tracker;
  const simMonthly = pricing?.sim_monthly;
  const simYearly = pricing?.sim_yearly;
  const gpsCents = gps ? effectiveCents(gps) : 4900;
  const monthlyCents = simMonthly ? effectiveCents(simMonthly) : 2999;
  const yearlyCents = simYearly ? effectiveCents(simYearly) : 24900;
  const simCents = simPlan === 'monthly' ? monthlyCents : yearlyCents;
  const saveVsMonthlyCents = Math.max(0, monthlyCents * 12 - yearlyCents);
  const gpsLabel = gps?.label ?? 'GPS Tracker';
  const simLabel = simPlan === 'monthly' ? (simMonthly?.label ?? 'SIM plan (monthly)') : (simYearly?.label ?? 'SIM plan (yearly)');
  const gpsPeriod = (gps?.period ?? 'one-time') as 'one-time' | 'month' | 'year';
  const simPeriod = simPlan === 'monthly' ? 'month' : 'year';

  const subtotalCents = gpsCents + simCents;
  const discountCents = appliedVoucher?.discount_cents ?? 0;
  const totalCents = Math.max(0, subtotalCents - discountCents);

  async function handleApplyVoucher() {
    const code = voucherCode.trim();
    if (!code) return;
    setVoucherError(null);
    setVoucherApplying(true);
    try {
      const items = [
        { product_sku: 'gps_tracker', quantity: 1, unit_price_cents: gpsCents },
        { product_sku: simPlan === 'monthly' ? 'sim_monthly' : 'sim_yearly', quantity: 1, unit_price_cents: simCents },
      ];
      const res = await fetch('/api/vouchers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal_cents: subtotalCents, items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.valid) {
        setVoucherError(data.error ?? 'Invalid code');
        setAppliedVoucher(null);
        return;
      }
      setAppliedVoucher({
        voucher_id: data.voucher_id,
        discount_cents: data.discount_cents,
        message: data.message ?? 'Discount applied',
      });
    } catch {
      setVoucherError('Could not validate code');
      setAppliedVoucher(null);
    } finally {
      setVoucherApplying(false);
    }
  }

  function handleRemoveVoucher() {
    setAppliedVoucher(null);
    setVoucherCode('');
    setVoucherError(null);
  }

  async function handleProceed() {
    if (!signedIn) {
      router.push('/login?redirect=' + encodeURIComponent('/order'));
      return;
    }
    setError(null);
    setCreating(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

    const items = [
      { product_sku: 'gps_tracker', quantity: 1 },
      { product_sku: simPlan === 'monthly' ? 'sim_monthly' : 'sim_yearly', quantity: 1 },
    ];

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          items,
          total_cents: totalCents,
          discount_cents: discountCents,
          voucher_id: appliedVoucher?.voucher_id ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Failed to create order');
      if (data.order?.id) router.push(`/order/pay?orderId=${encodeURIComponent(data.order.id)}`);
      else router.push('/account/orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="checkout-page">
        <div className="checkout-page-bg" aria-hidden="true" />
        <div className="app-loading">
          <AppLoadingIcon />
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div className="checkout-page-bg" aria-hidden="true" />
      <div className="checkout-wrap">
      <header className="checkout-header">
        <div className="checkout-header-inner">
          <Link href="/" className="checkout-header-logo">
            <Logo size={36} wide />
          </Link>
          <h1 className="checkout-title">Checkout</h1>
          <Link href="/track" className="checkout-back-link">← Back to dashboard</Link>
        </div>
        <p className="checkout-subtitle">Choose your hardware and SIM plan. Pay securely with Stripe; one upfront payment, then SIM renews monthly or yearly.</p>
      </header>

      <div className="checkout-grid">
        <section className="checkout-main">
          <div className="checkout-card checkout-card--order">
            <h2 className="checkout-card-heading">Your order</h2>
            <p className="checkout-card-desc">Hardware and connectivity in one place.</p>
            <div className="checkout-product">
              <div className="checkout-product-info">
                <span className="checkout-product-name">{gpsLabel}</span>
                <span className="checkout-product-detail">Hardware included · Ready to track</span>
              </div>
              <span className="checkout-product-price">
                {gps && gps.sale_price_cents != null && gps.sale_price_cents < gps.price_cents ? (
                  <>
                    <span className="checkout-price-old">{formatPrice(gps.price_cents, gpsPeriod)}</span>{' '}
                    <span className="checkout-price-sale">{formatPrice(gpsCents, gpsPeriod)}</span>
                  </>
                ) : (
                  formatPrice(gpsCents, gpsPeriod)
                )}
              </span>
            </div>
            <div className="checkout-divider" />
            <div className="checkout-voucher">
              <label className="checkout-voucher-label">Discount code</label>
              <div className="checkout-voucher-row">
                <input
                  type="text"
                  className={`checkout-voucher-input${voucherError ? ' checkout-voucher-input--error' : ''}`}
                  value={voucherCode}
                  onChange={(e) => { setVoucherCode(e.target.value); setVoucherError(null); }}
                  placeholder="Enter code"
                  disabled={!!appliedVoucher}
                />
                {appliedVoucher ? (
                  <button type="button" className="admin-btn checkout-voucher-btn" onClick={handleRemoveVoucher}>
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary checkout-voucher-btn"
                    onClick={handleApplyVoucher}
                    disabled={voucherApplying || !voucherCode.trim()}
                  >
                    {voucherApplying ? 'Applying…' : 'Apply'}
                  </button>
                )}
              </div>
              {voucherError && <p className="checkout-voucher-error">Invalid or expired</p>}
              {appliedVoucher && <p className="checkout-voucher-applied">{appliedVoucher.message}</p>}
            </div>
            <div className="checkout-divider" />
            {discountCents > 0 && (
              <div className="checkout-discount-row">
                <span>Discount</span>
                <span className="checkout-discount-value">−{formatPrice(discountCents)}</span>
              </div>
            )}
            <button
              type="button"
              className="admin-btn admin-btn--primary checkout-btn"
              onClick={handleProceed}
              disabled={creating}
            >
              {creating ? 'Creating order…' : signedIn ? 'Create order' : 'Sign in to order'}
            </button>
            {!signedIn && (
              <p className="checkout-signup">
                New? <Link href="/register?redirect=/order">Sign up</Link> first.
              </p>
            )}
          </div>

          <div className="checkout-card checkout-card--features">
            <h2 className="checkout-card-heading checkout-features-title">What you get</h2>
            <div className="checkout-features-block">
              <h3 className="checkout-features-sub">
                <span className="checkout-features-sub-icon"><LayoutDashboard size={18} strokeWidth={2} aria-hidden /></span>
                Dashboard
              </h3>
              <ul className="checkout-features-list">
                <li><span className="checkout-features-icon"><MapPin size={18} strokeWidth={2} aria-hidden /></span>Real-time map & live location</li>
                <li><span className="checkout-features-icon"><Route size={18} strokeWidth={2} aria-hidden /></span>Trip history with route replay, distance & duration</li>
                <li><span className="checkout-features-icon"><CircleDot size={18} strokeWidth={2} aria-hidden /></span>Geofences (keep in / keep out)</li>
                <li><span className="checkout-features-icon"><Shield size={18} strokeWidth={2} aria-hidden /></span>WatchDog mode – alert if tracker moves (speed or distance)</li>
                <li><span className="checkout-features-icon"><Moon size={18} strokeWidth={2} aria-hidden /></span>Night Guard – alert if tracker moves outside zone at night</li>
                <li><span className="checkout-features-icon"><Bell size={18} strokeWidth={2} aria-hidden /></span>Battery & SMS notifications</li>
                <li><span className="checkout-features-icon"><Server size={18} strokeWidth={2} aria-hidden /></span>Australian servers & local support</li>
                <li><span className="checkout-features-icon"><Wifi size={18} strokeWidth={2} aria-hidden /></span>Unlimited data, multi-carrier SIM</li>
              </ul>
            </div>
            <div className="checkout-features-block">
              <h3 className="checkout-features-sub">
                <span className="checkout-features-sub-icon"><Radio size={18} strokeWidth={2} aria-hidden /></span>
                GPS tracker
              </h3>
              <ul className="checkout-features-list">
                <li><span className="checkout-features-icon"><Radio size={18} strokeWidth={2} aria-hidden /></span>Real-time tracking</li>
                <li><span className="checkout-features-icon"><Battery size={18} strokeWidth={2} aria-hidden /></span>6+ months battery life</li>
                <li><span className="checkout-features-icon"><Droplets size={18} strokeWidth={2} aria-hidden /></span>IP65 waterproof · wireless & magnet mount</li>
                <li><span className="checkout-features-icon"><Package size={18} strokeWidth={2} aria-hidden /></span>Pre-configured, ready to use</li>
              </ul>
            </div>
          </div>
        </section>

        <aside className="checkout-sidebar">
          <div className="checkout-sim-card">
            <h3 className="checkout-sim-heading">SIM plan</h3>
            <div className="checkout-sim-toggle-wrap">
              <button
                type="button"
                className={'checkout-toggle-btn' + (simPlan === 'monthly' ? ' checkout-toggle-btn--active' : '')}
                onClick={() => setSimPlan('monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                className={'checkout-toggle-btn' + (simPlan === 'yearly' ? ' checkout-toggle-btn--active' : '')}
                onClick={() => setSimPlan('yearly')}
              >
                Yearly
              </button>
            </div>
            <p className="checkout-sim-price">
              {simPlan === 'monthly'
                ? formatPrice(simCents, 'month')
                : formatPrice(simCents, 'year')}
            </p>
            {simPlan === 'yearly' && (
              <p className="checkout-sim-note">
                Billed once per year.
                {saveVsMonthlyCents > 0 && (
                  <> Save {formatPrice(saveVsMonthlyCents)} vs monthly.</>
                )}
              </p>
            )}
          </div>
          <div className="checkout-summary-card">
            <h2 className="checkout-summary-title">Review your order</h2>
            <ul className="checkout-summary-list">
              <li className="checkout-summary-item">
                <span>{gpsLabel}</span>
                <span>{formatPrice(gpsCents, gpsPeriod)}</span>
              </li>
              <li className="checkout-summary-item">
                <span>{simLabel}</span>
                <span>{simPlan === 'monthly' ? formatPrice(simCents, 'month') : formatPrice(simCents, 'year')}</span>
              </li>
            </ul>
            <div className="checkout-summary-divider" />
            {discountCents > 0 && (
              <div className="checkout-summary-discount">
                <span>Discount</span>
                <span>−{formatPrice(discountCents)}</span>
              </div>
            )}
            <div className="checkout-summary-total">
              <span>Total</span>
              <span>{formatPrice(totalCents)}</span>
            </div>
            <p className="checkout-summary-secure">Pay with Stripe at the next step. Your card is charged once for the full amount; SIM renews at the monthly or yearly rate.</p>
          </div>
        </aside>
      </div>

      {error && <p className="checkout-error">{error}</p>}
      </div>
    </div>
  );
}
