import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 500 });
  const users = authData?.users ?? [];
  const userIds = users.map((u) => u.id);

  if (userIds.length === 0) {
    return NextResponse.json([]);
  }

  const [rolesRes, devicesRes] = await Promise.all([
    admin.from('user_roles').select('user_id, role, created_at').in('user_id', userIds),
    admin.from('devices').select('user_id'),
  ]);

  const roleByUser = new Map<string, { role: string; created_at: string }>();
  for (const r of rolesRes.data ?? []) {
    roleByUser.set(r.user_id, { role: r.role, created_at: r.created_at });
  }
  const deviceCountByUser = new Map<string, number>();
  for (const d of devicesRes.data ?? []) {
    deviceCountByUser.set(d.user_id, (deviceCountByUser.get(d.user_id) ?? 0) + 1);
  }

  const list = users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    role: roleByUser.get(u.id)?.role ?? 'customer',
    created_at: u.created_at ?? null,
    role_created_at: roleByUser.get(u.id)?.created_at ?? null,
    device_count: deviceCountByUser.get(u.id) ?? 0,
    last_sign_in_at: u.last_sign_in_at ?? null,
  }));

  return NextResponse.json(list);
}

const ALLOWED_ROLES = ['customer', 'staff', 'staff_plus', 'administrator'] as const;

/** POST /api/admin/users – create user manually (staff_plus+). Body: email (required), password?, role?, first_name?, last_name?, date_of_birth?, mobile?, address_line1?, address_line2?, suburb?, state?, postcode?, country?. */
export async function POST(request: Request) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  let body: {
    email?: string;
    password?: string;
    role?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    mobile?: string;
    address_line1?: string;
    address_line2?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

  let role = (typeof body.role === 'string' ? body.role.trim().toLowerCase() : '') || 'customer';
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) role = 'customer';
  if (role === 'administrator' && guard.role !== 'administrator') {
    return NextResponse.json({ error: 'Only administrators can create administrator users' }, { status: 403 });
  }

  const password = typeof body.password === 'string' && body.password.length > 0 ? body.password : undefined;
  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: password ?? undefined,
    email_confirm: true,
  });
  if (createErr) {
    const msg = createErr.message ?? 'Failed to create user';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (!authUser.user) return NextResponse.json({ error: 'User not created' }, { status: 500 });

  const now = new Date().toISOString();
  const { error: roleErr } = await admin
    .from('user_roles')
    .upsert({ user_id: authUser.user.id, role, updated_at: now }, { onConflict: 'user_id' });
  if (roleErr) {
    return NextResponse.json({ error: 'User created but role assignment failed: ' + roleErr.message }, { status: 500 });
  }

  const first_name = typeof body.first_name === 'string' ? body.first_name.trim() || null : null;
  const last_name = typeof body.last_name === 'string' ? body.last_name.trim() || null : null;
  let date_of_birth: string | null = null;
  if (typeof body.date_of_birth === 'string' && body.date_of_birth.trim()) {
    const d = body.date_of_birth.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) date_of_birth = d;
  }
  const mobile = typeof body.mobile === 'string' ? body.mobile.trim() || null : null;
  const address_line1 = typeof body.address_line1 === 'string' ? body.address_line1.trim() || null : null;
  const address_line2 = typeof body.address_line2 === 'string' ? body.address_line2.trim() || null : null;
  const suburb = typeof body.suburb === 'string' ? body.suburb.trim() || null : null;
  const state = typeof body.state === 'string' ? body.state.trim() || null : null;
  const postcode = typeof body.postcode === 'string' ? body.postcode.trim() || null : null;
  const country = typeof body.country === 'string' ? body.country.trim() || 'Australia' : 'Australia';

  await admin.from('profiles').upsert(
    {
      user_id: authUser.user.id,
      first_name,
      last_name,
      date_of_birth,
      mobile,
      address_line1,
      address_line2,
      suburb,
      state,
      postcode,
      country,
      updated_at: now,
    },
    { onConflict: 'user_id' }
  );

  return NextResponse.json({ id: authUser.user.id, email: authUser.user.email ?? email });
}
