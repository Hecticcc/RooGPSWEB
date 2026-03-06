import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const EXPIRY_OPTIONS = {
  '1h': 60 * 60,
  '6h': 6 * 60 * 60,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: deviceId } = await params;
  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', deviceId)
    .eq('user_id', user.id)
    .single();
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  let body: { expires_in?: keyof typeof EXPIRY_OPTIONS | number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const expiresIn = body.expires_in;
  let expiresInSeconds: number;
  if (typeof expiresIn === 'number' && expiresIn >= 60 && expiresIn <= 30 * 24 * 60 * 60) {
    expiresInSeconds = expiresIn;
  } else if (typeof expiresIn === 'string' && EXPIRY_OPTIONS[expiresIn as keyof typeof EXPIRY_OPTIONS]) {
    expiresInSeconds = EXPIRY_OPTIONS[expiresIn as keyof typeof EXPIRY_OPTIONS];
  } else {
    expiresInSeconds = EXPIRY_OPTIONS['24h'];
  }

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const token = randomBytes(18).toString('base64url');

  const { error } = await supabase.from('tracker_share_links').insert({
    device_id: deviceId,
    token,
    expires_at: expiresAt.toISOString(),
    created_by: user.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (!base && request.headers.get('origin')) {
    base = request.headers.get('origin')!;
  }
  const url = base ? `${base.replace(/\/$/, '')}/share/${token}` : `/share/${token}`;
  return NextResponse.json({
    token,
    url,
    expires_at: expiresAt.toISOString(),
    expires_in_seconds: expiresInSeconds,
  });
}
