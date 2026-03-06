'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Logo from '@/components/Logo';

function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!hash || hash.charAt(0) !== '#') return params;
  const query = hash.slice(1);
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = decodeURIComponent(part.slice(0, eq));
    const value = decodeURIComponent(part.slice(eq + 1));
    params[key] = value;
  }
  return params;
}

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (typeof window === 'undefined') return;
      const params = parseHashParams(window.location.hash);
      const accessToken = params.access_token;
      const refreshToken = params.refresh_token;
      const type = params.type;
      if (type === 'recovery' && accessToken && refreshToken) {
        const { error: err } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (!err) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          setSessionReady(true);
          return;
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      setSessionReady(!!session);
    }
    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- init once on mount
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace('/track');
  }

  if (sessionReady === null) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-card-inner">
            <div className="auth-card-logo">
              <Logo size={36} wide />
            </div>
            <p className="auth-tagline">Loading…</p>
          </div>
        </div>
      </main>
    );
  }

  if (sessionReady === false) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-card-inner">
            <div className="auth-card-logo">
              <Logo size={36} wide />
            </div>
            <h1 className="auth-card-title">Invalid or expired link</h1>
            <p className="auth-tagline">
              This password reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <p className="auth-card-footer">
              <Link href="/login/forgot">Request new link</Link>
              {' · '}
              <Link href="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card-inner">
          <div className="auth-card-logo">
            <Logo size={36} wide />
          </div>
          <div className="auth-card-title-wrap">
            <h1 className="auth-card-title">Set new password</h1>
          </div>
          <p className="auth-tagline">
            Enter your new password below.
          </p>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="reset-password">New password</label>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="auth-input"
                placeholder="••••••••"
              />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="reset-confirm">Confirm password</label>
              <input
                id="reset-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="auth-input"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
          <p className="auth-card-footer">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
