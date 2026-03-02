'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '../AdminAuthContext';
import { DollarSign } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';

type PricingRow = {
  sku: string;
  label: string;
  price_cents: number;
  sale_price_cents: number | null;
  period: string;
  updated_at?: string;
};

/** Format cents as AUD string for display in input (e.g. "49.00") */
function centsToDollarInput(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

/** Parse dollar string to cents (e.g. "49.00" or "29.99" -> 4990, 2999) */
function dollarInputToCents(value: string): number | null {
  const trimmed = value.trim().replace(/^\$?\s*/, '');
  if (trimmed === '') return null;
  const num = parseFloat(trimmed);
  if (Number.isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

/** Format cents as AUD for display (e.g. "$49.00") */
function formatAUD(cents: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

const PERIOD_OPTIONS = [
  { value: 'one-time', label: 'One-time' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
] as const;

export default function AdminPricingPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [priceInputs, setPriceInputs] = useState<Record<string, { price: string; sale: string }>>({});

  function load() {
    setLoading(true);
    setError(null);
    fetch('/api/admin/pricing', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Forbidden' : 'Failed to load');
        return r.json();
      })
      .then((data) => {
        const list = data.pricing ?? [];
        setRows(list);
        const next: Record<string, { price: string; sale: string }> = {};
        for (const r of list) {
          next[r.sku] = {
            price: centsToDollarInput(r.price_cents),
            sale: centsToDollarInput(r.sale_price_cents),
          };
        }
        setPriceInputs(next);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [getAuthHeaders]);

  function updateRow(sku: string, field: keyof PricingRow, value: number | string | null) {
    setRows((prev) =>
      prev.map((r) => (r.sku === sku ? { ...r, [field]: value } : r))
    );
    setDirty(true);
  }

  function setPriceInput(sku: string, field: 'price' | 'sale', value: string) {
    setPriceInputs((prev) => ({
      ...prev,
      [sku]: { ...prev[sku], [field]: value },
    }));
    const cents = dollarInputToCents(value);
    if (cents !== null) {
      updateRow(sku, field === 'price' ? 'price_cents' : 'sale_price_cents', cents);
    } else if (field === 'sale' && value.trim() === '') {
      updateRow(sku, 'sale_price_cents', null);
    }
  }

  function blurPriceInput(sku: string, field: 'price' | 'sale') {
    const row = rows.find((r) => r.sku === sku);
    if (!row) return;
    const cents = field === 'price' ? row.price_cents : row.sale_price_cents;
    const formatted = centsToDollarInput(cents ?? 0);
    setPriceInputs((prev) => ({
      ...prev,
      [sku]: { ...prev[sku], [field]: formatted },
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    const payload = rows.map((r) => ({
      sku: r.sku,
      label: r.label,
      price_cents: r.price_cents,
      sale_price_cents: r.sale_price_cents,
      period: r.period,
    }));
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      setRows(data.pricing ?? rows);
      setDirty(false);
      const next: Record<string, { price: string; sale: string }> = {};
      for (const r of data.pricing ?? []) {
        next[r.sku] = {
          price: centsToDollarInput(r.price_cents),
          sale: centsToDollarInput(r.sale_price_cents),
        };
      }
      setPriceInputs(next);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;

  return (
    <div className="admin-page-block admin-pricing-page">
      <header className="admin-pricing-header">
        <h1 className="admin-page-title">
          <DollarSign size={22} aria-hidden />
          Pricing
        </h1>
        <p className="admin-pricing-desc">
          Edit product prices in Australian dollars. When a sale price is set, it is shown on checkout and marketing instead of the regular price.
        </p>
      </header>

      <form onSubmit={handleSave} className="admin-pricing-form">
        <div className="admin-pricing-list admin-pricing-list--rows">
          {rows.map((r) => (
            <div key={r.sku} className="admin-pricing-card admin-pricing-card--row">
              <div className="admin-pricing-card__cell admin-pricing-card__cell--sku">
                <span className="admin-pricing-card__sku-label">SKU</span>
                <span className="admin-pricing-card__sku">{r.sku}</span>
              </div>
              <div className="admin-pricing-card__cell admin-pricing-card__cell--label">
                <label className="admin-pricing-card__label-label">Label</label>
                <input
                  type="text"
                  className="admin-pricing-card__input admin-pricing-card__input--text admin-pricing-card__input--label"
                  value={r.label}
                  onChange={(e) => updateRow(r.sku, 'label', e.target.value)}
                  placeholder="Product label"
                  aria-label="Product label"
                />
              </div>
              <div className="admin-pricing-card__cell admin-pricing-card__cell--period">
                <label className="admin-pricing-card__label-label">Period</label>
                <select
                  className="admin-pricing-card__period"
                  value={r.period}
                  onChange={(e) => updateRow(r.sku, 'period', e.target.value)}
                  aria-label="Billing period"
                >
                  {PERIOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="admin-pricing-card__cell admin-pricing-card__cell--price">
                <label className="admin-pricing-card__price-label">Price (AUD)</label>
                <div className="admin-pricing-card__currency-wrap">
                  <span className="admin-pricing-card__currency-prefix">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="admin-pricing-card__input admin-pricing-card__input--dollar"
                    value={priceInputs[r.sku]?.price ?? centsToDollarInput(r.price_cents)}
                    onChange={(e) => setPriceInput(r.sku, 'price', e.target.value)}
                    onBlur={() => blurPriceInput(r.sku, 'price')}
                    placeholder="0.00"
                    aria-label={`Price for ${r.sku} in dollars`}
                  />
                </div>
              </div>
              <div className="admin-pricing-card__cell admin-pricing-card__cell--sale">
                <label className="admin-pricing-card__price-label">Sale (optional)</label>
                <div className="admin-pricing-card__currency-wrap">
                  <span className="admin-pricing-card__currency-prefix">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="admin-pricing-card__input admin-pricing-card__input--dollar"
                    value={priceInputs[r.sku]?.sale ?? centsToDollarInput(r.sale_price_cents)}
                    onChange={(e) => setPriceInput(r.sku, 'sale', e.target.value)}
                    onBlur={() => blurPriceInput(r.sku, 'sale')}
                    placeholder="—"
                    aria-label={`Sale price for ${r.sku} in dollars`}
                  />
                </div>
              </div>
              <div className="admin-pricing-card__cell admin-pricing-card__cell--preview">
                <span className="admin-pricing-card__preview-label">Shown as</span>
                <span className="admin-pricing-card__preview-value">
                  {formatAUD(r.sale_price_cents ?? r.price_cents)}
                  {r.period !== 'one-time' && (
                    <span className="admin-pricing-card__preview-period"> / {r.period}</span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>

        {saveError && (
          <p className="admin-pricing-error" role="alert">
            {saveError}
          </p>
        )}
        <div className="admin-pricing-actions">
          <button
            type="submit"
            className="admin-btn admin-btn--primary admin-pricing-save"
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {dirty && <span className="admin-pricing-dirty">Unsaved changes</span>}
        </div>
      </form>
    </div>
  );
}
