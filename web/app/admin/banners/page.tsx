'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, X, Check } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { useAdminAuth } from '../AdminAuthContext';

type Banner = {
  id: string;
  title: string | null;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  active: boolean;
  expires_at: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<Banner['type'], string> = {
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  success: 'Success',
};

const EMPTY_FORM = { title: '', message: '', type: 'info' as Banner['type'], active: true, expires_at: '' };

export default function AdminBannersPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/banners', { credentials: 'include', headers: getAuthHeaders(), cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load banners');
      const data = await res.json();
      setBanners(data.banners ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [getAuthHeaders]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(b: Banner) {
    setEditId(b.id);
    setForm({
      title: b.title ?? '',
      message: b.message,
      type: b.type,
      active: b.active,
      expires_at: b.expires_at ? b.expires_at.slice(0, 16) : '',
    });
    setFormError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    setFormError(null);
  }

  async function handleSave() {
    if (!form.message.trim()) { setFormError('Message is required.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title: form.title.trim() || null,
        message: form.message.trim(),
        type: form.type,
        active: form.active,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };
      const url = editId ? `/api/admin/banners/${editId}` : '/api/admin/banners';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError((d as { error?: string }).error ?? 'Failed to save'); return; }
      setShowForm(false);
      setEditId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: Banner) {
    await fetch(`/api/admin/banners/${b.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !b.active }),
    });
    setBanners((prev) => prev.map((x) => x.id === b.id ? { ...x, active: !b.active } : x));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this banner?')) return;
    await fetch(`/api/admin/banners/${id}`, { method: 'DELETE', credentials: 'include', headers: getAuthHeaders() });
    setBanners((prev) => prev.filter((b) => b.id !== id));
  }

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>;

  return (
    <>
      <div className="admin-banners-header">
        <h1 className="admin-page-title" style={{ margin: 0 }}>Banners</h1>
        <button type="button" className="admin-btn admin-btn--primary admin-banners-add-btn" onClick={openCreate}>
          <Plus size={15} aria-hidden /> New banner
        </button>
      </div>
      <p className="admin-system-card-desc" style={{ marginBottom: 16 }}>
        Active banners are shown at the top of every user&apos;s dashboard. Staff+ and above can manage them.
      </p>

      {showForm && (
        <div className="admin-card admin-banners-form-card">
          <div className="admin-banners-form-title">
            <Megaphone size={16} aria-hidden />
            {editId ? 'Edit banner' : 'New banner'}
          </div>
          <div className="admin-system-form">
            <div className="admin-system-field">
              <label className="admin-system-field-label">Title <span className="admin-system-field-hint">(optional)</span></label>
              <input className="admin-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Scheduled maintenance" />
            </div>
            <div className="admin-system-field">
              <label className="admin-system-field-label">Message <span className="admin-system-field-hint">*</span></label>
              <textarea className="admin-input" rows={3} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="Banner message shown to users…" />
            </div>
            <div className="admin-banners-form-row">
              <div className="admin-system-field" style={{ flex: 1 }}>
                <label className="admin-system-field-label">Type</label>
                <select className="admin-input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Banner['type'] }))}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="success">Success</option>
                </select>
              </div>
              <div className="admin-system-field" style={{ flex: 1 }}>
                <label className="admin-system-field-label">Expires at <span className="admin-system-field-hint">(optional)</span></label>
                <input className="admin-input" type="datetime-local" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} />
              </div>
            </div>
            <label className="admin-system-toggle" style={{ marginTop: 4 }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              <span className="admin-system-toggle-label">Active (visible to users)</span>
            </label>
            {formError && <p className="admin-system-toast admin-system-toast--error">{formError}</p>}
            <div className="admin-system-actions-row" style={{ marginTop: 12 }}>
              <button type="button" className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
                <Check size={14} aria-hidden /> {saving ? 'Saving…' : editId ? 'Save changes' : 'Create banner'}
              </button>
              <button type="button" className="admin-btn" onClick={cancelForm} disabled={saving}>
                <X size={14} aria-hidden /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {banners.length === 0 ? (
        <div className="admin-card admin-banners-empty">
          <Megaphone size={28} strokeWidth={1.5} aria-hidden />
          <p>No banners yet. Create one to display a message on users&apos; dashboards.</p>
        </div>
      ) : (
        <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Type</th>
                <th>Title / Message</th>
                <th>Expires</th>
                <th>Created</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((b) => (
                <tr key={b.id} className={b.active ? '' : 'admin-banners-row--inactive'}>
                  <td>
                    <button
                      type="button"
                      className={`admin-banners-status-btn ${b.active ? 'admin-banners-status-btn--active' : 'admin-banners-status-btn--inactive'}`}
                      onClick={() => toggleActive(b)}
                      title={b.active ? 'Click to deactivate' : 'Click to activate'}
                    >
                      {b.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      {b.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <span className={`admin-banners-type-badge admin-banners-type-badge--${b.type}`}>
                      {TYPE_LABELS[b.type]}
                    </span>
                  </td>
                  <td className="admin-banners-message-cell">
                    {b.title && <div className="admin-banners-title">{b.title}</div>}
                    <div className="admin-banners-message">{b.message}</div>
                  </td>
                  <td className="admin-time">{b.expires_at ? new Date(b.expires_at).toLocaleString() : '—'}</td>
                  <td className="admin-time">{new Date(b.created_at).toLocaleString()}</td>
                  <td>
                    <div className="admin-banners-actions">
                      <button type="button" className="admin-btn admin-btn--sm" onClick={() => openEdit(b)} title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button type="button" className="admin-btn admin-btn--sm admin-btn--danger" onClick={() => handleDelete(b.id)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
