'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import AppLoadingIcon from '@/components/AppLoadingIcon';

export default function ActivatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams?.get('code') ?? '';
  const [code, setCode] = useState(codeFromUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setCode((c) => codeFromUrl || c);
  }, [codeFromUrl]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setSignedIn(!!user);
      setAuthChecked(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) {
      setError('Enter your activation code');
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

    try {
      const res = await fetch('/api/activation', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ code: c }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Activation failed');
      setSuccess(true);
      setDeviceId(data.device_id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setLoading(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="app-loading">
        <AppLoadingIcon />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Activate your tracker</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Sign in to your account to activate your device with the code from your order.</p>
          <Link href={`/login?redirect=${encodeURIComponent('/activate' + (codeFromUrl ? `?code=${encodeURIComponent(codeFromUrl)}` : ''))}`} className="admin-btn admin-btn--primary">
            Sign in
          </Link>
          {' '}
          <Link href="/register" className="admin-btn">Sign up</Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8, color: 'var(--success)' }}>Device activated</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Your tracker is now linked to your account. You can view it on your dashboard.</p>
          <Link href="/track" className="admin-btn admin-btn--primary">Go to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 360, width: '100%' }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Activate your tracker</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Enter the activation code from your order slip or email.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Activation code"
            style={{ width: '100%', padding: 12, marginBottom: 16, fontFamily: 'monospace', letterSpacing: 2 }}
            maxLength={32}
          />
          {error && <p style={{ color: 'var(--error)', marginBottom: 16 }}>{error}</p>}
          <button type="submit" className="admin-btn admin-btn--primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Activating…' : 'Activate'}
          </button>
        </form>
        <p style={{ marginTop: 24, fontSize: 14, color: 'var(--muted)' }}>
          <Link href="/track">Back to dashboard</Link>
        </p>
      </div>
    </div>
  );
}
