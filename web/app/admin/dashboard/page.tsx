'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  CheckCircle2,
  DollarSign,
  Users,
  Smartphone,
  Wifi,
  WifiOff,
  MapPin,
  Server,
  Headphones,
  MessageCircle,
  Inbox,
  Clock,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Activity,
  Wallet,
  Coins,
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

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

type Stats = {
  total_users: number;
  total_devices: number;
  online_devices: number;
  sleeping_devices: number;
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

type TrackerModelStockRow = {
  product_sku: string;
  label: string;
  in_stock: number;
  deployed: number;
  total: number;
};

type StockSummary = {
  usable: { trackers: number; simcards: number | null };
  used: { trackers: number; simcards: number | null };
  trackers_by_model: TrackerModelStockRow[];
};

type SupportStats = {
  open: number;
  answered: number;
  pending: number;
  resolved: number;
};

type ProviderBalanceSide = {
  configured: boolean;
  ok: boolean;
  balance?: number | null;
  currency?: string | null;
  low?: boolean;
  low_threshold?: number;
  unit?: string;
  error?: string | null;
};

type ProviderBalances = {
  simbase: ProviderBalanceSide;
  smsportal: ProviderBalanceSide;
};

function formatSimbaseFunds(balance: number, currency: string | null | undefined): string {
  const c = currency?.trim();
  if (c && /^[A-Z]{3}$/i.test(c)) {
    try {
      return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: c.toUpperCase(),
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(balance);
    } catch {
      /* fall through */
    }
  }
  return balance.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Sub-components ─────────────────────────────────────────── */

function KPICard({
  label,
  value,
  sub,
  icon,
  accentColor,
  href,
  alert,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accentColor: string;
  href?: string;
  alert?: boolean;
}) {
  const inner = (
    <div className="admdb-kpi" style={{ '--kpi-accent': accentColor } as React.CSSProperties}>
      <div className="admdb-kpi__icon" style={{ color: accentColor }}>{icon}</div>
      <div className="admdb-kpi__body">
        <span className="admdb-kpi__label">{label}</span>
        <span className="admdb-kpi__value" style={alert ? { color: 'var(--error)' } : {}}>{value}</span>
        {sub && <span className="admdb-kpi__sub">{sub}</span>}
      </div>
    </div>
  );
  if (href) return <Link href={href} className="admdb-kpi-link">{inner}</Link>;
  return inner;
}

function SectionPanel({
  title,
  sub,
  accentColor,
  action,
  children,
}: {
  title: string;
  sub?: string;
  accentColor?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="admdb-panel" style={accentColor ? { '--panel-accent': accentColor } as React.CSSProperties : {}}>
      <div className="admdb-panel__head">
        <div>
          <h2 className="admdb-panel__title">{title}</h2>
          {sub && <p className="admdb-panel__sub">{sub}</p>}
        </div>
        {action && <div className="admdb-panel__action">{action}</div>}
      </div>
      <div className="admdb-panel__body">{children}</div>
    </div>
  );
}

function ProgressBar({ value, total, color }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="admdb-bar-track">
      <div className="admdb-bar-fill" style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }} />
    </div>
  );
}

function DeviceRing({ online, sleeping, total }: { online: number; sleeping: number; total: number }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const onlinePct = total > 0 ? online / total : 0;
  const sleepPct = total > 0 ? sleeping / total : 0;
  const onlineDash = circ * onlinePct;
  const sleepOffset = circ * onlinePct;
  const sleepDash = circ * sleepPct;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" className="admdb-ring">
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
      {total > 0 && (
        <>
          <circle
            cx="40" cy="40" r={r} fill="none"
            stroke="var(--success)" strokeWidth="8"
            strokeDasharray={`${onlineDash} ${circ}`}
            strokeLinecap="butt"
            transform="rotate(-90 40 40)"
          />
          {sleeping > 0 && (
            <circle
              cx="40" cy="40" r={r} fill="none"
              stroke="#f59e0b" strokeWidth="8"
              strokeDasharray={`${sleepDash} ${circ}`}
              strokeDashoffset={-sleepOffset}
              transform="rotate(-90 40 40)"
            />
          )}
        </>
      )}
      <text x="40" y="37" textAnchor="middle" className="admdb-ring__num" dy="0">{online}</text>
      <text x="40" y="51" textAnchor="middle" className="admdb-ring__label">online</text>
    </svg>
  );
}

