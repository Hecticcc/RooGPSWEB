import LoginForm from './LoginForm';
import { createServiceRoleClient } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  let maintenanceMode = false;
  try {
    const admin = createServiceRoleClient();
    if (admin) {
      const { data } = await admin
        .from('system_settings')
        .select('maintenance_mode')
        .eq('id', 'default')
        .single();
      maintenanceMode = data?.maintenance_mode ?? false;
    }
  } catch {
    // fail open — don't break the login page
  }

  return <LoginForm maintenanceMode={maintenanceMode} />;
}
