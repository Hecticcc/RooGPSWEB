'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { SUPPORT_CATEGORY_LABELS, SUPPORT_TICKET_PRIORITY_LABELS } from '@/lib/support/types';
import type { SupportCategory, SupportTicketPriority } from '@/lib/support/types';
import { SUPPORT_TICKET_SUBJECT_MAX_LENGTH, SUPPORT_TICKET_DESCRIPTION_MAX_LENGTH } from '@/lib/support/constants';
import { ArrowLeft } from 'lucide-react';

export default function NewSupportTicketPage() {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('general');
  const [priority, setPriority] = useState<SupportTicketPriority>('medium');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (subject.trim().length < 3) {
      setError('Subject must be at least 3 characters');
      return;
    }
    if (subject.trim().length > SUPPORT_TICKET_SUBJECT_MAX_LENGTH) {
      setError(`Subject must be ${SUPPORT_TICKET_SUBJECT_MAX_LENGTH} characters or fewer`);
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (description.trim().length > SUPPORT_TICKET_DESCRIPTION_MAX_LENGTH) {
      setError(`Description must be ${SUPPORT_TICKET_DESCRIPTION_MAX_LENGTH} characters or fewer`);
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority,
          description: description.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Failed to create ticket');
        setSubmitting(false);
        return;
      }
      const id = (data as { ticket?: { id: string } }).ticket?.id;
      if (id) router.push(`/account/support/${id}`);
      else router.push('/account/support');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-orders" style={{ padding: '1.5rem' }}>
      <Link href="/account/support" className="admin-time" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '1rem' }}>
        <ArrowLeft size={16} /> Back to tickets
      </Link>
      <h1 className="my-orders-title" style={{ marginBottom: '0.5rem' }}>New support ticket</h1>
      <p className="my-orders-subtitle" style={{ marginBottom: '1.5rem' }}>Describe your issue and we’ll get back to you.</p>

      <form onSubmit={handleSubmit} className="admin-card" style={{ padding: '1.5rem' }}>
        <div className="admin-form-row" style={{ marginBottom: '1rem' }}>
          <label htmlFor="subject">Subject *</label>
          <input
            id="subject"
            type="text"
            className="admin-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, SUPPORT_TICKET_SUBJECT_MAX_LENGTH))}
            placeholder="Brief summary"
            required
            minLength={3}
            maxLength={SUPPORT_TICKET_SUBJECT_MAX_LENGTH}
            style={{ width: '100%' }}
          />
          <div className="admin-time" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {subject.length} / {SUPPORT_TICKET_SUBJECT_MAX_LENGTH}
          </div>
        </div>
        <div className="admin-form-row" style={{ marginBottom: '1rem' }}>
          <label htmlFor="category">Category</label>
          <select id="category" className="admin-select" value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
            {(Object.entries(SUPPORT_CATEGORY_LABELS) as [SupportCategory, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="admin-form-row" style={{ marginBottom: '1rem' }}>
          <label htmlFor="priority">Priority</label>
          <select id="priority" className="admin-select" value={priority} onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}>
            {(Object.entries(SUPPORT_TICKET_PRIORITY_LABELS) as [SupportTicketPriority, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="admin-form-row" style={{ marginBottom: '1rem' }}>
          <label htmlFor="description">Description *</label>
          <textarea
            id="description"
            className="admin-input"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, SUPPORT_TICKET_DESCRIPTION_MAX_LENGTH))}
            placeholder="Describe your issue in detail..."
            required
            maxLength={SUPPORT_TICKET_DESCRIPTION_MAX_LENGTH}
            rows={6}
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div className="admin-time" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {description.length} / {SUPPORT_TICKET_DESCRIPTION_MAX_LENGTH}
          </div>
        </div>
        {error && <p style={{ color: 'var(--error)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create ticket'}
          </button>
          <Link href="/account/support" className="admin-btn">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
