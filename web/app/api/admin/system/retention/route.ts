import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const RETENTION_DAYS = parseInt(process.env.ADMIN_RETENTION_DAYS ?? '90', 10) || 90;

export async function POST(request: Request) {
  const guard = await requireRole(request, 'administrator');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();

  const { data: deleted, error } = await admin
    .from('locations')
    .delete()
    .lt('received_at', cutoffIso)
    .select('id');
  const deletedCount = deleted?.length ?? 0;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted_count: deletedCount, cutoff: cutoffIso });
}
