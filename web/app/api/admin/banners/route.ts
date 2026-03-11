import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

/**
 * GET  /api/admin/banners  — list all banners (staff_plus+)
 * POST /api/admin/banners  — create banner (staff_plus+)
 */

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data, error } = await admin
    .from('system_banners')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ banners: data ?? [] });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  let body: { title?: string; message?: string; type?: string; active?: boolean; expires_at?: string | null } = {};
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

  const type = body.type ?? 'info';
  if (!['info', 'warning', 'error', 'success'].includes(type)) {
    return NextResponse.json({ error: 'type must be info | warning | error | success' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('system_banners')
    .insert({
      title: body.title?.trim() || null,
      message,
      type,
      active: body.active !== false,
      expires_at: body.expires_at ?? null,
      created_by: guard.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ banner: data }, { status: 201 });
}
