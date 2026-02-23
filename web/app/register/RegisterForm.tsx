'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import Logo from '@/components/Logo';

export default function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/devices');
    router.refresh();
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <Logo size={72} wide />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, textAlign: 'center', color: 'var(--text)' }}>
          Create account
        </h1>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--muted)' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              width: '100%',
              padding: '12px 14px',
              marginBottom: 16,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 16,
            }}
          />
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--muted)' }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={6}
            style={{
              width: '100%',
              padding: '12px 14px',
              marginBottom: 24,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 16,
            }}
          />
          {error ? <p style={{ color: 'var(--error)', fontSize: 14, marginBottom: 16 }}>{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 14,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: 'white',
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--muted)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
