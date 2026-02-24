'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { getAuthHeaders } from '@/lib/api-auth';
import dynamic from 'next/dynamic';
import AppHeader from '@/components/AppHeader';

const MapboxMap = dynamic(() => import('@/components/MapboxMap'), { ssr: false });

type Latest = {
  latitude: number | null;
  longitude: number | null;
  gps_time: string | null;
  received_at: string;
  gps_valid: boolean | null;
  speed_kph: number | null;
  course_deg: number | null;
  event_code: string | null;
};

type HistoryRow = Latest & { id: string };

type Device = {
  id: string;
  name: string | null;
  last_seen_at: string | null;
};

export default function DeviceDetail() {
  const params = useParams();
  const id = params.id as string;
  const [device, setDevice] = useState<Device | null>(null);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 16);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchLatest() {
    const headers = await getAuthHeaders(supabase);
    const res = await fetch(`/api/devices/${id}/latest`, { credentials: 'include', headers });
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setLatest(data);
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    const fromDate = new Date(from).toISOString();
    const toDate = new Date(to).toISOString();
    const headers = await getAuthHeaders(supabase);
    const res = await fetch(`/api/devices/${id}/history?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&limit=2000`, { credentials: 'include', headers });
    setHistoryLoading(false);
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setHistory(data);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserEmail(user.email ?? null);
      const { data: dev, error: devErr } = await supabase
        .from('devices')
        .select('id, name, last_seen_at')
        .eq('id', id)
        .single();
      if (devErr || !dev) {
        router.push('/devices');
        return;
      }
      setDevice(dev);
      await fetchLatest();
      await fetchHistory();
      setLoading(false);
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    pollRef.current = setInterval(fetchLatest, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (loading || !device) {
    return (
      <main className="dashboard-page">
        <AppHeader userEmail={userEmail} onSignOut={handleSignOut} />
        <div className="device-detail-content">
          <p style={{ color: 'var(--muted)' }}>Loading…</p>
        </div>
      </main>
    );
  }

  const hasCoords = latest && latest.latitude != null && latest.longitude != null;

  return (
    <main className="dashboard-page">
      <AppHeader userEmail={userEmail} onSignOut={handleSignOut} />
      <div className="device-detail-content">
        <header style={{ marginBottom: 24 }}>
          <Link href="/devices" style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8, display: 'inline-block' }}>
            ← Dashboard
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>{device.name || device.id}</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
            Last seen: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Never'}
          </p>
        </header>

        <section style={{ marginBottom: 24, padding: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Latest</h2>
        {latest ? (
          <div className="device-detail-stats" style={{ fontSize: 14 }}>
            <div>
              <span style={{ color: 'var(--muted)' }}>Time</span>
              <div>{latest.gps_time ? new Date(latest.gps_time).toLocaleString() : '—'}</div>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Received</span>
              <div>{new Date(latest.received_at).toLocaleString()}</div>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>GPS valid</span>
              <div>{latest.gps_valid == null ? '—' : latest.gps_valid ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Speed (kph)</span>
              <div>{latest.speed_kph != null ? latest.speed_kph : '—'}</div>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Event</span>
              <div>{latest.event_code || '—'}</div>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--muted)' }}>No location data yet.</p>
        )}
      </section>

        <section className="device-detail-map-wrap" style={{ marginBottom: 24 }}>
        {hasCoords ? (
          <MapboxMap
            lat={latest!.latitude!}
            lng={latest!.longitude!}
            history={history.filter((h) => h.latitude != null && h.longitude != null) as { latitude: number; longitude: number }[]}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
            No position to show on map
          </div>
        )}
      </section>

        <section style={{ padding: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>History</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>From</span>
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                style={{
                  padding: '8px 10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text)',
                }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>To</span>
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                style={{
                  padding: '8px 10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text)',
                }}
              />
            </label>
            <button
              type="button"
              onClick={fetchHistory}
              disabled={historyLoading}
              style={{
                padding: '8px 16px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'white',
                fontSize: 14,
              }}
            >
              {historyLoading ? 'Loading…' : 'Load'}
            </button>
          </div>
        <div className="table-wrap">
          <table style={{ width: '100%', minWidth: 320, fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', color: 'var(--muted)', fontWeight: 500 }}>Time</th>
                <th style={{ padding: '8px 12px', color: 'var(--muted)', fontWeight: 500 }}>GPS valid</th>
                <th style={{ padding: '8px 12px', color: 'var(--muted)', fontWeight: 500 }}>Speed (kph)</th>
                <th style={{ padding: '8px 12px', color: 'var(--muted)', fontWeight: 500 }}>Event</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 100).map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    {row.gps_time ? new Date(row.gps_time).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{row.gps_valid == null ? '—' : row.gps_valid ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '8px 12px' }}>{row.speed_kph != null ? row.speed_kph : '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{row.event_code || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history.length > 100 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            Showing first 100 of {history.length} rows
          </p>
        )}
        {history.length === 0 && !historyLoading && (
          <p style={{ color: 'var(--muted)' }}>No history in this range.</p>
        )}
        </section>
      </div>
    </main>
  );
}
