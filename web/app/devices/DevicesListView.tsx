'use client';

import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import DashboardMap from '@/components/DashboardMap';

type Device = {
  id: string;
  name: string | null;
  created_at: string;
  last_seen_at: string | null;
  latest_lat?: number | null;
  latest_lng?: number | null;
};

type Props = {
  devices: Device[];
  userEmail: string | null;
  loading: boolean;
  newId: string;
  newName: string;
  adding: boolean;
  error: string | null;
  onlineCount: number;
  offlineCount: number;
  isOnline: (lastSeen: string | null) => boolean;
  onNewIdChange: (v: string) => void;
  onNewNameChange: (v: string) => void;
  onAdd: (e: React.FormEvent) => void;
  onSignOut: () => void;
  onRetry?: () => void;
};

export default function DevicesListView(props: Props) {
  const {
    devices,
    userEmail,
    loading,
    newId,
    newName,
    adding,
    error,
    onlineCount,
    offlineCount,
    isOnline,
    onNewIdChange,
    onNewNameChange,
    onAdd,
    onSignOut,
    onRetry,
  } = props;

  const mapMarkers = devices
    .filter((d) => d.latest_lat != null && d.latest_lng != null)
    .map((d) => ({ id: d.id, name: d.name, lat: d.latest_lat!, lng: d.latest_lng! }));

  return (
    <main className="dashboard-page">
      <AppHeader userEmail={userEmail} onSignOut={onSignOut} />
      <section className="dashboard-map-wrap">
        <DashboardMap markers={mapMarkers} />
      </section>
      <div className="dashboard-content">
        {loading ? (
          <p style={{ color: 'var(--muted)', padding: '24px 0' }}>Loading…</p>
        ) : (
          <>
            <div className="dashboard-cards" style={{ marginBottom: 24 }}>
              <div className="dashboard-section" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Online receivers</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)' }}>{onlineCount}</div>
              </div>
              <div className="dashboard-section" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Offline receivers</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{offlineCount}</div>
              </div>
              <div className="dashboard-section" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>All receivers</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{devices.length}</div>
              </div>
            </div>

            <section className="dashboard-section" style={{ marginBottom: 24, padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Add device</h2>
              <form onSubmit={onAdd} className="dashboard-add-form">
                <div style={{ flex: '1 1 auto' }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--muted)' }}>Device ID</label>
                  <input
                    className="input-id"
                    value={newId}
                    onChange={(e) => onNewIdChange(e.target.value)}
                    placeholder="e.g. 123456789012345"
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--muted)' }}>Name (optional)</label>
                  <input
                    className="input-name"
                    value={newName}
                    onChange={(e) => onNewNameChange(e.target.value)}
                    placeholder="My tracker"
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={adding}
                  style={{
                    padding: '10px 20px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: 'white',
                    fontWeight: 500,
                  }}
                >
                  {adding ? 'Adding…' : 'Add'}
                </button>
              </form>
              {error ? (
                <p style={{ color: 'var(--error)', fontSize: 14, marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span>{error}</span>
                  {onRetry ? (
                    <button
                      type="button"
                      onClick={() => onRetry?.()}
                      style={{
                        padding: '6px 12px',
                        fontSize: 13,
                        background: 'var(--accent-muted)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      Try again
                    </button>
                  ) : null}
                </p>
              ) : null}
            </section>

            <section className="dashboard-section">
              <h2 style={{ fontSize: 16, fontWeight: 500, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                Overview receivers
              </h2>
              {devices.length === 0 ? (
                <p style={{ padding: 24, color: 'var(--muted)' }}>No devices yet. Add one above.</p>
              ) : (
                <div className="table-wrap">
                  <table style={{ width: '100%', minWidth: 360, fontSize: 14, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px 16px', color: 'var(--muted)', fontWeight: 500 }}>Status</th>
                        <th style={{ padding: '12px 16px', color: 'var(--muted)', fontWeight: 500 }}>Marker name</th>
                        <th style={{ padding: '12px 16px', color: 'var(--muted)', fontWeight: 500 }}>Last seen</th>
                        <th style={{ padding: '12px 16px', color: 'var(--muted)', fontWeight: 500 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((d) => (
                        <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: isOnline(d.last_seen_at) ? 'var(--accent)' : 'var(--muted)',
                              }}
                            />
                            <span style={{ marginLeft: 8, fontSize: 13 }}>{isOnline(d.last_seen_at) ? 'Online' : 'Offline'}</span>
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 500 }}>{d.name || d.id}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>
                            {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'Never'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <Link
                              href={`/devices/${d.id}`}
                              style={{
                                display: 'inline-block',
                                padding: '6px 12px',
                                background: 'var(--accent-muted)',
                                color: 'var(--accent)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: 13,
                                fontWeight: 500,
                              }}
                            >
                              Visit page
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
