'use client';

import { useEffect, useState, useRef } from 'react';
import { useAdminAuth } from '../AdminAuthContext';
import { Package, CardSim, Plus, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

const AU_TZ = 'Australia/Sydney';
const PAGE_SIZE = 50;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: AU_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

type TrackerRow = {
  id: string;
  imei: string;
  status: string;
  created_at: string;
  updated_at?: string;
  order_number?: string | null;
  email?: string | null;
};

export default function AdminStockPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [trackers, setTrackers] = useState<TrackerRow[]>([]);
  const [trackersLoading, setTrackersLoading] = useState(true);
  const [trackersError, setTrackersError] = useState<string | null>(null);
  const [addImei, setAddImei] = useState('');
  const [addStatus, setAddStatus] = useState('in_stock');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [simcards, setSimcards] = useState<Record<string, unknown>[]>([]);
  const [simcardsLoading, setSimcardsLoading] = useState(false);
  const [simcardsError, setSimcardsError] = useState<string | null>(null);
  const [simStateUpdating, setSimStateUpdating] = useState<string | null>(null);
  const [simStateError, setSimStateError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trackers' | 'simcards'>('trackers');
  const [trackersPage, setTrackersPage] = useState(1);
  const [simcardsPage, setSimcardsPage] = useState(1);
  const simcardsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SIM_AUTO_REFRESH_MS = 2 * 60 * 1000; // 2 minutes
  const SIM_POLL_WHILE_UPDATING_MS = 3 * 1000; // 3s when any sim is enabling/disabling

  const trackersPaged = trackers.slice((trackersPage - 1) * PAGE_SIZE, trackersPage * PAGE_SIZE);
  const trackersTotalPages = Math.max(1, Math.ceil(trackers.length / PAGE_SIZE));
  const simcardsPaged = simcards.slice((simcardsPage - 1) * PAGE_SIZE, simcardsPage * PAGE_SIZE);
  const simcardsTotalPages = Math.max(1, Math.ceil(simcards.length / PAGE_SIZE));

  function loadTrackers() {
    setTrackersLoading(true);
    setTrackersError(null);
    fetch('/api/admin/stock/trackers', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Forbidden' : 'Failed to load');
        return r.json();
      })
      .then((data) => setTrackers(data.trackers ?? []))
      .catch((e) => setTrackersError(e.message))
      .finally(() => setTrackersLoading(false));
  }

  useEffect(() => {
    loadTrackers();
  }, [getAuthHeaders]);

  useEffect(() => {
    if (trackersPage > trackersTotalPages && trackersTotalPages >= 1) setTrackersPage(trackersTotalPages);
  }, [trackersTotalPages, trackersPage]);
  useEffect(() => {
    if (simcardsPage > simcardsTotalPages && simcardsTotalPages >= 1) setSimcardsPage(simcardsTotalPages);
  }, [simcardsTotalPages, simcardsPage]);

  useEffect(() => {
    if (activeTab === 'simcards') {
      loadSimcards();
      const interval = setInterval(loadSimcards, SIM_AUTO_REFRESH_MS);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const hasTransitionalState = simcards.some((sim) => {
    const s = sim as { state?: string };
    const st = (s.state ?? '').toString().toLowerCase();
    return st === 'enabling' || st === 'disabling';
  });

  useEffect(() => {
    if (activeTab !== 'simcards' || !hasTransitionalState) {
      if (simcardsPollRef.current) {
        clearInterval(simcardsPollRef.current);
        simcardsPollRef.current = null;
      }
      return;
    }
    simcardsPollRef.current = setInterval(loadSimcards, SIM_POLL_WHILE_UPDATING_MS);
    return () => {
      if (simcardsPollRef.current) clearInterval(simcardsPollRef.current);
      simcardsPollRef.current = null;
    };
  }, [activeTab, hasTransitionalState]);

  function handleAddTracker(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const imei = addImei.trim();
    if (!imei || !/^\d{12,20}$/.test(imei)) {
      setAddError('Enter a valid IMEI (12–20 digits).');
      return;
    }
    setAdding(true);
    fetch('/api/admin/stock/trackers', {
      method: 'POST',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ imei, status: addStatus }),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
        setAddImei('');
        loadTrackers();
      })
      .catch((e) => setAddError(e.message))
      .finally(() => setAdding(false));
  }

  function loadSimcards() {
    setSimcardsLoading(true);
    setSimcardsError(null);
    fetch('/api/admin/stock/simcards', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) return r.json().then((b) => { throw new Error(b?.error || `HTTP ${r.status}`); });
        return r.json();
      })
      .then((data) => setSimcards(data.simcards ?? []))
      .catch((e) => setSimcardsError(e.message))
      .finally(() => setSimcardsLoading(false));
  }

  function getTagClass(tag: string): string {
    const t = tag.toLowerCase();
    if (t === 'assigned') return 'admin-badge admin-badge--warn';
    if (t === 'pending') return 'admin-badge admin-badge--muted';
    if (t === 'suspended') return 'admin-badge admin-badge--error';
    return 'admin-badge';
  }

  function getTrackerStatusDisplay(status: string): { label: string; className: string } {
    const s = status?.toLowerCase() ?? '';
    const base = 'admin-badge ';
    if (s === 'in_stock') return { label: 'In stock', className: base + 'admin-badge--success' };
    if (s === 'assigned') return { label: 'Assigned', className: base + 'admin-badge--warn' };
    if (s === 'sold') return { label: 'Sold', className: base + 'admin-badge--muted' };
    if (s === 'returned') return { label: 'Returned', className: base + 'admin-badge--warn' };
    if (s === 'faulty') return { label: 'Faulty', className: base + 'admin-badge--error' };
    return { label: status || '—', className: base };
  }

  async function updateSimState(iccid: string, newState: 'enabled' | 'disabled', currentTags: string[] = []) {
    setSimStateError(null);
    setSimStateUpdating(iccid);
    try {
      const res = await fetch(`/api/admin/stock/simcards/${encodeURIComponent(iccid)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState, tags: currentTags }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const updatedTags = Array.isArray(data.tags) ? data.tags : undefined;
      setSimcards((prev) =>
        prev.map((sim) => {
          const s = sim as { iccid?: string; id?: string; state?: string; tags?: string[] };
          const id = s.iccid ?? s.id;
          if (String(id) === String(iccid)) {
            return { ...sim, state: newState, tags: updatedTags ?? s.tags };
          }
          return sim;
        })
      );
      setSimStateUpdating(null);
      loadSimcards();
    } catch (e) {
      setSimStateError(e instanceof Error ? e.message : String(e));
    } finally {
      setSimStateUpdating(null);
    }
  }

  return (
    <>
      <h1 className="admin-page-title">Stock</h1>

      <div className="admin-stock-tabs">
        <button
          type="button"
          className={`admin-stock-tab ${activeTab === 'trackers' ? 'admin-stock-tab--active' : ''}`}
          onClick={() => setActiveTab('trackers')}
        >
          <Package size={18} /> GPS trackers
        </button>
        <button
          type="button"
          className={`admin-stock-tab ${activeTab === 'simcards' ? 'admin-stock-tab--active' : ''}`}
          onClick={() => setActiveTab('simcards')}
        >
          <CardSim size={18} /> SIM cards
        </button>
      </div>

      {activeTab === 'trackers' && (
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 1rem' }}>
          <Package size={20} /> GPS tracker stock
        </h3>
        <p className="admin-time" style={{ marginBottom: '1rem' }}>
          Total: <strong>{trackers.length}</strong> unit{trackers.length !== 1 ? 's' : ''}
          {trackers.length > PAGE_SIZE && (
            <span style={{ marginLeft: '1rem' }}>
              (showing {((trackersPage - 1) * PAGE_SIZE) + 1}–{Math.min(trackersPage * PAGE_SIZE, trackers.length)})
            </span>
          )}
        </p>
        <form onSubmit={handleAddTracker} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="admin-form-row" style={{ marginBottom: 0 }}>
            <label>IMEI</label>
            <input
              type="text"
              value={addImei}
              onChange={(e) => setAddImei(e.target.value)}
              placeholder="e.g. 867747070319866"
              className="admin-mono"
              style={{ minWidth: '180px' }}
              disabled={adding}
            />
          </div>
          <div className="admin-form-row" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select
              value={addStatus}
              onChange={(e) => setAddStatus(e.target.value)}
              style={{ minWidth: '120px' }}
              disabled={adding}
            >
              <option value="in_stock">In stock</option>
              <option value="assigned">Assigned</option>
              <option value="sold">Sold</option>
              <option value="returned">Returned</option>
              <option value="faulty">Faulty</option>
            </select>
          </div>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={adding}>
            <Plus size={16} /> Add tracker
          </button>
        </form>
        {addError && <p style={{ color: 'var(--error)', marginBottom: '0.5rem' }}>{addError}</p>}
        {trackersError && <p style={{ color: 'var(--error)' }}>{trackersError}</p>}
        {trackersLoading ? (
          <p className="admin-time">Loading…</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>IMEI</th>
                  <th>Status</th>
                  <th>Order number</th>
                  <th>Email</th>
                  <th>Added (AU)</th>
                </tr>
              </thead>
              <tbody>
                {trackers.length === 0 ? (
                  <tr><td colSpan={5} className="admin-time">No trackers in stock. Add one above.</td></tr>
                ) : (
                  trackersPaged.map((t) => {
                    const statusDisplay = getTrackerStatusDisplay(t.status);
                    return (
                      <tr key={t.id}>
                        <td className="admin-mono">{t.imei}</td>
                        <td><span className={statusDisplay.className}>{statusDisplay.label}</span></td>
                        <td>{t.order_number ?? '—'}</td>
                        <td>{t.email ?? '—'}</td>
                        <td className="admin-time">{formatDate(t.created_at)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        {!trackersLoading && trackers.length > PAGE_SIZE && (
          <div className="admin-pagination" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '1rem', flexWrap: 'wrap' }}>
            <span className="admin-time">
              Page {trackersPage} of {trackersTotalPages}
            </span>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setTrackersPage((p) => Math.max(1, p - 1))}
              disabled={trackersPage <= 1}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setTrackersPage((p) => Math.min(trackersTotalPages, p + 1))}
              disabled={trackersPage >= trackersTotalPages}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      )}

      {activeTab === 'simcards' && (
      <div className="admin-card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 0.5rem' }}>
          <CardSim size={20} /> SIM cards (Simbase)
        </h3>
        <p className="admin-time" style={{ marginBottom: '1rem' }}>
          Total: <strong>{simcards.length}</strong> SIM card{simcards.length !== 1 ? 's' : ''}
          {simcards.length > PAGE_SIZE && (
            <span style={{ marginLeft: '1rem' }}>
              (showing {((simcardsPage - 1) * PAGE_SIZE) + 1}–{Math.min(simcardsPage * PAGE_SIZE, simcards.length)})
            </span>
          )}
          {' · '}
          Auto-refreshes every 2 min. <button type="button" className="admin-btn" onClick={loadSimcards} disabled={simcardsLoading}>
            <RefreshCw size={14} style={{ marginRight: 4 }} /> {simcardsLoading ? 'Loading…' : 'Refresh now'}
          </button>
        </p>
        {simcardsError && <p style={{ color: 'var(--error)', marginBottom: '0.5rem' }}>{simcardsError}</p>}
        {simStateError && <p style={{ color: 'var(--error)', marginBottom: '0.5rem' }}>{simStateError}</p>}
        {simcards.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ICCID</th>
                  <th>Name</th>
                  <th>State</th>
                  <th>Order number</th>
                  <th>Email</th>
                  <th>Tags</th>
                  <th>Plan</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {simcardsPaged.map((sim, i) => {
                  const s = sim as { iccid?: string; id?: string; name?: string; state?: string; tags?: string[]; plan_id?: string; coverage?: string; order_number?: string | null; email?: string | null };
                  const rowIndex = (simcardsPage - 1) * PAGE_SIZE + i;
                  const iccid = s.iccid ?? s.id ?? `sim-${rowIndex}`;
                  const name = (s.name ?? '').trim() || '—';
                  const stateRaw = (s.state ?? '') as string;
                  const stateLower = stateRaw.toLowerCase();
                  const isTransitional = stateLower === 'enabling' || stateLower === 'disabling';
                  const canChangeState = stateLower === 'enabled' || stateLower === 'disabled';
                  const tags = Array.isArray(s.tags) ? s.tags : [];
                  const plan = s.plan_id ?? '—';
                  const coverage = s.coverage ?? '—';
                  const isUpdating = simStateUpdating === String(iccid);
                  return (
                    <tr key={String(iccid)}>
                      <td className="admin-mono" style={{ fontSize: '0.9em' }}>{String(iccid)}</td>
                      <td>{name}</td>
                      <td>
                        {canChangeState ? (
                          <>
                            <select
                              value={stateLower}
                              onChange={(e) => updateSimState(String(iccid), e.target.value as 'enabled' | 'disabled', tags)}
                              disabled={isUpdating}
                              className={`admin-select admin-select--state-${stateLower === 'enabled' ? 'enabled' : 'disabled'}`}
                              style={{ minWidth: '100px', padding: '4px 8px', fontSize: '0.875rem' }}
                            >
                              <option value="enabled">enabled</option>
                              <option value="disabled">disabled</option>
                            </select>
                            {isUpdating && <span className="admin-badge admin-badge--warn" style={{ marginLeft: 6 }}>Updating…</span>}
                          </>
                        ) : isTransitional ? (
                          <span className="admin-badge admin-badge--warn" title="State changing in Simbase">
                            {stateRaw || '—'}
                          </span>
                        ) : (
                          <span className={`admin-badge admin-badge--${stateLower === 'enabled' ? 'success' : stateLower === 'disabled' ? 'error' : ''}`}>
                            {stateRaw || '—'}
                          </span>
                        )}
                      </td>
                      <td>{s.order_number ?? '—'}</td>
                      <td>{s.email ?? '—'}</td>
                      <td>
                        {tags.length === 0 ? '—' : tags.map((t) => (
                          <span key={t} className={getTagClass(t)} style={{ marginRight: 4 }}>{t}</span>
                        ))}
                      </td>
                      <td style={{ fontSize: '0.9em' }}>{plan}</td>
                      <td>{coverage}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!simcardsLoading && simcards.length > PAGE_SIZE && (
          <div className="admin-pagination" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '1rem', flexWrap: 'wrap' }}>
            <span className="admin-time">
              Page {simcardsPage} of {simcardsTotalPages}
            </span>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setSimcardsPage((p) => Math.max(1, p - 1))}
              disabled={simcardsPage <= 1}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setSimcardsPage((p) => Math.min(simcardsTotalPages, p + 1))}
              disabled={simcardsPage >= simcardsTotalPages}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
        {!simcardsLoading && simcards.length === 0 && !simcardsError && (
          <p className="admin-time">Loading SIM cards from Simbase…</p>
        )}
      </div>
      )}
    </>
  );
}
