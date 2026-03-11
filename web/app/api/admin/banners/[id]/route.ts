import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

/**
 * PATCH  /api/admin/banners/[id]  — update banner (staff_plus+)
 * DELETE /api/admin/banners/[id]  — delete banner (staff_plus+)
 */

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  let body: { title?: string | null; message?: string; type?: string; active?: boolean; expires_at?: string | null } = {};
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.message !== undefined) {
    const msg = body.message.trim();
    if (!msg) return NextResponse.json({ error: 'message cannot be empty' }, { status: 400 });
    updates.message = msg;
  }
  if (body.title !== undefined) updates.title = body.title?.trim() || null;
  if (body.type !== undefined) {
    if (!['info', 'warning', 'error', 'success'].includes(body.type)) {
      return NextResponse.json({ error: 'type must be info | warning | error | success' }, { status: 400 });
    }
    updates.type = body.type;
  }
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (body.expires_at !== undefined) updates.expires_at = body.expires_at ?? null;

  const { data, error } = await admin
    .from('system_banners')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ banner: data });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { error } = await admin.from('system_banners').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
