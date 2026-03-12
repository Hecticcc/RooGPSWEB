'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import Logo from '@/components/Logo';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const redirectTo = `${origin}/login/reset-password`;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    // Log the send so it appears in the admin "Emails sent" view.
    // Fire-and-forget — don't block the success state on this.
    fetch('/api/auth/record-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_email: email, event_name: 'account.password_reset' }),
    }).catch(() => {});
    setSuccess(true);
  }

  if (success) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-card-inner">
            <div className="auth-card-logo">
              <Logo size={36} wide />
            </div>
            <h1 className="auth-card-title">Check your email</h1>
            <p className="auth-tagline">
              We&apos;ve sent a password reset link to <strong>{email}</strong>. Click the link to set a new password.
            </p>
            <p className="auth-card-footer">
              <Link href="/login">Back to sign in</Link>
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
            <h1 className="auth-card-title">Forgot password</h1>
          </div>
          <p className="auth-tagline">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="auth-input"
                placeholder="you@example.com"
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Sending…' : 'Send reset link'}
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
