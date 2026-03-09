'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { SUPPORT_TICKET_STATUS_LABELS, SUPPORT_TICKET_STATUS_COLORS, SUPPORT_TICKET_PRIORITY_LABELS } from '@/lib/support/types';
import type { SupportTicketStatus, SupportTicketPriority } from '@/lib/support/types';
import { Plus, MessageSquare, ChevronRight, Inbox, Archive } from 'lucide-react';

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

type ViewTab = 'open' | 'closed';

export default function SupportTicketsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pageFromUrl = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const statusFromUrl = searchParams.get('status') ?? '';
  const viewFromUrl = (searchParams.get('view') === 'closed' ? 'closed' : 'open') as ViewTab;

  function goToPage(p: number) {
    const u = new URLSearchParams(searchParams.toString());
    u.set('page', String(p));
    router.push(`/account/support?${u}`);
  }

  function setViewTab(view: ViewTab) {
    const u = new URLSearchParams();
    u.set('view', view);
    u.delete('page');
    u.delete('status');
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
      const params = new URLSearchParams({ page: String(pageFromUrl), limit: String(LIMIT), view: viewFromUrl });
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
  }, [pageFromUrl, statusFilter, viewFromUrl]);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  if (loading && tickets.length === 0) {
    return (
      <div className="support-page">
        <div className="support-page__loading">
          <AppLoadingIcon />
        </div>
      </div>
    );
  }

  return (
    <div className="support-page">
      <header className="support-page__header">
        <div className="support-page__header-text">
          <h1 className="support-page__title">Support</h1>
          <p className="support-page__subtitle">View and manage your support tickets.</p>
        </div>
        <Link href="/account/support/new" className="support-page__new-btn">
          <Plus size={20} strokeWidth={2} /> New ticket
        </Link>
      </header>

      <div className="support-page__tabs" role="tablist" aria-label="Ticket view">
        <button
          type="button"
          role="tab"
          aria-selected={viewFromUrl === 'open'}
          onClick={() => setViewTab('open')}
          className={`support-page__tab ${viewFromUrl === 'open' ? 'support-page__tab--active' : ''}`}
        >
          <Inbox size={18} /> Open
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewFromUrl === 'closed'}
          onClick={() => setViewTab('closed')}
          className={`support-page__tab ${viewFromUrl === 'closed' ? 'support-page__tab--active' : ''}`}
        >
          <Archive size={18} /> Closed
        </button>
      </div>

      <div className="support-page__toolbar">
        <label htmlFor="support-status-filter" className="support-page__filter-label">
          Status
        </label>
        <select
          id="support-status-filter"
          className="support-page__filter-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            const u = new URLSearchParams(searchParams.toString());
            if (e.target.value) u.set('status', e.target.value);
            else u.delete('status');
            u.delete('page');
            router.push(`/account/support?${u}`);
          }}
        >
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="answered">Answered</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {error && (
        <div className="support-page__error" role="alert">
          {error}
        </div>
      )}

      {tickets.length === 0 ? (
        <div className="support-page__empty">
          <div className="support-page__empty-icon">
            <MessageSquare size={56} strokeWidth={1.25} />
          </div>
          <p className="support-page__empty-title">
            {viewFromUrl === 'closed' ? 'No closed tickets' : 'No support tickets yet'}
          </p>
          <p className="support-page__empty-desc">
            {viewFromUrl === 'closed'
              ? 'Resolved and closed tickets will appear here.'
              : 'Create a ticket and we’ll get back to you as soon as we can.'}
          </p>
          {viewFromUrl === 'open' && (
            <Link href="/account/support/new" className="support-page__empty-btn">
              Create a ticket
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul className="support-page__list" role="list">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/account/support/${t.id}`} className="support-page__card">
                  <div
                    className="support-page__card-accent"
                    style={{
                      background:
                        SUPPORT_TICKET_STATUS_COLORS[t.status as SupportTicketStatus]?.bg ?? 'var(--surface)',
                    }}
                  />
                  <div className="support-page__card-main">
                    <span className="support-page__card-id">{t.ticket_number}</span>
                    <h2 className="support-page__card-subject">{t.subject}</h2>
                    <div className="support-page__card-meta">
                      <span
                        className="support-page__card-status"
                        style={{
                          background: SUPPORT_TICKET_STATUS_COLORS[t.status as SupportTicketStatus]?.bg ?? 'var(--surface)',
                          color: SUPPORT_TICKET_STATUS_COLORS[t.status as SupportTicketStatus]?.color ?? 'var(--muted)',
                        }}
                      >
                        {SUPPORT_TICKET_STATUS_LABELS[t.status as SupportTicketStatus] ?? t.status}
                      </span>
                      <span className="support-page__card-priority">
                        {SUPPORT_TICKET_PRIORITY_LABELS[t.priority as SupportTicketPriority] ?? t.priority}
                      </span>
                      <span className="support-page__card-date">{formatDate(t.updated_at)}</span>
                    </div>
                  </div>
                  <ChevronRight className="support-page__card-chevron" size={20} />
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="support-page__pagination" aria-label="Tickets pagination">
              <span className="support-page__pagination-info">
                Page {pageFromUrl} of {totalPages} · {total} ticket{total !== 1 ? 's' : ''}
              </span>
              <div className="support-page__pagination-btns">
                <button
                  type="button"
                  className="support-page__pagination-btn"
                  disabled={pageFromUrl <= 1}
                  onClick={() => goToPage(pageFromUrl - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="support-page__pagination-btn"
                  disabled={pageFromUrl >= totalPages}
                  onClick={() => goToPage(pageFromUrl + 1)}
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
