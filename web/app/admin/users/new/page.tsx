'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminAuth } from '../../AdminAuthContext';
import { roleLabel } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { User, Mail, MapPin } from 'lucide-react';

const ROLES: UserRole[] = ['customer', 'staff', 'staff_plus', 'administrator'];

export default function AdminCreateUserPage() {
  const router = useRouter();
  const { getAuthHeaders } = useAdminAuth();
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [mobile, setMobile] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState('Australia');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setMe(data ?? null));
  }, [getAuthHeaders]);

  const isAdmin = me?.role === 'administrator';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Email is required.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: trimmed,
          password: password.trim() || undefined,
          role,
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          date_of_birth: dob.trim() || undefined,
          mobile: mobile.trim() || undefined,
          address_line1: addressLine1.trim() || undefined,
          address_line2: addressLine2.trim() || undefined,
          suburb: suburb.trim() || undefined,
          state: state.trim() || undefined,
          postcode: postcode.trim() || undefined,
          country: country.trim() || 'Australia',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Failed to create user');
        return;
      }
      const id = (data as { id?: string }).id;
      if (id) router.push(`/admin/users/${id}`);
      else setError('User created but no ID returned.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-create-user-page">
      <div style={{ marginBottom: '1.25rem' }}>
        <Link href="/admin/users" className="admin-btn">← Users</Link>
      </div>
      <h1 className="admin-page-title">Create user</h1>
      <p className="admin-time" style={{ marginBottom: '1.5rem', maxWidth: 560 }}>
        Only email is required. You can then create a manual order for this user and assign devices/SIMs from their profile.
      </p>

      <form onSubmit={handleSubmit} className="admin-create-user-form">
        <section className="admin-create-user-section">
          <h2 className="admin-create-user-section-title">
            <Mail size={18} aria-hidden /> Account
          </h2>
          <div className="admin-create-user-grid admin-create-user-grid--2">
            <div className="admin-create-user-field admin-create-user-field--full">
              <label htmlFor="create-user-email">
                Email <span className="admin-create-user-required">*</span>
              </label>
              <input
                id="create-user-email"
                type="email"
                required
                autoComplete="email"
                className="admin-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="admin-create-user-field">
              <label htmlFor="create-user-password">Password (optional)</label>
              <input
                id="create-user-password"
                type="password"
                autoComplete="new-password"
                className="admin-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to set via reset"
              />
            </div>
            <div className="admin-create-user-field">
              <label htmlFor="create-user-role">Role</label>
              <select
                id="create-user-role"
                className="admin-input admin-select"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} disabled={r === 'administrator' && !isAdmin}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="admin-create-user-section">
          <h2 className="admin-create-user-section-title">
            <User size={18} aria-hidden /> Profile
          </h2>
          <div className="admin-create-user-grid admin-create-user-grid--2">
            <div className="admin-create-user-field">
              <label htmlFor="create-user-first-name">First name</label>
              <input
                id="create-user-first-name"
                type="text"
                autoComplete="given-name"
                className="admin-input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="admin-create-user-field">
              <label htmlFor="create-user-last-name">Last name</label>
              <input
                id="create-user-last-name"
                type="text"
                autoComplete="family-name"
                className="admin-input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
            <div className="admin-create-user-field">
              <label htmlFor="create-user-dob">Date of birth</label>
              <input
                id="create-user-dob"
                type="date"
                className="admin-input"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="admin-create-user-section">
          <h2 className="admin-create-user-section-title">
            <MapPin size={18} aria-hidden /> Address
          </h2>
          <div className="admin-create-user-grid admin-create-user-grid--2">
            <div className="admin-create-user-field admin-create-user-field--full">
              <label htmlFor="create-user-address1">Address line 1</label>
              <input
                id="create-user-address1"
                type="text"
                autoComplete="address-line1"
                className="admin-input"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="Street address"
              />
            </div>
            <div className="admin-create-user-field admin-create-user-field--full">
              <label htmlFor="create-user-address2">Address line 2</label>
              <input
                id="create-user-address2"
                type="text"
                autoComplete="address-line2"
                className="admin-input"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Unit, building, etc. (optional)"
              />
            </div>
            <div className="admin-create-user-field">
              <label htmlFor="create-user-suburb">Suburb</label>
              <input
                id="create-user-suburb"
                type="text"
                autoComplete="address-level2"
                className="admin-input"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                placeholder="Suburb"
              />
            </div>
            <div className="admin-create-user-field">
              <label htmlFor="create-user-state">State</label>
              <input
                id="create-user-state"
                type="text"
                autoComplete="address-level1"
                className="admin-input"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
              />
            </div>
            <div className="admin-create-user-field">
              <label htmlFor="create-user-postcode">Postcode</label>
              <input
                id="create-user-postcode"
                type="text"
                autoComplete="postal-code"
                className="admin-input"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Postcode"
              />
            </div>
            <div className="admin-create-user-field">
              <label htmlFor="create-user-country">Country</label>
              <input
                id="create-user-country"
                type="text"
                autoComplete="country-name"
                className="admin-input"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country"
              />
            </div>
            <div className="admin-create-user-field admin-create-user-field--full">
              <label htmlFor="create-user-mobile">Mobile</label>
              <input
                id="create-user-mobile"
                type="tel"
                autoComplete="tel"
                className="admin-input"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="Phone number"
              />
            </div>
          </div>
        </section>

        {error && (
          <p className="admin-time" style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</p>
        )}
        <div className="admin-create-user-actions">
          <button type="submit" className="admin-btn" disabled={loading}>
            {loading ? (
              <>
                <span style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}>
                  <AppLoadingIcon />
                </span>
                Creating…
              </>
            ) : (
              'Create user'
            )}
          </button>
          <Link href="/admin/users" className="admin-btn">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
