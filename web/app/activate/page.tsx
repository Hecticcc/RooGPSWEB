'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { KeyRound, Check } from 'lucide-react';

export default function ActivatePage() {
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
      <div className="activate-page">
        <div className="activate-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <AppLoadingIcon />
          <p style={{ margin: '1rem 0 0', color: 'var(--muted)', fontSize: 14 }}>Checking sign-in…</p>
        </div>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="activate-page">
        <div className="activate-card">
          <div className="activate-icon-wrap">
            <KeyRound size={28} strokeWidth={2} aria-hidden />
          </div>
          <h1 className="activate-title">Activate your tracker</h1>
          <p className="activate-subtitle">
            Sign in to your account to activate your device with the code from your order.
          </p>
          <div className="activate-actions">
            <Link
              href={`/login?redirect=${encodeURIComponent('/activate' + (codeFromUrl ? `?code=${encodeURIComponent(codeFromUrl)}` : ''))}`}
              className="activate-btn activate-btn--primary"
            >
              Sign in
            </Link>
            <Link href="/register" className="activate-btn">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="activate-page">
        <div className={`activate-card activate-card--success`}>
          <div className="activate-icon-wrap">
            <Check size={28} strokeWidth={2.5} aria-hidden />
          </div>
          <h1 className="activate-title" style={{ color: 'var(--success)' }}>Device activated</h1>
          <p className="activate-subtitle">
            Your tracker is now linked to your account. You can view it on your dashboard.
          </p>
          <div className="activate-success-cta">
            <Link href="/track" className="activate-btn activate-btn--primary">
              Go to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="activate-page">
      <div className="activate-card">
        <div className="activate-icon-wrap">
          <KeyRound size={28} strokeWidth={2} aria-hidden />
        </div>
        <h1 className="activate-title">Activate your tracker</h1>
        <p className="activate-subtitle">
          Enter the activation code from your order slip or email.
        </p>
        <form onSubmit={handleSubmit} className="activate-form">
          <input
            type="text"
            className="activate-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. XXXXX-XXXXX"
            maxLength={32}
            disabled={loading}
            autoComplete="one-time-code"
            aria-label="Activation code"
          />
          {error && <p className="activate-error" role="alert">{error}</p>}
          <button type="submit" className="activate-submit" disabled={loading}>
            {loading ? (
              <>
                <span className="activate-spinner" aria-hidden />
                Activating…
              </>
            ) : (
              'Activate'
            )}
          </button>
        </form>
        <p style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link href="/track" className="activate-link">Back to dashboard</Link>
        </p>
      </div>
    </div>
  );
}
