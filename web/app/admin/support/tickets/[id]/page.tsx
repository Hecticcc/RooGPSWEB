'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminAuth } from '../../../AdminAuthContext';
import { createClient } from '@/lib/supabase';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import {
  SUPPORT_TICKET_STATUS_LABELS,
  SUPPORT_TICKET_STATUS_COLORS,
  SUPPORT_TICKET_PRIORITY_LABELS,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_CATEGORY_LABELS,
} from '@/lib/support/types';
import type { SupportTicketStatus, SupportTicketPriority } from '@/lib/support/types';
import { SUPPORT_ATTACHMENT_MAX_SIZE_BYTES, SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES, SUPPORT_STORAGE_BUCKET } from '@/lib/support/constants';
import SupportMessageBody from '@/components/SupportMessageBody';
import SupportReplyEditor from '@/components/SupportReplyEditor';
import { ArrowLeft, Send, Lock, User, Smartphone, Package, CreditCard, Paperclip, Upload, Loader2, XCircle, RotateCcw, X } from 'lucide-react';

type Ticket = {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  linked_device_id: string | null;
  linked_order_id: string | null;
};
type Message = { id: string; sender_type: string; body: string; created_at: string; is_internal: boolean };
type Attachment = { id: string; file_name: string; mime_type: string | null; file_size: number | null; created_at: string };
type Context = {
  profile: { first_name: string | null; last_name: string | null; mobile: string | null } | null;
  email: string | null;
  device: { id: string; name: string | null; last_seen_at: string | null } | null;
  order: { id: string; status: string; created_at: string } | null;
  devices: { id: string; name: string | null; last_seen_at: string | null }[];
  subscriptions: { id: string; order_number: string | null; status: string; billing_state_normalized: string | null; stripe_subscription_id: string | null }[];
};
type StaffMember = { id: string; first_name: string | null; last_name: string | null };
type Assignee = { user_id: string; first_name: string | null; last_name: string | null };

