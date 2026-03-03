'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  ClipboardList,
  CheckCircle2,
  DollarSign,
  Users,
  Smartphone,
  Wifi,
  WifiOff,
  MapPin,
  Package,
  CardSim,
  Server,
  MessageSquare,
} from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { useAdminAuth } from '../AdminAuthContext';

const AU_TZ = 'Australia/Sydney';

function formatAuTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: AU_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

type Stats = {
  total_users: number;
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  locations_last_24h: number;
  ingest_health: { status?: string; uptime_seconds?: number; last_error?: string; last_error_at?: string } | null;
  ingest_error: string | null;
  ingest_started_at: string | null;
  last_location_received_at: string | null;
  tracker_stock_count?: number;
  new_orders_24h?: number;
  total_orders_incomplete?: number;
  completed_orders?: number;
  revenue_cents?: number;
  sms_sent_monthly?: number;
  sms_sent_yearly?: number;
};

type StockSummary = {
  usable: { trackers: number; simcards: number | null };
  used: { trackers: number; simcards: number | null };
};

export default function AdminDashboardPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [stockSummaryLoading, setStockSummaryLoading] = useState(true);

  const DASHBOARD_REFRESH_MS = 60 * 1000; // 1 minute

  useEffect(() => {
    async function loadStats() {
      try {
        const r = await fetch('/api/admin/stats', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const msg = (body as { error?: string })?.error ?? (r.status === 403 ? 'Forbidden' : 'Failed to load');
          throw new Error(msg);
        }
        const data = await r.json();
        setStats(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
    const interval = setInterval(loadStats, DASHBOARD_REFRESH_MS);
    return () => clearInterval(interval);
  }, [getAuthHeaders]);

  useEffect(() => {
    function loadStock() {
      fetch('/api/admin/stock/summary', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
        .then((r) => {
          if (!r.ok) return null;
          return r.json();
        })
        .then(setStockSummary)
        .catch(() => setStockSummary(null))
        .finally(() => setStockSummaryLoading(false));
    }
    loadStock();
    const interval = setInterval(loadStock, DASHBOARD_REFRESH_MS);
    return () => clearInterval(interval);
  }, [getAuthHeaders]);

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;
  if (!stats) return null;

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard-section-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 className="admin-page-title" style={{ marginBottom: 0 }}>Dashboard</h1>
          <p className="admin-dashboard-section-desc">Overview of users, devices and stock</p>
        </div>
      </header>

      <div className="admin-dashboard-body">
        <div className="admin-dashboard-main">
          <section className="admin-dashboard-section">
            <div className="admin-metric-grid" style={{ marginBottom: '1.5rem' }}>
              <Link href="/admin/orders" className="admin-card admin-card--with-icon admin-card--clickable">
                <span className="admin-card__icon" aria-hidden><ShoppingCart size={20} /></span>
                <h3>New Orders (24h)</h3>
                <p className="admin-metric-value">{stats.new_orders_24h ?? 0}</p>
              </Link>
              <div className="admin-card admin-card--with-icon">
                <span className="admin-card__icon" aria-hidden><ClipboardList size={20} /></span>
                <h3>Total Orders</h3>
                <p className="admin-metric-value">{stats.total_orders_incomplete ?? 0}</p>
              </div>
              <div className="admin-card admin-card--with-icon">
                <span className="admin-card__icon" aria-hidden><CheckCircle2 size={20} /></span>
                <h3>Completed orders</h3>
                <p className="admin-metric-value">{stats.completed_orders ?? 0}</p>
              </div>
              <div className="admin-card admin-card--with-icon">
                <span className="admin-card__icon" aria-hidden><DollarSign size={20} /></span>
                <h3>Revenue</h3>
                <p className="admin-metric-value">
                  {stats.revenue_cents != null
                    ? `$${(stats.revenue_cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
                    : '$0.00'}
                </p>
              </div>
            </div>
          </section>

          <section className="admin-dashboard-section">
            <h2 className="admin-dashboard-section-title">Overview</h2>
            <p className="admin-dashboard-section-desc">Users, devices and location activity</p>
            <div className="admin-metric-grid" style={{ marginTop: '0.5rem' }}>
              <Link href="/admin/users" className="admin-card admin-card--with-icon admin-card--clickable">
                <span className="admin-card__icon" aria-hidden><Users size={20} /></span>
                <h3>Total users</h3>
                <p className="admin-metric-value">{stats.total_users}</p>
              </Link>
              <Link href="/admin/devices" className="admin-card admin-card--with-icon admin-card--clickable">
                <span className="admin-card__icon" aria-hidden><Smartphone size={20} /></span>
                <h3>Total devices</h3>
                <p className="admin-metric-value">{stats.total_devices}</p>
              </Link>
              <div className="admin-card admin-card--with-icon">
                <span className="admin-card__icon admin-card__icon--online" aria-hidden><Wifi size={20} /></span>
                <h3>Online devices</h3>
                <p className="admin-metric-value">{stats.online_devices}</p>
                <p className="admin-metric-desc">last 10 min</p>
              </div>
              <div className="admin-card admin-card--with-icon">
                <span className="admin-card__icon" aria-hidden><WifiOff size={20} /></span>
                <h3>Offline devices</h3>
                <p className="admin-metric-value">{stats.offline_devices}</p>
              </div>
              <div className="admin-card admin-card--with-icon">
                <span className="admin-card__icon" aria-hidden><MapPin size={20} /></span>
                <h3>Location pings (24h)</h3>
                <p className="admin-metric-value">{stats.locations_last_24h}</p>
                <p className="admin-metric-desc">from devices</p>
              </div>
              <div className="admin-card admin-card--with-icon">
                <span className="admin-card__icon" aria-hidden><MessageSquare size={20} /></span>
                <h3>SMS sent (monthly)</h3>
                <p className="admin-metric-value">{stats.sms_sent_monthly ?? 0}</p>
                <p className="admin-metric-desc">this month</p>
              </div>
              <div className="admin-card admin-card--with-icon">
                <span className="admin-card__icon" aria-hidden><MessageSquare size={20} /></span>
                <h3>SMS sent (yearly)</h3>
                <p className="admin-metric-value">{stats.sms_sent_yearly ?? 0}</p>
                <p className="admin-metric-desc">this year</p>
              </div>
            </div>
          </section>

          <section className="admin-dashboard-section">
            <h2 className="admin-dashboard-section-title">Stock</h2>
            <p className="admin-dashboard-section-desc">Available vs in-use inventory</p>
            {stockSummaryLoading ? (
              <div className="admin-card">
                <p className="admin-time">Loading stock summary…</p>
              </div>
            ) : stockSummary ? (
              <>
                <div className="admin-metric-grid" style={{ marginTop: '0.5rem' }}>
                  <Link href="/admin/stock" className="admin-card admin-card--stock-usable admin-card--with-icon admin-card--clickable">
                    <span className="admin-card__icon admin-card__icon--success" aria-hidden><Package size={20} /></span>
                    <h3>Usable GPS trackers</h3>
                    <p className="admin-metric-value">{stockSummary.usable.trackers}</p>
                    <p className="admin-metric-desc">In stock, available to assign</p>
                  </Link>
                  <div className="admin-card admin-card--stock-usable admin-card--with-icon">
                    <span className="admin-card__icon admin-card__icon--success" aria-hidden><CardSim size={20} /></span>
                    <h3>Usable SIM cards</h3>
                    <p className="admin-metric-value">{stockSummary.usable.simcards ?? '—'}</p>
                    <p className="admin-metric-desc">Disabled, available to enable</p>
                  </div>
                  <div className="admin-card admin-card--stock-used admin-card--with-icon">
                    <span className="admin-card__icon" aria-hidden><Package size={20} /></span>
                    <h3>Used GPS trackers</h3>
                    <p className="admin-metric-value">{stockSummary.used.trackers}</p>
                    <p className="admin-metric-desc">Assigned, sold, returned or faulty</p>
                  </div>
                  <div className="admin-card admin-card--stock-used admin-card--with-icon">
                    <span className="admin-card__icon" aria-hidden><CardSim size={20} /></span>
                    <h3>Used SIM cards</h3>
                    <p className="admin-metric-value">{stockSummary.used.simcards ?? '—'}</p>
                    <p className="admin-metric-desc">Enabled, in use</p>
                  </div>
                </div>
                <p style={{ marginTop: '1rem', marginBottom: 0 }}>
                  <Link href="/admin/stock" className="admin-stock-view-link">
                    View full stock →
                  </Link>
                </p>
              </>
            ) : (
              <div className="admin-card">
                <p className="admin-time">Could not load stock summary.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="admin-dashboard-sidebar">
          <section className="admin-dashboard-section">
            <h2 className="admin-dashboard-section-title">Ingest service</h2>
            <p className="admin-dashboard-section-desc">Data pipeline health</p>
            <div className="admin-card admin-ingest-card admin-card--with-icon" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              <span className="admin-card__icon" aria-hidden><Server size={20} /></span>
              {stats.ingest_error ? (
                <p style={{ color: 'var(--error)', margin: 0 }}>{stats.ingest_error}</p>
              ) : stats.ingest_health ? (
                <ul className="admin-ingest-grid">
                  <li>
                    <span className="admin-ingest-label">Status</span>
                    <span className="admin-ingest-value">{stats.ingest_health.status ?? '—'}</span>
                  </li>
                  <li>
                    <span className="admin-ingest-label">Uptime</span>
                    <span className="admin-ingest-value">
                      {stats.ingest_health.uptime_seconds != null ? `${stats.ingest_health.uptime_seconds}s` : '—'}
                    </span>
                  </li>
                  {stats.ingest_started_at && (
                    <li>
                      <span className="admin-ingest-label">Service started</span>
                      <span className="admin-ingest-value">{formatAuTime(stats.ingest_started_at)}</span>
                    </li>
                  )}
                  {stats.last_location_received_at && (
                    <li>
                      <span className="admin-ingest-label">Last data received</span>
                      <span className="admin-ingest-value">{formatAuTime(stats.last_location_received_at)}</span>
                    </li>
                  )}
                  {stats.ingest_health.last_error && (
                    <li>
                      <span className="admin-ingest-label">Last error</span>
                      <span className="admin-ingest-value admin-ingest-value--error">
                        {stats.ingest_health.last_error}
                        {stats.ingest_health.last_error_at && (
                          <span className="admin-time" style={{ marginLeft: 6, display: 'block' }}>
                            {formatAuTime(stats.ingest_health.last_error_at)}
                          </span>
                        )}
                      </span>
                    </li>
                  )}
                </ul>
              ) : (
                <p className="admin-time" style={{ margin: 0 }}>INGEST_HEALTH_URL not configured</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
