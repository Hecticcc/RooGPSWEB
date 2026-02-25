'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
    });
  }, []);
  return (
    <main className="dashboard-page">
    <div className="dashboard-settings">
      <h1 className="dashboard-settings-title">Settings</h1>
      <section className="dashboard-settings-section">
        <h2 className="dashboard-settings-section-title">Account</h2>
        <p className="dashboard-settings-email">
          Signed in as <strong>{email ?? '—'}</strong>
        </p>
      </section>
      <section className="dashboard-settings-section">
        <h2 className="dashboard-settings-section-title">Preferences</h2>
        <p className="dashboard-settings-muted">More options coming soon.</p>
      </section>
    </div>
    </main>
  );
}