function formatBytes(n: number | null): string {
  if (n == null || n === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function AdminSupportTicketDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { getAuthHeaders } = useAdminAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [context, setContext] = useState<Context | null>(null);
  const [assignableStaff, setAssignableStaff] = useState<StaffMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [showInternalNote, setShowInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messagePage, setMessagePage] = useState(1);
  const [messageLimit, setMessageLimit] = useState(50);
  const [messageTotal, setMessageTotal] = useState(0);

  const searchParams = useSearchParams();
  const router = useRouter();
  const msgPageParam = Math.max(1, parseInt(searchParams.get('msg_page') ?? '1', 10));

  function load() {
    if (!id) return;
    const headers = getAuthHeaders();
    const page = Math.max(1, parseInt(searchParams.get('msg_page') ?? '1', 10));
    fetch(`/api/support/tickets/${id}?msg_page=${page}`, { credentials: 'include', headers })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'Not found' : 'Failed to load'))))
      .then((data) => {
        setTicket(data.ticket);
        setMessages(data.messages ?? []);
        setAttachments(data.attachments ?? []);
        setContext(data.context ?? null);
        setAssignableStaff(data.assignable_staff ?? []);
        setCurrentUserId(data.current_user_id ?? null);
        setStatus(data.ticket?.status ?? '');
        setPriority(data.ticket?.priority ?? '');
        setAssignees(data.assignees ?? []);
        setMessagePage(data.message_page ?? 1);
        setMessageLimit(data.message_limit ?? 50);
        setMessageTotal(data.message_total ?? 0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id, getAuthHeaders, msgPageParam]);

  async function sendReply(isInternal: boolean) {
    const body = isInternal ? internalNote.trim() : reply.trim();
    if (!body || !id) return;
    setSending(true);
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    try {
      const res = await fetch(`/api/support/tickets/${id}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ body, is_internal: isInternal }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? 'Failed to send');
        setSending(false);
        return;
      }
      if (isInternal) {
        setInternalNote('');
        setShowInternalNote(false);
      } else {
        setReply('');
        const lastPage = Math.ceil((messageTotal + 1) / messageLimit) || 1;
        if (lastPage > 1) router.push(`/admin/support/tickets/${id}?msg_page=${lastPage}`);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
    setSending(false);
  }

  async function updateStatusPriority() {
    if (!id) return;
    const updates: Record<string, string> = {};
    if (status && SUPPORT_TICKET_STATUSES.includes(status as SupportTicketStatus)) updates.status = status;
    if (priority && SUPPORT_TICKET_PRIORITIES.includes(priority as SupportTicketPriority)) updates.priority = priority;
    if (Object.keys(updates).length === 0) return;
    setUpdating(true);
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    try {
      await fetch(`/api/support/tickets/${id}`, { method: 'PATCH', credentials: 'include', headers, body: JSON.stringify(updates) });
      load();
    } finally {
      setUpdating(false);
    }
  }

  async function updateAssignees(assigneeIds: string[]) {
    if (!id) return;
    setUpdating(true);
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    try {
      await fetch(`/api/support/tickets/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ assignee_ids: assigneeIds }),
      });
      load();
    } finally {
      setUpdating(false);
    }
  }

  function addAssignee(userId: string) {
    if (assignees.some((a) => a.user_id === userId)) return;
    const staff = assignableStaff.find((s) => s.id === userId);
    const newAssignees = [...assignees, { user_id: userId, first_name: staff?.first_name ?? null, last_name: staff?.last_name ?? null }];
    setAssignees(newAssignees);
    updateAssignees(newAssignees.map((a) => a.user_id));
  }

  function removeAssignee(userId: string) {
    const newAssignees = assignees.filter((a) => a.user_id !== userId);
    setAssignees(newAssignees);
    updateAssignees(newAssignees.map((a) => a.user_id));
  }

  async function closeTicket() {
    if (!id || isClosed) return;
    setUpdating(true);
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    try {
      const res = await fetch(`/api/support/tickets/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ status: 'closed' }),
      });
      if (res.ok) load();
      else {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? 'Failed to close ticket');
      }
    } finally {
      setUpdating(false);
    }
  }

  async function reopenTicket() {
    if (!id || !isClosed) return;
    setUpdating(true);
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    try {
      const res = await fetch(`/api/support/tickets/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ status: 'open' }),
      });
      if (res.ok) load();
      else {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? 'Failed to reopen ticket');
      }
    } finally {
      setUpdating(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !id) return;
    if (file.size > SUPPORT_ATTACHMENT_MAX_SIZE_BYTES) {
      setUploadError(`File must be under ${SUPPORT_ATTACHMENT_MAX_SIZE_BYTES / 1024 / 1024} MB`);
      return;
    }
    if (!SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES.includes(file.type as typeof SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES[number])) {
      setUploadError('File type not allowed');
      return;
    }
    setUploadError(null);
    setUploading(true);
    const supabase = createClient();
    const path = `${id}/${crypto.randomUUID()}/${file.name}`;
    try {
      const { error: uploadErr } = await supabase.storage.from(SUPPORT_STORAGE_BUCKET).upload(path, file, { contentType: file.type });
      if (uploadErr) {
        setUploadError(uploadErr.message);
        setUploading(false);
        return;
      }
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch(`/api/support/tickets/${id}/attachments`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ storage_path: path, file_name: file.name, mime_type: file.type, file_size: file.size }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setUploadError((d as { error?: string }).error ?? 'Failed to attach');
        setUploading(false);
        return;
      }
      load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    }
    setUploading(false);
  }

  async function downloadAttachment(attachmentId: string) {
    const headers = getAuthHeaders();
    const res = await fetch(`/api/support/tickets/${id}/attachments/${attachmentId}`, { credentials: 'include', headers });
    if (!res.ok) return;
    const { url } = await res.json();
    if (url) window.open(url, '_blank');
  }

  if (loading && !ticket) {
    return (
      <div style={{ padding: '2rem' }}>
        <div className="app-loading"><AppLoadingIcon /></div>
      </div>
    );
  }
  if (error || !ticket) {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: 'var(--error)' }}>{error ?? 'Ticket not found'}</p>
        <Link href="/admin/support" className="admin-btn">Back to Support</Link>
      </div>
    );
  }

  const isClosed = ['closed', 'resolved'].includes(ticket.status);
  const customerName = context?.profile
    ? [context.profile.first_name, context.profile.last_name].filter(Boolean).join(' ').trim() || '—'
    : '—';

  const departmentLabel = SUPPORT_CATEGORY_LABELS[ticket.category as keyof typeof SUPPORT_CATEGORY_LABELS] ?? ticket.category;

  return (
    <div style={{ padding: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', width: '100%', minWidth: 0 }}>
      <aside className="admin-ticket-sidebar">
        <div className="admin-card">
          <section className="ticket-sidebar-section">
            <h3 className="ticket-sidebar-title">Ticket</h3>
            <div className="ticket-sidebar-row">
              <span className="ticket-sidebar-label">Requestor</span>
              <span className="ticket-sidebar-value" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <User size={14} style={{ flexShrink: 0, opacity: 0.7 }} /> {customerName}
              </span>
            </div>
            <div className="ticket-sidebar-row">
              <span className="ticket-sidebar-label">Department</span>
              <span className="ticket-sidebar-badge">{departmentLabel}</span>
            </div>
            <div className="ticket-sidebar-row">
              <span className="ticket-sidebar-label">Submitted</span>
              <span className="ticket-sidebar-meta">{new Date(ticket.created_at).toLocaleString()}</span>
            </div>
            <div className="ticket-sidebar-row">
              <span className="ticket-sidebar-label">Last updated</span>
              <span className="ticket-sidebar-meta">{new Date(ticket.updated_at).toLocaleString()}</span>
            </div>
            <div className="ticket-sidebar-row">
              <span className="ticket-sidebar-label">Status</span>
              <select
                className="admin-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                onBlur={updateStatusPriority}
                disabled={updating}
              >
                {SUPPORT_TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>{SUPPORT_TICKET_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="ticket-sidebar-row">
              <span className="ticket-sidebar-label">Priority</span>
              <select
                className="admin-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                onBlur={updateStatusPriority}
                disabled={updating}
              >
                {SUPPORT_TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{SUPPORT_TICKET_PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div className="ticket-sidebar-actions">
              {!isClosed ? (
                <button
                  type="button"
                  className="admin-btn admin-btn--small"
                  disabled={updating}
                  onClick={closeTicket}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                >
                  {updating ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <XCircle size={14} />}
                  Close ticket
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-btn admin-btn--small"
                  disabled={updating}
                  onClick={reopenTicket}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                >
                  {updating ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <RotateCcw size={14} />}
                  Reopen
                </button>
              )}
            </div>
          </section>

          <div className="ticket-sidebar-divider" />
          <section className="ticket-sidebar-section">
            <h3 className="ticket-sidebar-title">Customer</h3>
            <div className="ticket-sidebar-row">
              <span className="ticket-sidebar-label">Name</span>
              <span className="ticket-sidebar-value">{customerName}</span>
            </div>
            {context?.email && (
              <div className="ticket-sidebar-row">
                <span className="ticket-sidebar-label">Email</span>
                <a href={`mailto:${context.email}`} className="ticket-sidebar-link">{context.email}</a>
              </div>
            )}
            {context?.profile?.mobile && (
              <div className="ticket-sidebar-row">
                <span className="ticket-sidebar-label">Phone</span>
                <a href={`tel:${context.profile.mobile}`} className="ticket-sidebar-link">{context.profile.mobile}</a>
              </div>
            )}
          </section>

          <div className="ticket-sidebar-divider" />
          <section className="ticket-sidebar-section">
            <h3 className="ticket-sidebar-title">Assignment</h3>
            {assignees.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.5rem' }}>
                {assignees.map((a) => (
                  <li key={a.user_id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                    <span style={{ flex: 1, fontSize: '0.875rem' }}>
                      {[a.first_name, a.last_name].filter(Boolean).join(' ') || 'Staff'}
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn--small"
                      style={{ padding: '0.2rem 0.4rem' }}
                      disabled={updating}
                      onClick={() => removeAssignee(a.user_id)}
                      aria-label={`Remove assignee`}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ticket-sidebar-meta" style={{ margin: '0 0 0.5rem' }}>Unassigned</p>
            )}
            <select
              className="admin-select"
              value=""
              onChange={(e) => { const v = e.target.value; if (v) addAssignee(v); e.target.value = ''; }}
              disabled={updating}
              style={{ width: '100%', marginBottom: '0.4rem' }}
              aria-label="Add staff"
            >
              <option value="">Add staff…</option>
              {assignableStaff.filter((s) => !assignees.some((a) => a.user_id === s.id)).map((s) => (
                <option key={s.id} value={s.id}>
                  {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.id.slice(0, 8)}
                </option>
              ))}
            </select>
            {currentUserId && (
              <button
                type="button"
                className="admin-btn admin-btn--small"
                style={{ width: '100%' }}
                disabled={updating || assignees.some((a) => a.user_id === currentUserId)}
                onClick={() => addAssignee(currentUserId)}
              >
                Assign to me
              </button>
            )}
          </section>

          <div className="ticket-sidebar-divider" />
          <section className="ticket-sidebar-section">
            <h3 className="ticket-sidebar-title">Attachments</h3>
            {attachments.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.5rem', fontSize: '0.8125rem' }}>
                {attachments.map((a) => (
                  <li key={a.id} style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Paperclip size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                    <button
                      type="button"
                      className="admin-btn admin-btn--small"
                      style={{ padding: '0.2rem 0.4rem', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '100%', textAlign: 'left', flex: 1, minWidth: 0 }}
                      onClick={() => downloadAttachment(a.id)}
                    >
                      {a.file_name}
                    </button>
                    <span className="ticket-sidebar-meta" style={{ flexShrink: 0 }}>{formatBytes(a.file_size)}</span>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES.join(',')}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="admin-btn admin-btn--small"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              style={{ width: '100%' }}
            >
              {uploading ? <Loader2 size={14} style={{ marginRight: '0.35rem', animation: 'spin 0.8s linear infinite' }} /> : <Upload size={14} style={{ marginRight: '0.35rem' }} />}
              {uploading ? 'Uploading…' : 'Add attachment'}
            </button>
            {uploadError && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginTop: '0.35rem' }}>{uploadError}</p>}
          </section>

        {((context?.devices?.length ?? 0) > 0 || (context?.subscriptions?.length ?? 0) > 0) && (
          <>
            <div className="ticket-sidebar-divider" />
            <section className="ticket-sidebar-section">
              <h3 className="ticket-sidebar-title">Devices & subscriptions</h3>
              {context?.devices && context.devices.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.8125rem' }}>
                    {context.devices.map((d) => {
                      const lastSeen = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
                      const isActive = lastSeen > Date.now() - 24 * 60 * 60 * 1000;
                      const statusLabel = lastSeen ? (isActive ? 'Active' : 'Inactive') : '—';
                      return (
                        <li key={d.id} style={{ marginBottom: '0.5rem' }}>
                          <Link href={`/admin/devices/${d.id}`} className="ticket-sidebar-link" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Smartphone size={12} style={{ flexShrink: 0 }} /> {d.name || d.id}{d.model_name ? ` · ${d.model_name}` : ''}
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
                            <span className="ticket-sidebar-badge">{statusLabel}</span>
                            {d.last_seen_at && <span className="ticket-sidebar-meta">Last seen {new Date(d.last_seen_at).toLocaleString()}</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {context?.subscriptions && context.subscriptions.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.8125rem' }}>
                  {context.subscriptions.map((s) => {
                    const status = s.billing_state_normalized || s.status;
                    const lower = status?.toLowerCase();
                    const isPastDue = lower === 'past_due';
                    const label = isPastDue ? 'Overdue' : (status ?? '—');
                    return (
                      <li key={s.id} style={{ marginBottom: '0.5rem' }}>
                        <Link href={`/admin/orders/${s.id}`} className="ticket-sidebar-link" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <CreditCard size={12} style={{ flexShrink: 0 }} /> {s.order_number || s.id.slice(0, 8) + '…'}
                        </Link>
                        <div style={{ marginTop: '0.2rem' }}>
                          <span className={`ticket-sidebar-badge ${isPastDue ? 'ticket-sidebar-badge--overdue' : ''}`}>{label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
        </div>
      </aside>

      <div style={{ flex: '1 1 400px', minWidth: 0 }}>
        <Link href="/admin/support" className="admin-time" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '1rem' }}>
          <ArrowLeft size={16} /> Back to Support
        </Link>
        <h1 style={{ fontSize: '1.35rem', margin: '0 0 0.5rem' }}>{ticket.subject}</h1>
        <p className="admin-time" style={{ marginBottom: '1rem' }}>Ticket #{ticket.ticket_number}</p>

        <div className="admin-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>Conversation</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.map((m) => {
              const isSystem = m.sender_type === 'system';
              const isReopened = isSystem && m.body.startsWith('Ticket reopened by');
              const isClosed = isSystem && m.body.startsWith('Ticket closed by');
              const isSystemNotice = isReopened || isClosed;

              if (isSystemNotice) {
                const sysBg = isReopened ? 'rgba(59, 130, 246, 0.12)' : 'rgba(239, 68, 68, 0.12)';
                const sysColor = isReopened ? '#3b82f6' : '#ef4444';
                return (
                  <div key={m.id} style={{ width: '100%' }}>
                    <div
                      style={{
                        padding: '0.65rem 1rem',
                        borderRadius: 8,
                        background: sysBg,
                        color: sysColor,
                        fontSize: '0.9375rem',
                        fontWeight: 700,
                        textAlign: 'center',
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      {m.body}
                      <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem', fontWeight: 400 }}>
                        {new Date(m.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              }

              const sysStyle = isSystem ? { background: 'rgba(59, 130, 246, 0.1)', borderLeft: '3px solid #3b82f6' } : {};
              return (
                <div
                  key={m.id}
                  style={{
                    padding: '0.75rem 1rem',
                    background: m.is_internal ? 'rgba(100, 100, 120, 0.15)' : m.sender_type === 'customer' ? 'rgba(249, 115, 22, 0.08)' : isSystem ? sysStyle.background : 'var(--surface)',
                    borderRadius: 8,
                    borderLeft: `3px solid ${m.is_internal ? 'var(--muted)' : m.sender_type === 'customer' ? 'var(--accent)' : isSystem ? sysStyle.borderLeft : 'var(--success)'}`,
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>
                    {m.is_internal && <Lock size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />}
                    {m.sender_type === 'customer' ? 'Customer' : m.sender_type === 'staff' ? 'Staff' : 'System'}
                    {m.is_internal && ' (internal)'} · {new Date(m.created_at).toLocaleString()}
                  </div>
                  <SupportMessageBody body={m.body} />
                </div>
              );
            })}
          </div>
          {messageTotal > messageLimit && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                className="admin-btn admin-btn--small"
                disabled={messagePage <= 1}
                onClick={() => router.push(`/admin/support/tickets/${id}?msg_page=${messagePage - 1}`)}
              >
                Previous
              </button>
              <span className="admin-time" style={{ fontSize: '0.9rem' }}>
                Page {messagePage} of {Math.ceil(messageTotal / messageLimit) || 1}
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--small"
                disabled={messagePage >= Math.ceil(messageTotal / messageLimit)}
                onClick={() => router.push(`/admin/support/tickets/${id}?msg_page=${messagePage + 1}`)}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {!isClosed && (
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); sendReply(false); }}
              className="admin-card"
              style={{ padding: '1.25rem', marginBottom: '1rem' }}
            >
              <SupportReplyEditor
                id="reply"
                value={reply}
                onChange={setReply}
                placeholder="Your reply (visible to customer)"
                rows={4}
                label="Reply to customer"
                disabled={sending}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={sending || !reply.trim()}>
                  <Send size={16} style={{ marginRight: '0.35rem' }} /> Send reply
                </button>
              </div>
            </form>
            <div className="admin-card" style={{ padding: '1.25rem' }}>
              {!showInternalNote ? (
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => setShowInternalNote(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Lock size={14} /> Add internal note (not visible to customer)
                </button>
              ) : (
                <>
                  <label htmlFor="internal" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                    <Lock size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} /> Internal note (not visible to customer)
                  </label>
                  <SupportReplyEditor
                    id="internal"
                    value={internalNote}
                    onChange={setInternalNote}
                    placeholder="Internal note..."
                    rows={2}
                    disabled={sending}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="admin-btn"
                      disabled={sending || !internalNote.trim()}
                      onClick={() => sendReply(true)}
                    >
                      Add internal note
                    </button>
                    <button
                      type="button"
                      className="admin-btn"
                      onClick={() => { setShowInternalNote(false); setInternalNote(''); }}
                      style={{ color: 'var(--muted)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
