import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';

/** GET /api/pricing – public; returns current product pricing (sale price when set) */
export async function GET() {
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data, error } = await admin
    .from('product_pricing')
    .select('sku, label, price_cents, sale_price_cents, period')
    .order('sku');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pricing: Record<string, { label: string; price_cents: number; sale_price_cents: number | null; period: string }> = {};
  for (const row of data ?? []) {
    pricing[row.sku] = {
      label: row.label,
      price_cents: row.price_cents,
      sale_price_cents: row.sale_price_cents ?? null,
      period: row.period,
    };
  }
  return NextResponse.json({ pricing });
}
