'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import DashboardShell from '../track/DashboardShell';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/login');
      setChecked(true);
    });
  }, [router]);

  if (!checked) {
    return (
      <div className="app-loading">
        <AppLoadingIcon />
      </div>
    );
  }

  return <DashboardShell>{children}</DashboardShell>;
}
