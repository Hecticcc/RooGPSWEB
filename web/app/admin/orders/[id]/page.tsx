'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAdminAuth } from '../../AdminAuthContext';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { getStatusBadgeClass, getStatusLabel } from '@/lib/order-status';

type SearchableSelectOption = { value: string; label: string };

function SearchableSelect({
  name,
  options,
  placeholder,
  required,
  minWidth = 180,
}: {
  name: string;
  options: SearchableSelectOption[];
  placeholder: string;
  required?: boolean;
  minWidth?: number;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SearchableSelectOption | null>(null);
  const [open, setOpen] = useState(false);
  const [listPosition, setListPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    if (!open || !containerRef.current) {
      setListPosition(null);
      return;
    }
    const el = containerRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setListPosition({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 180),
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const list = document.querySelector('.searchable-select__list--fixed');
        if (list && list.contains(e.target as Node)) return;
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayValue = selected ? selected.label : search;

  const listEl = open && listPosition && typeof document !== 'undefined' && (
    <ul
      className="searchable-select__list searchable-select__list--fixed"
      role="listbox"
      style={{
        position: 'fixed',
        top: listPosition.top,
        left: listPosition.left,
        width: listPosition.width,
        zIndex: 9999,
      }}
    >
      {filtered.length === 0 ? (
        <li className="searchable-select__item searchable-select__item--empty">No matches</li>
      ) : (
        filtered.slice(0, 100).map((opt) => (
          <li
            key={opt.value}
            role="option"
            aria-selected={selected?.value === opt.value}
            className="searchable-select__item"
            onMouseDown={(e) => {
              e.preventDefault();
              setSelected(opt);
              setSearch('');
              setOpen(false);
            }}
          >
            <span className="admin-mono">{opt.label}</span>
          </li>
        ))
      )}
    </ul>
  );

  return (
    <>
      <div ref={containerRef} className="searchable-select" style={{ minWidth, position: 'relative' }}>
        <input type="hidden" name={name} value={selected?.value ?? ''} required={required} readOnly aria-hidden />
        <input
          type="text"
          className="admin-input searchable-select__input"
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {}}
          autoComplete="off"
          style={{ width: '100%', minWidth: 140 }}
        />
      </div>
      {listEl && createPortal(listEl, document.body)}
    </>
  );
}

type Order = {
  id: string;
  order_number: string | null;
  user_id: string;
  status: string;
  shipping_name: string | null;
  shipping_mobile: string | null;
  shipping_address_line1: string | null;
  shipping_suburb: string | null;
  shipping_state: string | null;
  shipping_postcode: string | null;
  shipping_country: string | null;
  total_cents: number | null;
  currency: string;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
};

type OrderItem = {
  id: string;
  product_sku: string;
  quantity: number;
  assigned_tracker_stock_id: string | null;
  assigned_tracker_imei?: string | null;
  assigned_sim_iccid: string | null;
  activation_token_id: string | null;
};

type TrackerOption = { id: string; imei: string; status: string };
type SimOption = { iccid?: string; id?: string; state?: string };

function isTrackerProduct(sku: string): boolean {
  const s = (sku ?? '').toLowerCase();
  return s === 'gps_tracker' || s.includes('gps_tracker');
}

function isSimOnlyProduct(sku: string): boolean {
  const s = (sku ?? '').toLowerCase();
  return ['sim_monthly', 'sim_yearly'].includes(s) || s.includes('sim_monthly') || s.includes('sim_yearly');
}

function getSimIccid(sim: SimOption): string {
  return String(sim.iccid ?? sim.id ?? '').trim();
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { getAuthHeaders } = useAdminAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [trackersAvailable, setTrackersAvailable] = useState<TrackerOption[]>([]);
  const [simcardsAvailable, setSimcardsAvailable] = useState<SimOption[]>([]);
  const [simcardsLoading, setSimcardsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [canEditAssignments, setCanEditAssignments] = useState(false);
  const [reassigning, setReassigning] = useState<'tracker' | 'sim' | null>(null);
  const [reassignItemId, setReassignItemId] = useState<string | null>(null);

  function refetchOrder() {
    if (!id) return Promise.resolve();
    return fetch(`/api/admin/orders/${id}`, { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((data) => {
        setOrder(data.order);
        setTrackersAvailable(data.trackers_available ?? []);
        if (data.activation_code != null) setActivationCode(data.activation_code);
      });
  }

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/orders/${id}`, { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Forbidden' : 'Failed to load');
        return r.json();
      })
      .then((data) => {
        setOrder(data.order);
        setTrackersAvailable(data.trackers_available ?? []);
        setCanEditAssignments(!!data.can_edit_assignments);
        if (data.activation_code) setActivationCode(data.activation_code);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, getAuthHeaders]);

  useEffect(() => {
    if (!id || loading) return;
    setSimcardsLoading(true);
    fetch('/api/admin/stock/simcards', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : { simcards: [] }))
      .then((data) => setSimcardsAvailable(data.simcards ?? []))
      .catch(() => setSimcardsAvailable([]))
      .finally(() => setSimcardsLoading(false));
  }, [id, loading, getAuthHeaders]);

  function handleFulfil(e: React.FormEvent, itemId: string, simOnly: boolean) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const trackerId = (form.elements.namedItem('tracker') as HTMLSelectElement)?.value?.trim() || null;
    const simIccid = (form.elements.namedItem('sim_iccid') as HTMLSelectElement | HTMLInputElement)?.value?.trim() || null;
    if (simOnly) {
      if (!simIccid) return;
    } else {
      if (!trackerId) return;
    }
    setActionError(null);
    setActing(true);
    const body: { action: string; order_item_id: string; tracker_stock_id?: string; sim_iccid?: string } = {
      action: 'fulfil',
      order_item_id: itemId,
      sim_iccid: simIccid ?? undefined,
    };
    if (!simOnly && trackerId) body.tracker_stock_id = trackerId;
    fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setActivationCode(data.activation_code ?? null);
        return fetch(`/api/admin/orders/${id}`, { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() });
      })
      .then((r) => r.json())
      .then((data) => {
        setOrder(data.order);
        setTrackersAvailable(data.trackers_available ?? []);
      })
      .catch((e) => setActionError(e.message))
      .finally(() => setActing(false));
  }

  function handleMarkShipped(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActing(true);
    fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ship', tracking_number: trackingNumber }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setOrder((prev) => (prev ? { ...prev, status: 'shipped', tracking_number: trackingNumber || null } : null));
      })
      .catch((e) => setActionError(e.message))
      .finally(() => setActing(false));
  }

  function handleMarkProcessing() {
    setActionError(null);
    setActing(true);
    fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_processing' }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setOrder((prev) => (prev ? { ...prev, status: 'processing' } : null));
      })
      .catch((e) => setActionError(e.message))
      .finally(() => setActing(false));
  }

  function handleReassignTracker(e: React.FormEvent, itemId: string) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const trackerId = (form.elements.namedItem('tracker') as HTMLInputElement)?.value?.trim() || null;
    if (!trackerId) return;
    setActionError(null);
    setActing(true);
    setReassigning(null);
    setReassignItemId(null);
    fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reassign_tracker', order_item_id: itemId, tracker_stock_id: trackerId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        return refetchOrder();
      })
      .catch((e) => setActionError(e.message))
      .finally(() => setActing(false));
  }

  function handleReassignSim(e: React.FormEvent, itemId: string) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const simIccid = (form.elements.namedItem('sim_iccid') as HTMLInputElement)?.value?.trim() || null;
    if (!simIccid) return;
    setActionError(null);
    setActing(true);
    setReassigning(null);
    setReassignItemId(null);
    fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reassign_sim', order_item_id: itemId, sim_iccid: simIccid }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        return refetchOrder();
      })
      .catch((e) => setActionError(e.message))
      .finally(() => setActing(false));
  }

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;
  if (!order) return null;

  const items = order.items ?? [];
  const needsFulfil = (i: OrderItem) => {
    if (isTrackerProduct(i.product_sku)) return !i.assigned_tracker_stock_id;
    if (isSimOnlyProduct(i.product_sku)) return !i.assigned_sim_iccid;
    return !i.assigned_tracker_stock_id;
  };
  const canFulfil = (order.status === 'pending' || order.status === 'paid') && items.some(needsFulfil);
  const canShip = order.status === 'fulfilled' || order.status === 'processing';
  const canMarkProcessing = order.status === 'fulfilled';

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/admin/orders" className="admin-btn">← Orders</Link>
      </div>
      <h1 className="admin-page-title">Order {order.order_number ?? order.id.slice(0, 8)}</h1>

      {actionError && <p style={{ color: 'var(--error)', marginBottom: '1rem' }}>{actionError}</p>}
      {activationCode && (
        <div className="admin-card admin-activation-code-card">
          <div className="admin-activation-code-card__content">
            <h3 className="admin-activation-code-card__title">Activation code created</h3>
            <p className="admin-activation-code-card__code">{activationCode}</p>
          </div>
          <div className="admin-activation-code-card__action">
            <Link href={`/admin/orders/${id}/slip?code=${encodeURIComponent(activationCode)}&order_number=${encodeURIComponent(order.order_number ?? '')}`} className="admin-btn admin-activation-code-card__btn" target="_blank" rel="noopener noreferrer">
              Print activation slip
            </Link>
          </div>
        </div>
      )}

      <div className="admin-card">
        <h3>Status & shipping</h3>
        <table className="admin-table">
          <tbody>
            <tr><td>Status</td><td><span className={getStatusBadgeClass(order.status)}>{getStatusLabel(order.status)}</span></td></tr>
            <tr><td>Tracking</td><td>{order.tracking_number ?? '—'}</td></tr>
            <tr><td>Shipping</td><td>{order.shipping_name ?? '—'}, {order.shipping_address_line1 ?? ''}, {order.shipping_suburb ?? ''} {order.shipping_state ?? ''} {order.shipping_postcode ?? ''}</td></tr>
            <tr><td>Total</td><td>{order.total_cents != null ? `$${(order.total_cents / 100).toFixed(2)}` : '—'}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="admin-card">
        <h3>Items</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Tracker (IMEI)</th>
                <th>SIM ICCID</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const trackerProduct = isTrackerProduct(item.product_sku);
                const simOnlyProduct = isSimOnlyProduct(item.product_sku);
                const showTrackerFulfil = trackerProduct && !item.assigned_tracker_stock_id && canFulfil;
                const showSimOnlyFulfil = simOnlyProduct && !item.assigned_sim_iccid && canFulfil;
                const fulfilled = trackerProduct ? !!item.assigned_tracker_stock_id : simOnlyProduct ? !!item.assigned_sim_iccid : !!item.assigned_tracker_stock_id;
                const showReassignTracker = canEditAssignments && trackerProduct && item.assigned_tracker_stock_id;
                const showReassignSim = canEditAssignments && simOnlyProduct && item.assigned_sim_iccid;
                const isEditingTracker = reassigning === 'tracker' && reassignItemId === item.id;
                const isEditingSim = reassigning === 'sim' && reassignItemId === item.id;
                // Show IMEI only on tracker row; show ICCID only on SIM row (no duplicate data)
                const showTrackerCell = trackerProduct;
                const showSimCell = simOnlyProduct;
                const trackerDisplay = showTrackerCell && item.assigned_tracker_stock_id
                  ? (item.assigned_tracker_imei ?? 'Assigned')
                  : showTrackerCell ? '—' : '—';
                const simDisplay = showSimCell && item.assigned_sim_iccid ? item.assigned_sim_iccid : showSimCell ? '—' : '—';
                return (
                  <tr key={item.id}>
                    <td>{item.product_sku}</td>
                    <td>{item.quantity}</td>
                    <td className="admin-mono" title={showTrackerCell && item.assigned_tracker_imei ? 'GPS Tracker IMEI' : undefined}>
                      {trackerDisplay}
                    </td>
                    <td className="admin-mono">
                      {simDisplay}
                    </td>
                    <td className="admin-order-items-action">
                      {showTrackerFulfil && (
                        <form onSubmit={(e) => handleFulfil(e, item.id, false)} className="admin-order-items-action-form">
                          <SearchableSelect
                            name="tracker"
                            options={trackersAvailable.map((t) => ({ value: t.id, label: t.imei }))}
                            placeholder="Search tracker (IMEI)…"
                            required
                            minWidth={200}
                          />
                          <button type="submit" className="admin-btn admin-btn--primary" disabled={acting}>
                            Fulfil
                          </button>
                        </form>
                      )}
                      {showSimOnlyFulfil && (
                        <form onSubmit={(e) => handleFulfil(e, item.id, true)} className="admin-order-items-action-form">
                          <SearchableSelect
                            name="sim_iccid"
                            options={simcardsAvailable.map((sim) => getSimIccid(sim)).filter(Boolean).map((iccid) => ({ value: iccid, label: iccid }))}
                            placeholder="Search SIM (ICCID)…"
                            required
                            minWidth={220}
                          />
                          <button type="submit" className="admin-btn admin-btn--primary" disabled={acting}>
                            Fulfil
                          </button>
                        </form>
                      )}
                      {showReassignTracker && (
                        isEditingTracker ? (
                          <form onSubmit={(e) => handleReassignTracker(e, item.id)} className="admin-order-items-action-form">
                            <SearchableSelect
                              name="tracker"
                              options={trackersAvailable.map((t) => ({ value: t.id, label: t.imei }))}
                              placeholder="Pick replacement tracker (IMEI)…"
                              required
                              minWidth={200}
                            />
                            <button type="submit" className="admin-btn admin-btn--primary" disabled={acting}>Save</button>
                            <button type="button" className="admin-btn" onClick={() => { setReassigning(null); setReassignItemId(null); }} disabled={acting}>Cancel</button>
                          </form>
                        ) : (
                          <button type="button" className="admin-btn admin-btn--small" onClick={() => { setReassigning('tracker'); setReassignItemId(item.id); }} disabled={acting}>
                            Change tracker
                          </button>
                        )
                      )}
                      {showReassignSim && (
                        isEditingSim ? (
                          <form onSubmit={(e) => handleReassignSim(e, item.id)} className="admin-order-items-action-form">
                            <SearchableSelect
                              name="sim_iccid"
                              options={simcardsAvailable.map((sim) => getSimIccid(sim)).filter(Boolean).map((iccid) => ({ value: iccid, label: iccid }))}
                              placeholder="Pick replacement SIM (ICCID)…"
                              required
                              minWidth={200}
                            />
                            <button type="submit" className="admin-btn admin-btn--primary" disabled={acting}>Save</button>
                            <button type="button" className="admin-btn" onClick={() => { setReassigning(null); setReassignItemId(null); }} disabled={acting}>Cancel</button>
                          </form>
                        ) : (
                          <button type="button" className="admin-btn admin-btn--small" onClick={() => { setReassigning('sim'); setReassignItemId(item.id); }} disabled={acting}>
                            Change SIM
                          </button>
                        )
                      )}
                      {fulfilled && !showReassignTracker && !showReassignSim && <span className="admin-time">Stock assigned</span>}
                      {!showTrackerFulfil && !showSimOnlyFulfil && !fulfilled && !showReassignTracker && !showReassignSim && simcardsLoading && <span className="admin-time">Loading SIMs…</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canMarkProcessing && (
        <div className="admin-card">
          <h3>Processing</h3>
          <p className="admin-time" style={{ marginBottom: '0.75rem' }}>Order has stock assigned. Mark as processing when preparing to ship.</p>
          <button type="button" className="admin-btn admin-btn--primary" onClick={handleMarkProcessing} disabled={acting}>
            Mark as processing
          </button>
        </div>
      )}
      {canShip && (
        <div className="admin-card">
          <h3>Mark shipped</h3>
          <form onSubmit={handleMarkShipped} className="admin-mark-shipped-form">
            <input
              type="text"
              placeholder="Tracking number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className="admin-input admin-mark-shipped-form__input"
              disabled={acting}
            />
            <button type="submit" className="admin-btn admin-btn--primary" disabled={acting}>
              Mark shipped
            </button>
          </form>
        </div>
      )}
    </>
  );
}
