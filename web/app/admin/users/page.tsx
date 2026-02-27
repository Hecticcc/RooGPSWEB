'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '../AdminAuthContext';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { roleLabel } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';

const AU_TZ = 'Australia/Sydney';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: AU_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

type UserRow = {
  id: string;
  email: string | null;
  role: string;
  created_at: string | null;
  role_created_at: string | null;
  device_count: number;
  last_sign_in_at: string | null;
};

export default function AdminUsersPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [me, setMe] = useState<{ role: UserRole } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    const headers = getAuthHeaders();
    Promise.all([
      fetch('/api/me', { credentials: 'include', cache: 'no-store', headers }).then((r) => r.ok ? r.json() : null),
      fetch('/api/admin/users', { credentials: 'include', cache: 'no-store', headers }).then((r) => {
        if (!r.ok) throw new Error('Failed to load users');
        return r.json();
      }),
    ])
      .then(([meData, list]) => {
        setMe(meData ?? null);
        setUsers(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [getAuthHeaders]);

  const isAdmin = me?.role === 'administrator';
  const canChangeRole = me?.role === 'staff_plus' || isAdmin;
  const canSetAdmin = isAdmin;

  async function changeRole(userId: string, newRole: string) {
    if (!canChangeRole) return;
    if (newRole === 'administrator' && !canSetAdmin) return;
    setActing(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to update role');
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } finally {
      setActing(null);
    }
  }

  async function disableUser(userId: string) {
    if (!isAdmin) return;
    if (!confirm('Disable this user? They will not be able to sign in.')) return;
    setActing(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/disable`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed');
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } finally {
      setActing(null);
    }
  }

  async function deleteUser(userId: string) {
    if (!isAdmin) return;
    if (!confirm('Permanently delete this user and all their data? This cannot be undone.')) return;
    setActing(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/delete`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed');
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } finally {
      setActing(null);
    }
  }

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;

  return (
    <>
      <h1 className="admin-page-title">Users</h1>
      <div className="admin-card admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
              <th>Devices</th>
              <th>Last login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email ?? '—'}</td>
                <td>
                  {canChangeRole && (u.role !== 'administrator' || canSetAdmin) ? (
                    <select
                      className="admin-select"
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      disabled={acting === u.id}
                    >
                      {(['customer', 'staff', 'staff_plus', 'administrator'] as const).map((r) => (
                        <option key={r} value={r} disabled={r === 'administrator' && !canSetAdmin}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    roleLabel(u.role as UserRole)
                  )}
                </td>
                <td className="admin-time">{formatDate(u.created_at)}</td>
                <td>{u.device_count}</td>
                <td className="admin-time">{formatDate(u.last_sign_in_at)}</td>
                <td>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        className="admin-btn"
                        onClick={() => disableUser(u.id)}
                        disabled={acting === u.id}
                      >
                        Disable
                      </button>
                      {' '}
                      <button
                        type="button"
                        className="admin-btn admin-btn--danger"
                        onClick={() => deleteUser(u.id)}
                        disabled={acting === u.id}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
