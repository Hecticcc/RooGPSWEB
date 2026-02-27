import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const AUSPOST_API_KEY = process.env.AUSPOST_API_KEY ?? '';
const AUSPOST_TRACK_URL = 'https://digitalapi.auspost.com.au/shipping/v1/track';

/**
 * GET /api/orders/[id]/tracking – get tracking events for this order's tracking number.
 * Order must belong to the current user. Proxies to Australia Post Track API when configured.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
  if (!orderId) return NextResponse.json({ error: 'Order ID required' }, { status: 400 });

  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, tracking_number')
    .eq('id', orderId)
    .eq('user_id', user.id)
    .single();
  if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (!order.tracking_number?.trim()) {
    return NextResponse.json({ error: 'No tracking number for this order', tracking_id: null, events: [], track_url: null }, { status: 200 });
  }

  const trackingId = order.tracking_number.trim();
  const trackUrl = `https://auspost.com.au/track/${encodeURIComponent(trackingId)}`;

  if (!AUSPOST_API_KEY) {
    return NextResponse.json({
      tracking_id: trackingId,
      events: [],
      track_url: trackUrl,
      message: 'Tracking API not configured. Use the link below to track on Australia Post.',
    });
  }

  try {
    const url = new URL(AUSPOST_TRACK_URL);
    url.searchParams.set('tracking_ids', trackingId);
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'AUTH-KEY': AUSPOST_API_KEY,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // non-JSON response
      }
    }

    if (!res.ok) {
      return NextResponse.json({
        tracking_id: trackingId,
        events: [],
        track_url: trackUrl,
        error: `Tracking service error: ${res.status}`,
        message: 'You can track your parcel using the link below.',
      });
    }

    const trackingResults = (body as { tracking_results?: unknown[] })?.tracking_results ?? [];
    const first = trackingResults[0] as {
      tracking_id?: string;
      status?: string;
      errors?: { code?: string; name?: string; message?: string }[];
      trackable_items?: { article_id?: string; product_type?: string; events?: { location?: string; description?: string; date?: string }[] }[];
    } | undefined;
    const events: { location?: string; description?: string; date?: string }[] = [];
    if (first?.trackable_items) {
      for (const item of first.trackable_items) {
        for (const e of item.events ?? []) {
          events.push({ location: e.location, description: e.description, date: e.date });
        }
      }
    }
    // Sort by date descending (most recent first)
    events.sort((a, b) => {
      const dA = a.date ? new Date(a.date).getTime() : 0;
      const dB = b.date ? new Date(b.date).getTime() : 0;
      return dB - dA;
    });

    return NextResponse.json({
      tracking_id: trackingId,
      status: first?.status ?? null,
      events,
      track_url: trackUrl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      tracking_id: trackingId,
      events: [],
      track_url: trackUrl,
      error: message,
      message: 'You can track your parcel using the link below.',
    });
  }
}
