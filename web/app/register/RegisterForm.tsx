'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
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
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data?.user) {
      await supabase.from('user_roles').upsert(
        { user_id: data.user.id, role: 'customer' },
        { onConflict: 'user_id' }
      );
    }
    router.push('/track');
    router.refresh();
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card-inner">
          <div className="auth-card-logo">
            <Logo size={72} wide />
          </div>
          <div className="auth-card-title-wrap">
            <MapPin className="auth-card-title-icon" size={26} strokeWidth={2} />
            <h1 className="auth-card-title">Create account</h1>
          </div>
          <p className="auth-tagline">
            Get started and add your first tracker to see it on the map.
          </p>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
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
              <label className="auth-label" htmlFor="reg-password">Password (min 6 characters)</label>
              <input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
                className="auth-input"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Creating account…' : 'Register'}
            </button>
          </form>
          <p className="auth-card-footer">
            Already have an account?{' '}
            <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
