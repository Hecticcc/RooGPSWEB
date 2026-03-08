import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data, error } = await admin
    .from('product_pricing')
    .select('sku, label, price_cents, sale_price_cents, period, device_model_name, updated_at')
    .order('sku');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pricing: data ?? [] });
}

export async function PUT(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  let body: { sku: string; label?: string; price_cents?: number; sale_price_cents?: number | null; period?: string; device_model_name?: string | null }[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body)) return NextResponse.json({ error: 'Expected array of pricing rows' }, { status: 400 });

  const allowedPeriods = ['one-time', 'month', 'year'];
  for (const row of body) {
    const sku = typeof row.sku === 'string' ? row.sku.trim() : '';
    if (!sku) continue;
    const priceCents = typeof row.price_cents === 'number' ? row.price_cents : undefined;
    const salePriceCents = row.sale_price_cents === null || typeof row.sale_price_cents === 'number' ? row.sale_price_cents : undefined;
    const period = allowedPeriods.includes(row.period ?? '') ? row.period : undefined;
    const label = typeof row.label === 'string' ? row.label.trim() : undefined;
    const deviceModelName = row.device_model_name === null || typeof row.device_model_name === 'string' ? row.device_model_name : undefined;

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (label !== undefined) payload.label = label;
    if (priceCents !== undefined && priceCents >= 0) payload.price_cents = priceCents;
    if (salePriceCents !== undefined) {
      payload.sale_price_cents = salePriceCents === null ? null : Math.max(0, salePriceCents);
    }
    if (period !== undefined) payload.period = period;
    if (deviceModelName !== undefined) payload.device_model_name = deviceModelName === '' ? null : deviceModelName;

    const { error: upsertErr } = await admin
      .from('product_pricing')
      .update(payload)
      .eq('sku', sku);
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const { data: updated } = await admin.from('product_pricing').select('sku, label, price_cents, sale_price_cents, period, device_model_name, updated_at').order('sku');
  return NextResponse.json({ pricing: updated ?? [] });
}
