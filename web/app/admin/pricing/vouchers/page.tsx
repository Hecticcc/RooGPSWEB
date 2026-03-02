'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '../../AdminAuthContext';
import { Ticket, Plus, Trash2 } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';

const AU_TZ = 'Australia/Sydney';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', { timeZone: AU_TZ, dateStyle: 'short', timeStyle: 'short' });
}

const APPLIES_TO_OPTIONS = [
  { sku: 'gps_tracker', label: 'GPS Tracker' },
  { sku: 'sim_monthly', label: 'SIM (monthly)' },
  { sku: 'sim_yearly', label: 'SIM (yearly)' },
] as const;

function formatAppliesTo(skus: string[] | null | undefined): string {
  if (!skus || skus.length === 0) return 'All products';
  const labels = skus.map((s) => APPLIES_TO_OPTIONS.find((o) => o.sku === s)?.label ?? s);
  return labels.join(', ');
}

type VoucherRow = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  valid_from: string;
  valid_until: string | null;
  max_uses: number | null;
  use_count: number;
  min_order_cents: number | null;
  applies_to_skus: string[] | null;
  created_at: string;
};

export default function AdminPricingVouchersPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [list, setList] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [minOrderCents, setMinOrderCents] = useState('');
  const [appliesToSkus, setAppliesToSkus] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function toggleAppliesTo(sku: string) {
    setAppliesToSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]
    );
  }

  function load() {
    setLoading(true);
    setError(null);
    fetch('/api/admin/vouchers', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Forbidden' : 'Failed to load');
        return r.json();
      })
      .then((data) => setList(data.vouchers ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [getAuthHeaders]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const codeTrim = code.trim().toUpperCase();
    if (!codeTrim) {
      setFormError('Code is required');
      return;
    }
    const val = discountType === 'percent'
      ? Math.min(100, Math.max(1, parseInt(discountValue, 10) || 0))
      : Math.max(1, Math.round((parseFloat(discountValue) || 0) * 100));
    if (val <= 0) {
      setFormError(discountType === 'percent' ? 'Percent must be 1–100' : 'Fixed amount must be positive');
      return;
    }
    setSubmitting(true);
    fetch('/api/admin/vouchers', {
      method: 'POST',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
        code: codeTrim,
        discount_type: discountType,
        discount_value: discountType === 'percent' ? val : val,
        valid_from: validFrom || undefined,
        valid_until: validUntil || undefined,
        max_uses: maxUses === '' ? null : Math.max(0, parseInt(maxUses, 10) || 0),
        min_order_cents: minOrderCents === '' ? null : Math.max(0, Math.floor(parseFloat(minOrderCents) * 100) || 0),
        applies_to_skus: appliesToSkus.length > 0 ? appliesToSkus : [],
      }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error ?? 'Failed to create');
        setList((prev) => [data, ...prev]);
        setShowForm(false);
        setCode('');
        setDiscountValue('');
        setValidFrom('');
        setValidUntil('');
        setMaxUses('');
        setMinOrderCents('');
        setAppliesToSkus([]);
      })
      .catch((err) => setFormError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setSubmitting(false));
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this voucher? This cannot be undone.')) return;
    setDeletingId(id);
    fetch(`/api/admin/vouchers/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then((r) => {
        if (!r.ok) throw new Error('Delete failed');
        setList((prev) => prev.filter((v) => v.id !== id));
      })
      .catch(() => setDeletingId(null))
      .finally(() => setDeletingId(null));
  }

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;

  return (
    <div className="admin-page-block admin-vouchers-page">
      <header className="admin-vouchers-header">
        <h1 className="admin-page-title">
          <Ticket size={22} aria-hidden />
          Vouchers
        </h1>
        <p className="admin-vouchers-desc">
          Create discount codes for checkout. Customers enter the code on the order page to apply the discount.
        </p>
      </header>

      {!showForm ? (
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Create voucher
        </button>
      ) : (
        <div className="admin-card admin-vouchers-form-card">
          <h2 className="admin-vouchers-form-title">New voucher</h2>
          <form onSubmit={handleCreate} className="admin-vouchers-form">
            <div className="admin-vouchers-form-grid">
              <div className="admin-vouchers-field">
                <label className="admin-vouchers-label">Code *</label>
                <input
                  type="text"
                  className="admin-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. SAVE10"
                  autoComplete="off"
                />
              </div>
              <div className="admin-vouchers-field">
                <label className="admin-vouchers-label">Discount type</label>
                <select className="admin-select" value={discountType} onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed')}>
                  <option value="percent">Percent (%)</option>
                  <option value="fixed">Fixed ($)</option>
                </select>
              </div>
              <div className="admin-vouchers-field">
                <label className="admin-vouchers-label">{discountType === 'percent' ? 'Percent (1–100)' : 'Amount (AUD)'}</label>
                <input
                  type="number"
                  className="admin-input"
                  min={discountType === 'percent' ? 1 : 0}
                  max={discountType === 'percent' ? 100 : undefined}
                  step={discountType === 'fixed' ? 0.01 : 1}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percent' ? '10' : '0.00'}
                />
              </div>
              <div className="admin-vouchers-field">
                <label className="admin-vouchers-label">Valid from (optional)</label>
                <input type="datetime-local" className="admin-input" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
              </div>
              <div className="admin-vouchers-field">
                <label className="admin-vouchers-label">Valid until (optional)</label>
                <input type="datetime-local" className="admin-input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
              <div className="admin-vouchers-field">
                <label className="admin-vouchers-label">Max uses (optional)</label>
                <input type="number" className="admin-input" min={0} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
              </div>
              <div className="admin-vouchers-field">
                <label className="admin-vouchers-label">Min order (AUD, optional)</label>
                <input type="number" className="admin-input" min={0} step={0.01} value={minOrderCents} onChange={(e) => setMinOrderCents(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="admin-vouchers-applies">
              <span className="admin-vouchers-label">Applies to</span>
              <div className="admin-vouchers-applies-options">
                {APPLIES_TO_OPTIONS.map((opt) => (
                  <label key={opt.sku} className="admin-vouchers-checkbox">
                    <input
                      type="checkbox"
                      checked={appliesToSkus.includes(opt.sku)}
                      onChange={() => toggleAppliesTo(opt.sku)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
                <span className="admin-vouchers-applies-hint">Leave all unchecked = discount on entire order</span>
              </div>
            </div>
            {formError && <p className="admin-vouchers-error" role="alert">{formError}</p>}
            <div className="admin-vouchers-actions">
              <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create voucher'}
              </button>
              <button type="button" className="admin-btn" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-vouchers-table-wrap admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Applies to</th>
              <th>Valid</th>
              <th>Uses</th>
              <th>Min order</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7} className="admin-time">No vouchers yet. Create one above.</td></tr>
            ) : (
              list.map((v) => (
                <tr key={v.id}>
                  <td className="admin-mono">{v.code}</td>
                  <td>
                    {v.discount_type === 'percent' ? `${v.discount_value}% off` : `$${(v.discount_value / 100).toFixed(2)} off`}
                  </td>
                  <td className="admin-time" style={{ maxWidth: 180 }}>{formatAppliesTo(v.applies_to_skus)}</td>
                  <td className="admin-time">
                    {formatDate(v.valid_from)} → {v.valid_until ? formatDate(v.valid_until) : '∞'}
                  </td>
                  <td>{v.use_count}{v.max_uses != null ? ` / ${v.max_uses}` : ''}</td>
                  <td>{v.min_order_cents != null ? `$${(v.min_order_cents / 100).toFixed(2)}` : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      onClick={() => handleDelete(v.id)}
                      disabled={deletingId === v.id}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
