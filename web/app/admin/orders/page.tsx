'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '../AdminAuthContext';
import { getStatusLabel, getStatusBadgeClass } from '@/lib/order-status';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';

type OrderRow = {
  id: string;
  order_number: string | null;
  user_id: string;
  status: string;
  total_cents: number | null;
  currency: string;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string | null;
};

function formatMoney(cents: number | null, currency: string): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'AUD' }).format(cents / 100);
}

const PER_PAGE = 25;
const SORT_OPTIONS = [
  { value: 'created_at', label: 'Date (newest first)', order: 'desc' },
  { value: 'created_at_asc', label: 'Date (oldest first)', order: 'asc' },
  { value: 'status', label: 'Status (A–Z)', order: 'asc' },
  { value: 'status_desc', label: 'Status (Z–A)', order: 'desc' },
  { value: 'order_number', label: 'Order # (A–Z)', order: 'asc' },
  { value: 'order_number_desc', label: 'Order # (Z–A)', order: 'desc' },
] as const;

export default function AdminOrdersPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState<string>('created_at');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', String(PER_PAGE));
    if (search.trim()) params.set('search', search.trim());
    const sortOption = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];
    const sortField = sortOption.value.replace(/_asc$/, '').replace(/_desc$/, '');
    const orderDir = sortOption.value.endsWith('_asc') ? 'asc' : sortOption.value.endsWith('_desc') ? 'desc' : sortOption.order;
    params.set('sort', sortField);
    params.set('order', orderDir);
    fetch(`/api/admin/orders?${params.toString()}`, { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const msg = (body as { error?: string })?.error ?? (r.status === 403 ? 'Forbidden' : 'Failed to load');
          throw new Error(msg);
        }
        return r.json();
      })
      .then((data) => {
        setOrders(data.orders ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(Math.max(1, data.total_pages ?? 1));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [page, search, sort, getAuthHeaders]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const paidCount = orders.filter((o) => o.status === 'paid').length;

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)', margin: '1rem' }}>{error}</p>;

  return (
    <div className="admin-orders-page">
      <header className="admin-orders-header">
        <h1 className="admin-page-title">Orders</h1>
        <p className="admin-orders-subtitle">
          {total} order{total !== 1 ? 's' : ''} total
          {(pendingCount > 0 || paidCount > 0) && (
            <span className="admin-orders-meta">
              · {pendingCount} pending · {paidCount} paid on this page
            </span>
          )}
        </p>
      </header>

      <div className="admin-orders-toolbar">
        <form onSubmit={handleSearchSubmit} className="admin-orders-search">
          <label htmlFor="admin-orders-search-input" className="admin-sr-only">
            Search by order number or customer email
          </label>
          <input
            id="admin-orders-search-input"
            type="search"
            placeholder="Order # or customer email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="admin-input admin-orders-search-input"
          />
          <button type="submit" className="admin-btn admin-orders-search-btn" aria-label="Search">
            <Search size={18} />
          </button>
        </form>
        <div className="admin-orders-sort">
          <label htmlFor="admin-orders-sort-select" className="admin-orders-sort-label">
            Sort by
          </label>
          <select
            id="admin-orders-sort-select"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="admin-input admin-orders-sort-select"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-orders-table-wrap">
        <table className="admin-table admin-orders-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Total</th>
              <th>Tracking</th>
              <th>Created</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-orders-empty">
                  {search ? 'No orders match your search.' : 'No orders yet.'}
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="admin-orders-row">
                  <td className="admin-orders-cell-order">
                    <span className="admin-orders-order-num">{o.order_number ?? o.id.slice(0, 8)}</span>
                  </td>
                  <td className="admin-orders-cell-customer">
                    {o.user_email ?? <span className="admin-mono">{o.user_id?.slice(0, 8) ?? '—'}…</span>}
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(o.status)} title={getStatusLabel(o.status)}>
                      {getStatusLabel(o.status)}
                    </span>
                  </td>
                  <td className="admin-orders-cell-total">{formatMoney(o.total_cents, o.currency)}</td>
                  <td className="admin-orders-cell-tracking">
                    {o.tracking_number ? (
                      <span className="admin-mono">{o.tracking_number}</span>
                    ) : (
                      <span className="admin-orders-no-tracking">—</span>
                    )}
                  </td>
                  <td className="admin-orders-cell-date">
                    {new Date(o.created_at).toLocaleString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="admin-orders-cell-action">
                    <Link href={`/admin/orders/${o.id}`} className="admin-btn admin-orders-view-btn">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="admin-orders-pagination" aria-label="Orders pagination">
          <span className="admin-orders-pagination-info">
            {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
          </span>
          <button
            type="button"
            className="admin-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            aria-label="Previous page"
          >
            <ChevronLeft size={18} /> Previous
          </button>
          <span className="admin-orders-pagination-page">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="admin-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            aria-label="Next page"
          >
            Next <ChevronRight size={18} />
          </button>
        </nav>
      )}

      {error && <p className="admin-time" style={{ color: 'var(--error)', marginTop: '1rem' }}>{error}</p>}
    </div>
  );
}
