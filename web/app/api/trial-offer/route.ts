import { NextResponse } from 'next/server';
import { getTrialOffer } from '@/lib/get-trial-offer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trial-offer – public, no auth.
 * Returns the current trial offer for display on homepage and checkout.
 * Values reflect admin dashboard settings (stripe_trial_enabled, stripe_trial_default_months).
 */
export async function GET() {
  const offer = await getTrialOffer();
  return NextResponse.json(offer);
}
