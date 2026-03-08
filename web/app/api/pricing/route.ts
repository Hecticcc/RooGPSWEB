import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

/** GET /api/pricing – public; returns current product pricing (sale price when set) */
export async function GET() {
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data, error } = await admin
    .from('product_pricing')
    .select('sku, label, price_cents, sale_price_cents, period, device_model_name, show_in_checkout')
    .order('sku');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pricing: Record<string, { label: string; price_cents: number; sale_price_cents: number | null; period: string; device_model_name?: string | null; show_in_checkout?: boolean }> = {};
  for (const row of data ?? []) {
    const r = row as { device_model_name?: string | null; show_in_checkout?: boolean };
    pricing[row.sku] = {
      label: row.label,
      price_cents: row.price_cents,
      sale_price_cents: row.sale_price_cents ?? null,
      period: row.period,
      device_model_name: r.device_model_name ?? null,
      show_in_checkout: r.show_in_checkout !== false,
    };
  }
  return NextResponse.json(
    { pricing },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