function StatRow({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="admdb-stat-row">
      <span className="admdb-stat-row__icon" style={color ? { color } : {}}>{icon}</span>
      <span className="admdb-stat-row__label">{label}</span>
      <span className="admdb-stat-row__value">{value}</span>
      {sub && <span className="admdb-stat-row__sub">{sub}</span>}
    </div>
  );
}

function TicketBadge({ count, label, color, bg, href }: { count: number | string; label: string; color: string; bg: string; href?: string }) {
  const inner = (
    <div className="admdb-ticket" style={{ '--t-color': color, '--t-bg': bg } as React.CSSProperties}>
      <span className="admdb-ticket__count">{count}</span>
      <span className="admdb-ticket__label">{label}</span>
    </div>
  );
  if (href) return <Link href={href} className="admdb-ticket-link">{inner}</Link>;
  return inner;
}

/* ─── Main page ──────────────────────────────────────────────── */

const REFRESH_MS = 60 * 1000;

export default function AdminDashboardPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [supportStats, setSupportStats] = useState<SupportStats | null>(null);
  const [providerBalances, setProviderBalances] = useState<ProviderBalances | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/stats', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        const msg = (body as { error?: string })?.error ?? (r.status === 403 ? 'Forbidden' : 'Failed to load');
        throw new Error(msg);
      }
      setStats(await r.json());
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  const loadStock = useCallback(() => {
    fetch('/api/admin/stock/summary', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!data || typeof data !== 'object') {
          setStockSummary(null);
          return;
        }
        const d = data as Partial<StockSummary>;
        setStockSummary({
          usable: d.usable ?? { trackers: 0, simcards: null },
          used: d.used ?? { trackers: 0, simcards: null },
          trackers_by_model: Array.isArray(d.trackers_by_model) ? d.trackers_by_model : [],
        });
      })
      .catch(() => setStockSummary(null));
  }, [getAuthHeaders]);

  const loadSupport = useCallback(() => {
    fetch('/api/support/stats', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && typeof data.open === 'number') setSupportStats(data as SupportStats); })
      .catch(() => setSupportStats(null));
  }, [getAuthHeaders]);

  const loadProviderBalances = useCallback(() => {
    fetch('/api/admin/provider-balances', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (data && typeof data === 'object' && 'simbase' in data && 'smsportal' in data) {
          setProviderBalances(data as ProviderBalances);
        }
      })
      .catch(() => setProviderBalances(null));
  }, [getAuthHeaders]);

  useEffect(() => {
    loadStats();
    const t = setInterval(loadStats, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadStats]);

  useEffect(() => {
    loadStock();
    const t = setInterval(loadStock, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadStock]);

  useEffect(() => {
    if (!loading && stats) loadSupport();
    const t = setInterval(loadSupport, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadSupport, loading, stats]);

  useEffect(() => {
    if (!loading && stats) loadProviderBalances();
    const t = setInterval(loadProviderBalances, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadProviderBalances, loading, stats]);

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;
  if (!stats) return null;

  const totalTickets = supportStats != null
    ? supportStats.open + supportStats.answered + supportStats.pending + supportStats.resolved
    : null;

  const totalTrackers = (stockSummary?.usable.trackers ?? 0) + (stockSummary?.used.trackers ?? 0);
  const totalSims = ((stockSummary?.usable.simcards ?? 0)) + ((stockSummary?.used.simcards ?? 0));

  const ingestOk = !stats.ingest_error && stats.ingest_health?.status === 'ok';
  const ingestStatus = stats.ingest_error ? 'error' : stats.ingest_health ? stats.ingest_health.status ?? 'unknown' : 'unconfigured';

  const offlineDevices = stats.offline_devices;
  const sleepingDevices = stats.sleeping_devices ?? 0;

  const revenueFormatted = stats.revenue_cents != null
    ? `$${(stats.revenue_cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
    : '$0.00';

  return (
    <div className="admdb">
      {/* ── Page header ── */}
      <div className="admdb-header">
        <div>
          <h1 className="admdb-header__title">Dashboard</h1>
          <p className="admdb-header__sub">RooGPS admin overview — auto-refreshes every minute</p>
        </div>
        <div className="admdb-header__right">
          {lastRefreshed && (
            <span className="admdb-header__refreshed">
              <RefreshCw size={13} />
              {lastRefreshed.toLocaleTimeString('en-AU', { timeZone: AU_TZ, timeStyle: 'short' })}
            </span>
          )}
          <button
            className="admdb-header__refresh-btn"
            onClick={() => { loadStats(); loadStock(); loadSupport(); loadProviderBalances(); }}
            title="Refresh now"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="admdb-kpi-row">
        <KPICard
          href="/admin/orders"
          label="New Orders"
          value={stats.new_orders_24h ?? 0}
          sub="last 24 hours"
          icon={<ShoppingCart size={20} />}
          accentColor="#3b82f6"
        />
        <KPICard
          label="Total Revenue"
          value={revenueFormatted}
          sub={`${stats.completed_orders ?? 0} completed orders`}
          icon={<DollarSign size={20} />}
          accentColor="#22c55e"
        />
        <KPICard
          href="/admin/support?status=open"
          label="Open Tickets"
          value={supportStats?.open ?? '—'}
          sub={totalTickets != null ? `${totalTickets} total` : undefined}
          icon={<Inbox size={20} />}
          accentColor={(supportStats?.open ?? 0) > 0 ? '#f97316' : '#22c55e'}
          alert={(supportStats?.open ?? 0) > 0}
        />
        <KPICard
          href="/admin/devices"
          label="Online Devices"
          value={stats.online_devices}
          sub={sleepingDevices > 0 ? `${sleepingDevices} sleeping · ${offlineDevices} offline` : `${offlineDevices} offline · ${stats.total_devices} total`}
          icon={<Wifi size={20} />}
          accentColor={stats.online_devices > 0 ? '#22c55e' : '#6b7280'}
        />
      </div>

      {/* ── Provider wallet / credits ── */}
      <div className="admdb-funds-row">
        <div
          className={`admdb-fund-card${providerBalances?.simbase.low ? ' admdb-fund-card--low' : ''}`}
        >
          {providerBalances == null ? (
            <>
              <div className="admdb-fund-card__top">
                <Wallet size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#a78bfa' }} />
                <span className="admdb-fund-card__name">Simbase</span>
              </div>
              <p className="admdb-fund-card__muted">Loading…</p>
            </>
          ) : !providerBalances.simbase.configured ? (
            <>
              <div className="admdb-fund-card__top">
                <Wallet size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#a78bfa' }} />
                <span className="admdb-fund-card__name">Simbase</span>
              </div>
              <p className="admdb-fund-card__muted">API key not set</p>
            </>
          ) : !providerBalances.simbase.ok ? (
            <>
              <div className="admdb-fund-card__top">
                <Wallet size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#a78bfa' }} />
                <span className="admdb-fund-card__name">Simbase</span>
              </div>
              <p className="admdb-fund-card__err" title={providerBalances.simbase.error ?? ''}>
                Couldn’t load balance
              </p>
            </>
          ) : providerBalances.simbase.balance != null ? (
            providerBalances.simbase.low ? (
              <div className="admdb-fund-card__split">
                <div className="admdb-fund-card__stack">
                  <div className="admdb-fund-card__top">
                    <Wallet size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#a78bfa' }} />
                    <span className="admdb-fund-card__name">Simbase</span>
                  </div>
                  <div className="admdb-fund-card__amount-block">
                    <p className="admdb-fund-card__value">
                      {formatSimbaseFunds(providerBalances.simbase.balance, providerBalances.simbase.currency)}
                    </p>
                    <p className="admdb-fund-card__hint">Account funds</p>
                  </div>
                </div>
                <div className="admdb-fund-card__badge-slot">
                  <span className="admdb-fund-card__warn-badge" role="status">
                    Low — under {providerBalances.simbase.low_threshold}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="admdb-fund-card__top">
                  <Wallet size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#a78bfa' }} />
                  <span className="admdb-fund-card__name">Simbase</span>
                </div>
                <div className="admdb-fund-card__amount-block">
                  <p className="admdb-fund-card__value">
                    {formatSimbaseFunds(providerBalances.simbase.balance, providerBalances.simbase.currency)}
                  </p>
                  <p className="admdb-fund-card__hint">Account funds</p>
                </div>
              </>
            )
          ) : (
            <>
              <div className="admdb-fund-card__top">
                <Wallet size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#a78bfa' }} />
                <span className="admdb-fund-card__name">Simbase</span>
              </div>
              <p className="admdb-fund-card__muted">—</p>
            </>
          )}
        </div>

        <div
          className={`admdb-fund-card${providerBalances?.smsportal.low ? ' admdb-fund-card--low' : ''}`}
        >
          {providerBalances == null ? (
            <>
              <div className="admdb-fund-card__top">
                <Coins size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#38bdf8' }} />
                <span className="admdb-fund-card__name">SMSPortal</span>
              </div>
              <p className="admdb-fund-card__muted">Loading…</p>
            </>
          ) : !providerBalances.smsportal.configured ? (
            <>
              <div className="admdb-fund-card__top">
                <Coins size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#38bdf8' }} />
                <span className="admdb-fund-card__name">SMSPortal</span>
              </div>
              <p className="admdb-fund-card__muted">Not configured</p>
            </>
          ) : !providerBalances.smsportal.ok ? (
            <>
              <div className="admdb-fund-card__top">
                <Coins size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#38bdf8' }} />
                <span className="admdb-fund-card__name">SMSPortal</span>
              </div>
              <p className="admdb-fund-card__err" title={providerBalances.smsportal.error ?? ''}>
                Couldn’t load credits
              </p>
            </>
          ) : providerBalances.smsportal.balance != null ? (
            providerBalances.smsportal.low ? (
              <div className="admdb-fund-card__split">
                <div className="admdb-fund-card__stack">
                  <div className="admdb-fund-card__top">
                    <Coins size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#38bdf8' }} />
                    <span className="admdb-fund-card__name">SMSPortal</span>
                  </div>
                  <div className="admdb-fund-card__amount-block">
                    <p className="admdb-fund-card__value">
                      {providerBalances.smsportal.balance.toLocaleString('en-AU', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p className="admdb-fund-card__hint">SMS credits</p>
                  </div>
                </div>
                <div className="admdb-fund-card__badge-slot">
                  <span className="admdb-fund-card__warn-badge" role="status">
                    Low — under {providerBalances.smsportal.low_threshold} credits
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="admdb-fund-card__top">
                  <Coins size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#38bdf8' }} />
                  <span className="admdb-fund-card__name">SMSPortal</span>
                </div>
                <div className="admdb-fund-card__amount-block">
                  <p className="admdb-fund-card__value">
                    {providerBalances.smsportal.balance.toLocaleString('en-AU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="admdb-fund-card__hint">SMS credits</p>
                </div>
              </>
            )
          ) : (
            <>
              <div className="admdb-fund-card__top">
                <Coins size={18} className="admdb-fund-card__icon" aria-hidden style={{ color: '#38bdf8' }} />
                <span className="admdb-fund-card__name">SMSPortal</span>
              </div>
              <p className="admdb-fund-card__muted">—</p>
            </>
          )}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="admdb-grid">

        {/* Orders & Revenue */}
        <SectionPanel
          title="Orders & Revenue"
          sub="Sales activity and order pipeline"
          accentColor="#3b82f6"
          action={<Link href="/admin/orders" className="admdb-panel__link">View all →</Link>}
        >
          <div className="admdb-orders-grid">
            <div className="admdb-orders-stat">
              <span className="admdb-orders-stat__num" style={{ color: '#3b82f6' }}>{stats.new_orders_24h ?? 0}</span>
              <span className="admdb-orders-stat__label">New (24h)</span>
            </div>
            <div className="admdb-orders-divider" />
            <div className="admdb-orders-stat">
              <span className="admdb-orders-stat__num">{stats.total_orders_incomplete ?? 0}</span>
              <span className="admdb-orders-stat__label">Active</span>
            </div>
            <div className="admdb-orders-divider" />
            <div className="admdb-orders-stat">
              <span className="admdb-orders-stat__num" style={{ color: '#22c55e' }}>{stats.completed_orders ?? 0}</span>
              <span className="admdb-orders-stat__label">Completed</span>
            </div>
            <div className="admdb-orders-divider" />
            <div className="admdb-orders-stat">
              <span className="admdb-orders-stat__num" style={{ color: '#22c55e' }}>{revenueFormatted}</span>
              <span className="admdb-orders-stat__label">Revenue</span>
            </div>
          </div>

          {/* Order completion bar */}
          {(stats.total_orders_incomplete ?? 0) + (stats.completed_orders ?? 0) > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div className="admdb-bar-label">
                <span>Order completion</span>
                <span>
                  {stats.completed_orders ?? 0} / {(stats.total_orders_incomplete ?? 0) + (stats.completed_orders ?? 0)}
                </span>
              </div>
              <ProgressBar
                value={stats.completed_orders ?? 0}
                total={(stats.total_orders_incomplete ?? 0) + (stats.completed_orders ?? 0)}
                color="#22c55e"
              />
            </div>
          )}
        </SectionPanel>

        {/* Device Fleet */}
        <SectionPanel
          title="Device Fleet"
          sub="Live tracker status and activity"
          accentColor="#22c55e"
          action={<Link href="/admin/map" className="admdb-panel__link">View map →</Link>}
        >
          <div className="admdb-device-layout">
            <div className="admdb-device-ring-wrap">
              <DeviceRing online={stats.online_devices} sleeping={sleepingDevices} total={stats.total_devices} />
              <div className="admdb-ring-legend">
                <span className="admdb-ring-legend__dot" style={{ background: 'var(--success)' }} />
                <span>{stats.online_devices} online</span>
              </div>
              {sleepingDevices > 0 && (
                <div className="admdb-ring-legend">
                  <span className="admdb-ring-legend__dot" style={{ background: '#f59e0b' }} />
                  <span>{sleepingDevices} sleeping</span>
                </div>
              )}
              <div className="admdb-ring-legend">
                <span className="admdb-ring-legend__dot" style={{ background: '#6b7280' }} />
                <span>{offlineDevices} offline</span>
              </div>
            </div>
            <div className="admdb-device-stats">
              <StatRow icon={<Users size={15} />} label="Total users" value={stats.total_users} />
              <StatRow icon={<Smartphone size={15} />} label="Total devices" value={stats.total_devices} />
              <StatRow icon={<MapPin size={15} />} label="Location pings (24h)" value={stats.locations_last_24h.toLocaleString()} color="var(--accent)" />
              <StatRow icon={<Activity size={15} />} label="SMS this month" value={stats.sms_sent_monthly ?? 0} />
              <StatRow icon={<TrendingUp size={15} />} label="SMS this year" value={stats.sms_sent_yearly ?? 0} />
            </div>
          </div>
        </SectionPanel>

        {/* Support Queue */}
        <SectionPanel
          title="Support Queue"
          sub="Ticket status at a glance"
          accentColor={(supportStats?.open ?? 0) > 0 ? '#f97316' : '#22c55e'}
          action={<Link href="/admin/support" className="admdb-panel__link">View all →</Link>}
        >
          <div className="admdb-tickets-row">
            <TicketBadge
              count={supportStats?.open ?? '—'}
              label="Open"
              color="#ef4444"
              bg="rgba(239,68,68,0.12)"
              href="/admin/support?status=open"
            />
            <TicketBadge
              count={supportStats?.pending ?? '—'}
              label="Pending"
              color="#f59e0b"
              bg="rgba(245,158,11,0.12)"
            />
            <TicketBadge
              count={supportStats?.answered ?? '—'}
              label="Answered"
              color="#3b82f6"
              bg="rgba(59,130,246,0.12)"
              href="/admin/support?status=answered"
            />
            <TicketBadge
              count={supportStats?.resolved ?? '—'}
              label="Resolved"
              color="#22c55e"
              bg="rgba(34,197,94,0.12)"
            />
          </div>

          {totalTickets != null && totalTickets > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div className="admdb-bar-label">
                <span>Resolution rate</span>
                <span>{supportStats!.resolved} / {totalTickets} resolved</span>
              </div>
              <ProgressBar value={supportStats!.resolved} total={totalTickets} color="#22c55e" />
            </div>
          )}

          {(supportStats?.open ?? 0) > 0 && (
            <div className="admdb-alert-banner">
              <AlertTriangle size={14} />
              {supportStats!.open} ticket{supportStats!.open !== 1 ? 's' : ''} need{supportStats!.open === 1 ? 's' : ''} attention
            </div>
          )}
        </SectionPanel>

        {/* Inventory / Stock */}
        <SectionPanel
          title="Inventory"
          sub="Hardware & SIM inventory"
          accentColor="#8b5cf6"
          action={<Link href="/admin/stock" className="admdb-panel__link">Manage stock →</Link>}
        >
          {stockSummary ? (
            <div className="admdb-inv">
              <div>
                <p className="admdb-inv__section-title">GPS hardware</p>
                <div className="admdb-inv-table-wrap">
                  <table className="admdb-inv-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th className="admdb-inv-th-num">Shelf</th>
                        <th className="admdb-inv-th-num">Deployed</th>
                        <th className="admdb-inv-th-num">Total</th>
                        <th className="admdb-inv-bar-cell" title="Share of fleet deployed">Mix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stockSummary.trackers_by_model.length > 0
                        ? stockSummary.trackers_by_model
                        : [
                            {
                              product_sku: '—',
                              label: 'All trackers',
                              in_stock: stockSummary.usable.trackers,
                              deployed: stockSummary.used.trackers,
                              total: totalTrackers,
                            },
                          ]
                      ).map((row) => {
                        const pct = row.total > 0 ? Math.round((row.deployed / row.total) * 100) : 0;
                        return (
                          <tr key={row.product_sku}>
                            <td>
                              <span className="admdb-inv-model">{row.label}</span>
                              {row.product_sku !== '—' && (
                                <span className="admdb-inv-sku">{row.product_sku}</span>
                              )}
                            </td>
                            <td
                              className={`admdb-inv-num${row.in_stock === 0 ? ' admdb-inv-num--warn' : ' admdb-inv-num--ok'}`}
                            >
                              {row.in_stock}
                            </td>
                            <td className="admdb-inv-num">{row.deployed}</td>
                            <td className="admdb-inv-num">{row.total}</td>
                            <td className="admdb-inv-bar-cell">
                              <div className="admdb-inv-bar-track" title={`${pct}% deployed`}>
                                <div
                                  className="admdb-inv-bar-fill"
                                  style={{ width: `${pct}%`, background: '#8b5cf6' }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {stockSummary.usable.trackers === 0 && totalTrackers > 0 && (
                  <div className="admdb-inv-alert">
                    <AlertTriangle size={14} aria-hidden />
                    <span>No units on the shelf — add stock or check assignments.</span>
                  </div>
                )}
              </div>

              <div className="admdb-inv__sim-block">
                <p className="admdb-inv__section-title">SIM cards</p>
                <div className="admdb-inv-sim">
                  {stockSummary.usable.simcards != null && stockSummary.used.simcards != null ? (
                    <>
                      <div className="admdb-inv-sim-pair">
                        <div className="admdb-inv-sim-stat">
                          <span className="admdb-inv-sim-stat__value">{stockSummary.used.simcards}</span>
                          <span className="admdb-inv-sim-stat__label">Assigned</span>
                        </div>
                        <div className="admdb-inv-sim-stat">
                          <span
                            className={`admdb-inv-sim-stat__value admdb-inv-sim-stat__value--spare${stockSummary.usable.simcards === 0 ? ' admdb-inv-sim-stat__value--zero' : ''}`}
                          >
                            {stockSummary.usable.simcards}
                          </span>
                          <span className="admdb-inv-sim-stat__label">Spare</span>
                        </div>
                      </div>
                      <div className="admdb-inv-sim-total">{totalSims} total in pool</div>
                    </>
                  ) : (
                    <p className="admdb-muted" style={{ margin: 0, fontSize: '0.8125rem' }}>SIM counts unavailable</p>
                  )}
                </div>
                {stockSummary.usable.simcards != null && stockSummary.usable.simcards === 0 && totalSims > 0 && (
                  <div className="admdb-inv-alert" style={{ marginTop: '0.5rem' }}>
                    <AlertTriangle size={14} aria-hidden />
                    <span>No spare SIMs available.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="admdb-muted">Could not load stock summary.</p>
          )}
        </SectionPanel>
      </div>

      {/* ── Ingest health banner ── */}
      <div className={`admdb-ingest ${ingestOk ? 'admdb-ingest--ok' : ingestStatus === 'error' ? 'admdb-ingest--error' : 'admdb-ingest--warn'}`}>
        <div className="admdb-ingest__left">
          <Server size={16} />
          <span className="admdb-ingest__title">Ingest Service</span>
          <span className={`admdb-ingest__pill admdb-ingest__pill--${ingestOk ? 'ok' : 'error'}`}>
            {ingestOk ? 'Online' : ingestStatus}
          </span>
        </div>
        <div className="admdb-ingest__details">
          {stats.ingest_health?.uptime_seconds != null && (
            <span><Clock size={12} /> Uptime: {formatUptime(stats.ingest_health.uptime_seconds)}</span>
          )}
          {stats.ingest_started_at && (
            <span>Started: {formatAuTime(stats.ingest_started_at)}</span>
          )}
          {stats.last_location_received_at && (
            <span>Last data: {formatAuTime(stats.last_location_received_at)}</span>
          )}
          {stats.ingest_health?.last_error && (
            <span className="admdb-ingest__err">
              <AlertTriangle size={12} /> {stats.ingest_health.last_error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
