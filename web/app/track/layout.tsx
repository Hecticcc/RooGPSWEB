import DashboardShell from './DashboardShell';

export const dynamic = 'force-dynamic';

/**
 * No server-side auth here so post-login redirect works (session is in client only until cookies sync).
 * DashboardShell does client-side auth and redirects to /login if no user.
 */
export default function TrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
