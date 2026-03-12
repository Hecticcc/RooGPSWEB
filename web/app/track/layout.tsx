import DashboardShell from './DashboardShell';
import { UserProvider } from '@/lib/UserContext';

export const dynamic = 'force-dynamic';

/**
 * No server-side auth here so post-login redirect works (session is in client only until cookies sync).
 * DashboardShell does client-side auth and redirects to /login if no user.
 * UserProvider fetches /api/me once and shares the result via context so
 * DashboardShell and DevicesList don't each fire their own independent request.
 */
export default function TrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <DashboardShell>{children}</DashboardShell>
    </UserProvider>
  );
}
