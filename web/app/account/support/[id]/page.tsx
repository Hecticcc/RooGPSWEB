'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { SUPPORT_TICKET_STATUS_LABELS, SUPPORT_TICKET_STATUS_COLORS, SUPPORT_TICKET_PRIORITY_LABELS, SUPPORT_CATEGORY_LABELS, SUPPORT_CATEGORY_COLORS } from '@/lib/support/types';
import type { SupportTicketStatus, SupportTicketPriority } from '@/lib/support/types';
import { SUPPORT_ATTACHMENT_MAX_SIZE_BYTES, SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES, SUPPORT_STORAGE_BUCKET } from '@/lib/support/constants';
import SupportMessageBody from '@/components/SupportMessageBody';
import SupportReplyEditor from '@/components/SupportReplyEditor';
import { ArrowLeft, Send, Paperclip, Upload, Loader2, User } from 'lucide-react';

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  updated_at: string;
  allow_customer_close: boolean;
  allow_customer_reopen: boolean;
  closed_at: string | null;
};
type Message = { id: string; sender_type: string; body: string; created_at: string; is_internal: boolean; sender_first_name?: string };
type Attachment = { id: string; file_name: string; mime_type: string | null; file_size: number | null; created_at: string };

function formatBytes(n: number | null): string {
  if (n == null || n === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function SupportTicketDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
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
    const page = Math.max(1, parseInt(searchParams.get('msg_page') ?? '1', 10));
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      fetch(`/api/support/tickets/${id}?msg_page=${page}`, { credentials: 'include', headers })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'Not found' : 'Failed to load'))))
        .then((data) => {
          setTicket(data.ticket);
          setMessages(data.messages ?? []);
          setAttachments(data.attachments ?? []);
          setMessagePage(data.message_page ?? 1);
          setMessageLimit(data.message_limit ?? 50);
          setMessageTotal(data.message_total ?? 0);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }

  useEffect(() => { load(); }, [id, msgPageParam]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || !id) return;
    setSending(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    try {
      const res = await fetch(`/api/support/tickets/${id}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? 'Failed to send');
        setSending(false);
        return;
      }
      setReply('');
      const lastPage = Math.ceil((messageTotal + 1) / messageLimit) || 1;
      if (lastPage > 1) router.push(`/account/support/${id}?msg_page=${lastPage}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
    setSending(false);
  }

  async function doClose() {
    if (!id || !ticket?.allow_customer_close) return;
    setActionLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    try {
      await fetch(`/api/support/tickets/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ status: 'closed' }),
      });
      load();
    } finally {
      setActionLoading(false);
    }
  }

  async function doReopen() {
    if (!id || !ticket?.allow_customer_reopen) return;
    setActionLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    try {
      await fetch(`/api/support/tickets/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ reopen: true }),
      });
      load();
    } finally {
      setActionLoading(false);
    }
  }

  async function downloadAttachment(attachmentId: string) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    const res = await fetch(`/api/support/tickets/${id}/attachments/${attachmentId}`, { credentials: 'include', headers });
    if (!res.ok) return;
    const { url } = await res.json();
    if (url) window.open(url, '_blank');
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !id) return;
    if (file.size > SUPPORT_ATTACHMENT_MAX_SIZE_BYTES) {
      setUploadError(`File must be under ${SUPPORT_ATTACHMENT_MAX_SIZE_BYTES / 1024 / 1024} MB`);
      return;
    }
    if (!SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES.includes(file.type as (typeof SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES)[number])) {
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
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session?.access_token) (headers as Record<string, string>)['Authorization'] = `Bearer ${session.access_token}`;
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

  if (loading && !ticket) {
    return (
      <div className="dashboard-orders support-ticket-detail-page" style={{ padding: '2rem' }}>
        <div className="app-loading"><AppLoadingIcon /></div>
      </div>
    );
  }
  if (error || !ticket) {
    return (
      <div className="dashboard-orders support-ticket-detail-page" style={{ padding: '2rem' }}>
        <p style={{ color: 'var(--error)' }}>{error ?? 'Ticket not found'}</p>
        <Link href="/account/support" className="admin-btn">Back to tickets</Link>
      </div>
    );
  }

  const isClosed = ['closed', 'resolved'].includes(ticket.status);
  const canReply = !isClosed;
  const departmentLabel = SUPPORT_CATEGORY_LABELS[ticket.category as keyof typeof SUPPORT_CATEGORY_LABELS] ?? ticket.category;
  const departmentColors = SUPPORT_CATEGORY_COLORS[ticket.category] ?? SUPPORT_CATEGORY_COLORS.other;

  return (
    <div className="dashboard-orders support-ticket-detail-page" style={{ padding: '1.5rem', width: '100%', minWidth: 0 }}>
      <Link href="/account/support" className="admin-time" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '1rem' }}>
        <ArrowLeft size={16} /> Back to tickets
      </Link>
      <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>{ticket.subject}</h1>
      <p className="admin-time" style={{ marginBottom: '1.5rem' }}>Ticket #{ticket.ticket_number}</p>

      <div style={{ display: 'flex', flexDirection: 'row', gap: '1.5rem', width: '100%', minWidth: 0, alignItems: 'flex-start' }}>
        <aside className="ticket-detail-sidebar" style={{ flexShrink: 0 }}>
          <div className="admin-card" style={{ padding: '1rem', position: 'sticky', top: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', margin: '0 0 1rem', fontWeight: 600 }}>Ticket Information</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>Requestor</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <User size={14} /> You
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>Department</div>
                <span
                  className="admin-badge support-status-badge"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: departmentColors.bg, color: departmentColors.color }}
                >
                  {departmentLabel}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>Submitted</div>
                <div className="admin-time" style={{ fontSize: '0.875rem' }}>{new Date(ticket.created_at).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>Last updated</div>
                <div className="admin-time" style={{ fontSize: '0.875rem' }}>{new Date(ticket.updated_at).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>Status</div>
                <span
                  className="admin-badge support-status-badge"
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: SUPPORT_TICKET_STATUS_COLORS[ticket.status as SupportTicketStatus]?.bg ?? 'var(--surface)',
                    color: SUPPORT_TICKET_STATUS_COLORS[ticket.status as SupportTicketStatus]?.color ?? 'var(--muted)',
                  }}
                >
                  {SUPPORT_TICKET_STATUS_LABELS[ticket.status as SupportTicketStatus] ?? ticket.status}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>Priority</div>
                <span className="admin-badge admin-badge--muted" style={{ padding: '0.25rem 0.5rem' }}>
                  {SUPPORT_TICKET_PRIORITY_LABELS[ticket.priority as SupportTicketPriority] ?? ticket.priority}
                </span>
              </div>
              {(canReply && ticket.allow_customer_close) || (isClosed && ticket.allow_customer_reopen) ? (
                <div style={{ marginTop: '0.5rem' }}>
                  {canReply && ticket.allow_customer_close && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--small"
                      style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                      onClick={doClose}
                      disabled={actionLoading}
                    >
                      Close ticket
                    </button>
                  )}
                  {isClosed && ticket.allow_customer_reopen && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--small"
                      style={{ width: '100%', marginTop: canReply ? '0.35rem' : 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                      onClick={doReopen}
                      disabled={actionLoading}
                    >
                      Reopen ticket
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div style={{ flex: '1 1 0', minWidth: 0 }}>
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

            return (
              <div
                key={m.id}
                style={{
                  padding: '0.75rem 1rem',
                  background: m.sender_type === 'staff' ? 'rgba(249, 115, 22, 0.08)' : 'var(--surface)',
                  borderRadius: 8,
                  borderLeft: `3px solid ${m.sender_type === 'staff' ? 'var(--accent)' : 'var(--muted)'}`,
                }}
              >
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>
                  {m.sender_type === 'customer'
                    ? 'You'
                    : `${m.sender_first_name ?? 'Support'} · Staff`} · {new Date(m.created_at).toLocaleString()}
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
              onClick={() => router.push(`/account/support/${id}?msg_page=${messagePage - 1}`)}
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
              onClick={() => router.push(`/account/support/${id}?msg_page=${messagePage + 1}`)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="admin-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Attachments</h2>
        {attachments.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
            {attachments.map((a) => (
              <li key={a.id} style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Paperclip size={14} style={{ flexShrink: 0 }} />
                <button
                  type="button"
                  className="admin-btn admin-btn--small"
                  style={{ padding: '0.25rem 0.5rem', textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  onClick={() => downloadAttachment(a.id)}
                >
                  {a.file_name}
                </button>
                <span className="admin-time" style={{ flexShrink: 0 }}>{formatBytes(a.file_size)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-time" style={{ fontSize: '0.9rem', margin: 0 }}>No attachments yet.</p>
        )}
        {canReply && (
          <>
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
              style={{ marginTop: '0.75rem' }}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 size={14} style={{ marginRight: '0.35rem', animation: 'spin 0.8s linear infinite' }} /> : <Upload size={14} style={{ marginRight: '0.35rem' }} />}
              {uploading ? 'Uploading…' : 'Add attachment'}
            </button>
            {uploadError && <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: '0.35rem' }}>{uploadError}</p>}
          </>
        )}
      </div>

      {canReply && (
        <form onSubmit={sendReply} className="admin-card" style={{ padding: '1.25rem' }}>
          <SupportReplyEditor
            id="reply"
            value={reply}
            onChange={setReply}
            placeholder="Type your message..."
            rows={4}
            label="Reply"
            disabled={sending}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={sending || !reply.trim()}>
              <Send size={16} style={{ marginRight: '0.35rem' }} /> {sending ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </form>
      )}
        </div>
      </div>
    </div>
  );
}
