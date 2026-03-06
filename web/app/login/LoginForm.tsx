'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Logo from '@/components/Logo';

const REMEMBER_ME_KEY = 'roogps_remember_me';
const REMEMBER_ME_COOKIE = 'roogps_remember_me';
const REMEMBERED_EMAIL_KEY = 'roogps_remembered_email';

function setRememberMeCookie(remember: boolean) {
  if (typeof document === 'undefined') return;
  const value = remember ? '1' : '0';
  document.cookie = `${REMEMBER_ME_COOKIE}=${value}; path=/; max-age=120`;
}

function getStoredRememberMe(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = localStorage.getItem(REMEMBER_ME_KEY);
    return v !== 'false';
  } catch {
    return true;
  }
}

function setStoredRememberMe(value: boolean) {
  try {
    localStorage.setItem(REMEMBER_ME_KEY, String(value));
  } catch {}
}

function getRememberedEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

function setRememberedEmail(email: string) {
  try {
    if (email) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  } catch {}
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/track';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const storedRemember = getStoredRememberMe();
    setRememberMe(storedRemember);
    if (storedRemember) {
      const storedEmail = getRememberedEmail();
      if (storedEmail) setEmail(storedEmail);
    }
  }, [mounted]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setStoredRememberMe(rememberMe);
    setRememberMeCookie(rememberMe);
    if (rememberMe) setRememberedEmail(email);
    else setRememberedEmail('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    await new Promise((r) => setTimeout(r, 0));
    const safeRedirect = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/track';
    window.location.href = safeRedirect;
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card-inner">
          <div className="auth-card-logo">
            <Logo size={36} wide />
          </div>
          <div className="auth-card-title-wrap">
            <h1 className="auth-card-title">Sign in</h1>
          </div>
          <p className="auth-tagline">
            Sign in to view your trackers and live locations on the map.
          </p>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="auth-input"
                placeholder="you@example.com"
              />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="auth-input"
                placeholder="••••••••"
              />
            </div>
            <div className="auth-field auth-field-remember">
              <label className="auth-remember-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="auth-remember-checkbox"
                />
                <span>Remember me</span>
              </label>
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="auth-forgot-wrap">
              <Link href="/login/forgot" className="auth-forgot-link">Forgot password?</Link>
            </p>
          </form>
          <p className="auth-card-footer">
            No account?{' '}
            <Link href="/register">Register</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
