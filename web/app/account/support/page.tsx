'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { SUPPORT_TICKET_STATUS_LABELS, SUPPORT_TICKET_STATUS_COLORS, SUPPORT_TICKET_PRIORITY_LABELS } from '@/lib/support/types';
import type { SupportTicketStatus, SupportTicketPriority } from '@/lib/support/types';
import { Plus, MessageSquare } from 'lucide-react';

type TicketRow = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  updated_at: string;
};

const LIMIT = 20;

export default function SupportTicketsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pageFromUrl = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const statusFromUrl = searchParams.get('status') ?? '';

  function goToPage(p: number) {
    const u = new URLSearchParams(searchParams.toString());
    u.set('page', String(p));
    router.push(`/account/support?${u}`);
  }

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(statusFromUrl);

  useEffect(() => {
    setStatusFilter(statusFromUrl);
  }, [statusFromUrl]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const params = new URLSearchParams({ page: String(pageFromUrl), limit: String(LIMIT) });
      if (statusFilter) params.set('status', statusFilter);
      fetch(`/api/support/tickets?${params}`, { credentials: 'include', headers })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 401 ? 'Unauthorized' : 'Failed to load'))))
        .then((data) => {
          setTickets(data.tickets ?? []);
          setTotal(data.total ?? 0);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [pageFromUrl, statusFilter]);

  const formatDate = (s: string) => new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  if (loading && tickets.length === 0) {
    return (
      <div className="dashboard-orders" style={{ padding: '2rem' }}>
        <div className="app-loading"><AppLoadingIcon /></div>
      </div>
    );
  }

  return (
    <div className="dashboard-orders my-orders-page support-tickets-page" style={{ padding: '1.5rem 1rem', width: '100%', boxSizing: 'border-box' }}>
      <header className="my-orders-header">
        <h1 className="my-orders-title">Support</h1>
        <p className="my-orders-subtitle">View and manage your support tickets.</p>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
        <Link href="/account/support/new" className="admin-btn admin-btn--primary support-new-ticket-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> New ticket
        </Link>
        <select
          className="admin-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            const u = new URLSearchParams(searchParams.toString());
            if (e.target.value) u.set('status', e.target.value);
            else u.delete('status');
            u.delete('page');
            router.push(`/account/support?${u}`);
          }}
          style={{ minWidth: '140px' }}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="answered">Answered</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {error && <p style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</p>}

      {tickets.length === 0 ? (
        <div className="admin-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <MessageSquare size={48} style={{ color: 'var(--muted)', marginBottom: '1rem' }} />
          <p style={{ marginBottom: '1rem' }}>No support tickets yet.</p>
          <Link href="/account/support/new" className="admin-btn admin-btn--primary">Create a ticket</Link>
        </div>
      ) : (
        <div className="admin-card admin-table-wrap support-tickets-list">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td className="admin-mono">{t.ticket_number}</td>
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
                  <td>
                    <Link href={`/account/support/${t.id}`} className="admin-btn support-ticket-view-btn">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
              <span className="admin-time">
                Page {pageFromUrl} of {Math.max(1, Math.ceil(total / LIMIT))}
                {total > 0 && ` · ${total} ticket${total !== 1 ? 's' : ''} total`}
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
      )}
    </div>
  );
}
