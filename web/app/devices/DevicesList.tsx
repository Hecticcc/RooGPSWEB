'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getAuthHeaders } from '@/lib/api-auth';
import DevicesListView from './DevicesListView';

type Device = {
  id: string;
  name: string | null;
  created_at: string;
  last_seen_at: string | null;
  latest_lat?: number | null;
  latest_lng?: number | null;
};

const ONLINE_MS = 5 * 60 * 1000;

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_MS;
}

export default function DevicesList() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function load(retried = false) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setUserEmail(user.email ?? null);
    const authHeaders = await getAuthHeaders(supabase);
    let res = await fetch('/api/devices', { credentials: 'include', headers: authHeaders });
    // If 401, try refreshing the session once (handles expired access token, refresh token still valid)
    if (res.status === 401 && !retried) {
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (!refreshErr) {
        const newHeaders = await getAuthHeaders(supabase);
        res = await fetch('/api/devices', { credentials: 'include', headers: newHeaders });
      }
    }
    if (!res.ok) {
      setError(res.status === 401 ? 'Session expired' : 'Failed to load devices');
      setLoading(false);
      return;
    }
    const data = await res.json();
    setDevices(Array.isArray(data) ? data : []);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newId.trim()) return;
    setAdding(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    const { error: err } = await supabase.from('devices').insert({
      id: newId.trim(),
      user_id: user.id,
      name: newName.trim() || null,
    });
    setAdding(false);
    if (err) {
      setError(err.message);
      return;
    }
    const addedId = newId.trim();
    const addedName = newName.trim() || null;
    setNewId('');
    setNewName('');
    // Show new device immediately (list + map when it has location)
    const newDevice: Device = {
      id: addedId,
      name: addedName,
      created_at: new Date().toISOString(),
      last_seen_at: null,
      latest_lat: null,
      latest_lng: null,
    };
    setDevices((prev) => [newDevice, ...prev]);
    setError(null);
    // Refresh full list from API; if 401, keep optimistic device and show soft message
    const authHeaders = await getAuthHeaders(supabase);
    const res = await fetch('/api/devices', { credentials: 'include', headers: authHeaders });
    if (res.ok) {
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
    }
    // If 401, list already has the new device; don't overwrite with "Session expired" blocking UI
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const onlineCount = devices.filter((d) => isOnline(d.last_seen_at)).length;
  const offlineCount = devices.length - onlineCount;

  return (
    <DevicesListView
      devices={devices}
      userEmail={userEmail}
      loading={loading}
      newId={newId}
      newName={newName}
      adding={adding}
      error={error}
      onlineCount={onlineCount}
      offlineCount={offlineCount}
      isOnline={isOnline}
      onNewIdChange={setNewId}
      onNewNameChange={setNewName}
      onAdd={handleAdd}
      onSignOut={handleSignOut}
      onRetry={() => {
        setError(null);
        setLoading(true);
        load();
      }}
    />
  );
}
