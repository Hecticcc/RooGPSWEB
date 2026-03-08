'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAdminAuth } from '../AdminAuthContext';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { SUPPORT_TICKET_STATUS_LABELS, SUPPORT_TICKET_STATUS_COLORS, SUPPORT_TICKET_PRIORITY_LABELS, SUPPORT_CATEGORY_LABELS, SUPPORT_CATEGORY_COLORS } from '@/lib/support/types';
import type { SupportTicketStatus, SupportTicketPriority } from '@/lib/support/types';
import { MessageSquare, Inbox, CheckCircle, AlertCircle } from 'lucide-react';

type TicketRow = {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  assigned_to: string | null;
  assigned_to_name?: string | null;
  created_at: string;
  updated_at: string;
  last_reply_at: string | null;
};
type Stats = { open: number; in_progress: number; answered: number; pending: number; resolved: number; unassigned: number; recently_updated: TicketRow[] };

const LIMIT = 20;

export default function AdminSupportPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { getAuthHeaders } = useAdminAuth();
  const view = (searchParams.get('view') ?? 'open') === 'closed' ? 'closed' : 'open';
  const pageFromUrl = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const page = pageFromUrl; // alias for dependency arrays / backwards compat
  const statusFromUrl = searchParams.get('status') ?? '';

  const [stats, setStats] = useState<Stats | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(statusFromUrl);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeConfirmTicket, setCloseConfirmTicket] = useState<TicketRow | null>(null);

  function goToPage(p: number) {
    const u = new URLSearchParams(searchParams.toString());
    u.set('page', String(p));
    router.push(`/admin/support?${u}`);
  }

  const closeTicket = async (t: TicketRow) => {
    setCloseConfirmTicket(null);
    setClosingId(t.id);
    const headers = getAuthHeaders();
    try {
      const res = await fetch(`/api/support/tickets/${t.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      if (!res.ok) throw new Error('Failed to close');
      setTickets((prev) => prev.filter((x) => x.id !== t.id));
      setTotal((prev) => Math.max(0, prev - 1));
      if (stats) {
        const next = { ...stats, resolved: stats.resolved + 1, recently_updated: stats.recently_updated };
        if (t.status === 'open') next.open = Math.max(0, stats.open - 1);
        else if (t.status === 'in_progress') next.in_progress = Math.max(0, (stats.in_progress ?? 0) - 1);
        else if (t.status === 'answered') next.answered = Math.max(0, stats.answered - 1);
        else if (t.status === 'pending') next.pending = Math.max(0, stats.pending - 1);
        setStats(next);
      }
    } catch {
      setError('Failed to close ticket');
    } finally {
      setClosingId(null);
    }
  };

  useEffect(() => {
    setStatusFilter(statusFromUrl);
  }, [statusFromUrl]);

  useEffect(() => {
    const headers = getAuthHeaders();
    fetch('/api/support/stats', { credentials: 'include', headers })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, [getAuthHeaders]);

  useEffect(() => {
    const headers = getAuthHeaders();
    const params = new URLSearchParams({ page: String(pageFromUrl), limit: String(LIMIT), view });
    if (statusFilter) params.set('status', statusFilter);
    fetch(`/api/support/tickets?${params}`, { credentials: 'include', headers })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((data) => {
        setTickets(data.tickets ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [pageFromUrl, statusFilter, view, getAuthHeaders]);

  const formatDate = (s: string) => new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  function formatLastReply(lastReplyAt: string | null): string {
    if (!lastReplyAt) return '—';
    const ms = Date.now() - new Date(lastReplyAt).getTime();
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    if (mins > 0) return `${mins}m`;
    return '< 1m';
  }

  if (loading && tickets.length === 0) {
    return (
      <div className="admin-orders-page" style={{ padding: '1.5rem' }}>
        <div className="app-loading"><AppLoadingIcon /></div>
      </div>
    );
  }

  return (
    <div className="admin-orders-page">
      <header className="admin-orders-header">
        <h1 className="admin-page-title">Support</h1>
      </header>

      <nav className="admin-orders-tabs" aria-label="Ticket list">
        <Link
          href="/admin/support"
          className={`admin-orders-tab ${view === 'open' ? 'admin-orders-tab--active' : ''}`}
          aria-current={view === 'open' ? 'page' : undefined}
        >
          Open
        </Link>
        <Link
          href="/admin/support?view=closed"
          className={`admin-orders-tab ${view === 'closed' ? 'admin-orders-tab--active' : ''}`}
          aria-current={view === 'closed' ? 'page' : undefined}
        >
          Closed
        </Link>
      </nav>

      {stats && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="admin-card" style={{ minWidth: 120 }}>
            <Inbox size={20} style={{ color: 'var(--accent)', marginBottom: '0.35rem' }} />
            <div className="admin-time">Open</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.open}</div>
          </div>
          <div className="admin-card" style={{ minWidth: 120 }}>
            <MessageSquare size={20} style={{ color: '#3b82f6', marginBottom: '0.35rem' }} />
            <div className="admin-time">In progress</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.in_progress ?? 0}</div>
          </div>
          <div className="admin-card" style={{ minWidth: 120 }}>
            <MessageSquare size={20} style={{ color: 'var(--success)', marginBottom: '0.35rem' }} />
            <div className="admin-time">Answered</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.answered}</div>
          </div>
          <div className="admin-card" style={{ minWidth: 120 }}>
            <MessageSquare size={20} style={{ color: 'var(--warn)', marginBottom: '0.35rem' }} />
            <div className="admin-time">Pending</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.pending}</div>
          </div>
          <div className="admin-card" style={{ minWidth: 120 }}>
            <CheckCircle size={20} style={{ color: 'var(--success)', marginBottom: '0.35rem' }} />
            <div className="admin-time">Resolved / Closed</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.resolved}</div>
          </div>
          <div className="admin-card" style={{ minWidth: 120 }}>
            <AlertCircle size={20} style={{ color: 'var(--muted)', marginBottom: '0.35rem' }} />
            <div className="admin-time">Unassigned</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.unassigned}</div>
          </div>
        </div>
      )}

      <div className="admin-card" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        <select
          className="admin-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            const u = new URLSearchParams(searchParams.toString());
            if (e.target.value) u.set('status', e.target.value);
            else u.delete('status');
            u.delete('page');
            router.push(`/admin/support?${u}`);
          }}
          style={{ minWidth: 140 }}
        >
          <option value="">All statuses</option>
          {view === 'open' ? (
            <>
              <option value="open">Open</option>
              <option value="answered">Answered</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
            </>
          ) : (
            <>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </>
          )}
        </select>
      </div>

      {error && <p style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</p>}

      <div className="admin-card admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Department</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Updated</th>
              <th>Assigned</th>
              <th>Last reply</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={9} className="admin-orders-empty">
                  {view === 'closed' ? 'No closed tickets.' : 'No open tickets.'}
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id}>
                  <td className="admin-mono">{t.ticket_number}</td>
                  <td>
                    <span
                      className="admin-badge support-status-badge"
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        background: (SUPPORT_CATEGORY_COLORS[t.category] ?? SUPPORT_CATEGORY_COLORS.other).bg,
                        color: (SUPPORT_CATEGORY_COLORS[t.category] ?? SUPPORT_CATEGORY_COLORS.other).color,
                      }}
                    >
                      {SUPPORT_CATEGORY_LABELS[t.category as keyof typeof SUPPORT_CATEGORY_LABELS] ?? t.category}
                    </span>
                  </td>
                  <td>{t.subject}</td>
                  <td>
                    <span
                      className="admin-badge support-status-badge"
                      style={{
                        background: SUPPORT_TICKET_STATUS_COLORS[t.status as SupportTicketStatus]?.bg ?? 'var(--surface)',
                        color: SUPPORT_TICKET_STATUS_COLORS[t.status as SupportTicketStatus]?.color ?? 'var(--muted)',
                      }}
                    >
                      {SUPPORT_TICKET_STATUS_LABELS[t.status as SupportTicketStatus] ?? t.status}
                    </span>
                  </td>
                  <td><span className="admin-badge admin-badge--muted">{SUPPORT_TICKET_PRIORITY_LABELS[t.priority as SupportTicketPriority] ?? t.priority}</span></td>
                  <td className="admin-time">{formatDate(t.updated_at)}</td>
                  <td className="admin-time">{t.assigned_to_name ?? 'Unassigned'}</td>
                  <td className="admin-time" title={t.last_reply_at ? new Date(t.last_reply_at).toLocaleString() : undefined}>
                    {formatLastReply(t.last_reply_at)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Link href={`/admin/support/tickets/${t.id}`} className="admin-btn admin-btn--small">View</Link>
                      {t.status !== 'closed' && t.status !== 'resolved' && (
                        <button
                          type="button"
                          className="admin-btn admin-btn--small admin-btn--danger"
                          disabled={closingId === t.id}
                          onClick={() => setCloseConfirmTicket(t)}
                        >
                          {closingId === t.id ? 'Closing…' : 'Close'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {total > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
            <span className="admin-time">
              Page {pageFromUrl} of {Math.max(1, Math.ceil(total / LIMIT))}
              {total > 0 && ` · ${total} ticket${total !== 1 ? 's' : ''} (${view})`}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="admin-btn admin-btn--small"
                disabled={pageFromUrl <= 1}
                onClick={() => goToPage(pageFromUrl - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--small"
                disabled={pageFromUrl >= Math.ceil(total / LIMIT)}
                onClick={() => goToPage(pageFromUrl + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {closeConfirmTicket && (
        <div
          className="admin-delete-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-close-ticket-confirm-title"
          onClick={(e) => e.target === e.currentTarget && setCloseConfirmTicket(null)}
        >
          <div className="admin-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="admin-close-ticket-confirm-title" className="admin-delete-confirm-title">Close ticket?</h3>
            <p className="admin-delete-confirm-message">
              Ticket <strong>{closeConfirmTicket.ticket_number}</strong> will be marked as closed. The customer will see the ticket as resolved.
            </p>
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-btn"
                onClick={() => setCloseConfirmTicket(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                disabled={closingId === closeConfirmTicket.id}
                onClick={() => closeTicket(closeConfirmTicket)}
              >
                {closingId === closeConfirmTicket.id ? 'Closing…' : 'Close ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
