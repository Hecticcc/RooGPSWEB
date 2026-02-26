'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

type AdminAuthContextValue = {
  getAuthHeaders: () => HeadersInit;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({
  accessToken,
  children,
}: {
  accessToken: string | null;
  children: ReactNode;
}) {
  const value = useMemo<AdminAuthContextValue | null>(
    () =>
      accessToken
        ? {
            getAuthHeaders: () => ({
              'Cache-Control': 'no-cache',
              Authorization: `Bearer ${accessToken}`,
            }),
          }
        : null,
    [accessToken]
  );
  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    return {
      getAuthHeaders: () => ({ 'Cache-Control': 'no-cache' }),
    };
  }
  return ctx;
}
