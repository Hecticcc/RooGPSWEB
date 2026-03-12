'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import type { UserRole } from '@/lib/roles';

type UserContextValue = {
  role: UserRole | null;
  /** True while the initial /api/me fetch is in flight */
  roleLoading: boolean;
};

const UserContext = createContext<UserContextValue>({ role: null, roleLoading: true });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled || !session?.access_token) {
        if (!cancelled) setRoleLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/me', {
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setRole((data?.role ?? 'customer') as UserRole);
        }
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <UserContext.Provider value={{ role, roleLoading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  return useContext(UserContext);
}
