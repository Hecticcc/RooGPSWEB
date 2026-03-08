import { createServiceRoleClient } from '@/lib/admin-auth';

export type TrialOffer = {
  trial_enabled: boolean;
  trial_months: number | null;
};

/**
 * Server-side: read admin-configured trial offer for display on marketing and checkout.
 * Returns only what's needed for public display (no auth required when used via API).
 */
export async function getTrialOffer(): Promise<TrialOffer> {
  const admin = createServiceRoleClient();
  if (!admin) return { trial_enabled: false, trial_months: null };
  const { data } = await admin
    .from('system_settings')
    .select('stripe_trial_enabled, stripe_trial_default_months')
    .eq('id', 'default')
    .single();
  const row = data as { stripe_trial_enabled?: boolean; stripe_trial_default_months?: number | null } | null;
  const enabled = row?.stripe_trial_enabled === true;
  const months = row?.stripe_trial_default_months;
  const trial_months =
    typeof months === 'number' && Number.isFinite(months) && months >= 0 && months <= 24 ? months : null;
  return {
    trial_enabled: enabled && (trial_months ?? 0) > 0,
    trial_months: trial_months ?? null,
  };
}
