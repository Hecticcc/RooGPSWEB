'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAdminAuth } from '../AdminAuthContext';
import {
  Package, Plus, RefreshCw, ChevronLeft, ChevronRight,
  ScanBarcode, Check, X, Trash2, CheckCircle, AlertCircle,
} from 'lucide-react';

// CardSim may not exist in all lucide versions — fall back to a simple component
let CardSim: React.ComponentType<{ size?: number }>;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  CardSim = require('lucide-react').CardSim ?? (() => <span>SIM</span>);
} catch {
  CardSim = () => <span>SIM</span>;
}

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
  product_sku?: string;
  created_at: string;
  updated_at?: string;
  order_number?: string | null;
  email?: string | null;
};

type ModelOption = {
  sku: string;
  label: string; // device_model_name or product label
};

type ScanItem = {
  imei: string;
  sku: string;
  status: string;
};

type BatchResult = {
  imei: string;
  ok: boolean;
  error?: string;
};

const STATUS_OPTIONS = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'sold', label: 'Sold' },
  { value: 'returned', label: 'Returned' },
  { value: 'faulty', label: 'Faulty' },
];

export default function AdminStockPage() {
  const { getAuthHeaders } = useAdminAuth();

  // ── Device models (from product_pricing, one-time SKUs) ──
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);

  // ── Trackers list ──
  const [trackers, setTrackers] = useState<TrackerRow[]>([]);
  // allTrackers holds every IMEI regardless of the active filter — used for duplicate detection
  const allTrackersRef = useRef<TrackerRow[]>([]);
  const [trackersLoading, setTrackersLoading] = useState(true);
  const [trackersError, setTrackersError] = useState<string | null>(null);
  const [trackersFilter, setTrackersFilter] = useState<string>('all');
  const [trackersPage, setTrackersPage] = useState(1);
  const [trackerStatusUpdating, setTrackerStatusUpdating] = useState<string | null>(null);
  const [trackerStatusError, setTrackerStatusError] = useState<string | null>(null);

  // ── Single add form ──
  const [addImei, setAddImei] = useState('');
  const [addProductSku, setAddProductSku] = useState('');
  const [addStatus, setAddStatus] = useState('in_stock');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // ── Scan mode ──
  const [scanMode, setScanMode] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanSku, setScanSku] = useState('');
  const [scanStatus, setScanStatus] = useState('in_stock');
  const [scanQueue, setScanQueue] = useState<ScanItem[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [batchAdding, setBatchAdding] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // ── SIM cards ──
  const [simcards, setSimcards] = useState<Record<string, unknown>[]>([]);
  const [simcardsLoading, setSimcardsLoading] = useState(false);
  const [simcardsError, setSimcardsError] = useState<string | null>(null);
  const [simStateUpdating, setSimStateUpdating] = useState<string | null>(null);
  const [simStateError, setSimStateError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trackers' | 'simcards'>('trackers');
  const [simcardsPage, setSimcardsPage] = useState(1);
  const simcardsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SIM_AUTO_REFRESH_MS = 2 * 60 * 1000;
  const SIM_POLL_WHILE_UPDATING_MS = 3 * 1000;

  const trackersPaged = trackers.slice((trackersPage - 1) * PAGE_SIZE, trackersPage * PAGE_SIZE);
  const trackersTotalPages = Math.max(1, Math.ceil(trackers.length / PAGE_SIZE));
  const simcardsPaged = simcards.slice((simcardsPage - 1) * PAGE_SIZE, simcardsPage * PAGE_SIZE);
  const simcardsTotalPages = Math.max(1, Math.ceil(simcards.length / PAGE_SIZE));

  const loadTrackers = useCallback(() => {
    setTrackersLoading(true);
    setTrackersError(null);
    const url = trackersFilter === 'all'
      ? '/api/admin/stock/trackers'
      : `/api/admin/stock/trackers?product_sku=${encodeURIComponent(trackersFilter)}`;
    fetch(url, { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Forbidden' : 'Failed to load');
        return r.json();
      })
      .then((data) => {
        const rows: TrackerRow[] = data.trackers ?? [];
        setTrackers(rows);
        // If we loaded all, keep the master list in sync for duplicate detection
        if (trackersFilter === 'all') allTrackersRef.current = rows;
      })
      .catch((e) => setTrackersError(e.message))
      .finally(() => setTrackersLoading(false));
  }, [getAuthHeaders, trackersFilter]);

  useEffect(() => { loadTrackers(); }, [loadTrackers]);

  // ── Load device models from product_pricing (one-time SKUs) ──
  useEffect(() => {
    fetch('/api/admin/pricing', { credentials: 'include', headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.pricing) return;
        const opts: ModelOption[] = (data.pricing as { sku: string; label: string; period: string; device_model_name?: string | null }[])
          .filter((p) => p.period === 'one-time')
          .map((p) => ({ sku: p.sku, label: p.device_model_name?.trim() || p.label }));
        setModelOptions(opts);
        if (opts.length > 0) {
          setAddProductSku((prev) => prev || opts[0].sku);
          setScanSku((prev) => prev || opts[0].sku);
        }
      })
      .catch(() => {/* non-fatal */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always keep a full (unfiltered) snapshot for IMEI duplicate detection
  useEffect(() => {
    fetch('/api/admin/stock/trackers', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) allTrackersRef.current = data.trackers ?? []; })
      .catch(() => {/* silent — filtered list is the fallback */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (trackersPage > trackersTotalPages && trackersTotalPages >= 1) setTrackersPage(trackersTotalPages);
  }, [trackersTotalPages, trackersPage]);
  useEffect(() => {
    if (simcardsPage > simcardsTotalPages && simcardsTotalPages >= 1) setSimcardsPage(simcardsTotalPages);
  }, [simcardsTotalPages, simcardsPage]);

  // Auto-focus scan input whenever scan mode opens
  useEffect(() => {
    if (scanMode) {
      requestAnimationFrame(() => scanInputRef.current?.focus());
    } else {
      setScanQueue([]);
      setScanInput('');
      setScanError(null);
      setBatchResults(null);
    }
  }, [scanMode]);

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

  useEffect(() => {
    if (activeTab === 'simcards') {
      loadSimcards();
      const interval = setInterval(loadSimcards, SIM_AUTO_REFRESH_MS);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const hasTransitionalState = simcards.some((sim) => {
    const s = sim as { state?: string };
    const st = (s.state ?? '').toString().toLowerCase();
    return st === 'enabling' || st === 'disabling';
  });

  useEffect(() => {
    if (activeTab !== 'simcards' || !hasTransitionalState) {
      if (simcardsPollRef.current) { clearInterval(simcardsPollRef.current); simcardsPollRef.current = null; }
      return;
    }
    simcardsPollRef.current = setInterval(loadSimcards, SIM_POLL_WHILE_UPDATING_MS);
    return () => { if (simcardsPollRef.current) clearInterval(simcardsPollRef.current); simcardsPollRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, hasTransitionalState]);

  // ── Single add ──
  function handleAddTracker(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const imei = addImei.trim();
    if (!imei || !/^\d{15}$/.test(imei)) {
      setAddError('Enter a valid IMEI (exactly 15 digits).');
      return;
    }
    setAdding(true);
    fetch('/api/admin/stock/trackers', {
      method: 'POST',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ imei, status: addStatus, product_sku: addProductSku }),
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

  // ── Scan: handle Enter / barcode complete ──
  function handleScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const imei = scanInput.trim().replace(/\D/g, ''); // strip any non-digit (some scanners add prefix chars)
    setScanInput('');
    setScanError(null);

    if (!imei) return;

    if (!/^\d{15}$/.test(imei)) {
      setScanError(`"${imei}" is not a valid IMEI (must be exactly 15 digits, got ${imei.length})`);
      requestAnimationFrame(() => scanInputRef.current?.focus());
      return;
    }
    if (scanQueue.some((item) => item.imei === imei)) {
      setScanError(`${imei} is already in this batch`);
      setTimeout(() => setScanError(null), 2500);
      requestAnimationFrame(() => scanInputRef.current?.focus());
      return;
    }

    const existing = (allTrackersRef.current.length ? allTrackersRef.current : trackers).find((t) => t.imei === imei);
    if (existing) {
      const { label } = getTrackerStatusDisplay(existing.status);
      const detail = existing.order_number ? ` · Order ${existing.order_number}` : '';
      setScanError(`Already in system — ${label}${detail} (${imei})`);
      setTimeout(() => setScanError(null), 4000);
      requestAnimationFrame(() => scanInputRef.current?.focus());
      return;
    }

    setScanQueue((prev) => [...prev, { imei, sku: scanSku, status: scanStatus }]);
    requestAnimationFrame(() => scanInputRef.current?.focus());
  }

  // ── Scan: batch commit ──
  async function handleBatchAdd() {
    if (scanQueue.length === 0 || batchAdding) return;
    setBatchAdding(true);
    setBatchResults(null);

    const results: BatchResult[] = await Promise.all(
      scanQueue.map(async (item) => {
        try {
          const res = await fetch('/api/admin/stock/trackers', {
            method: 'POST',
            credentials: 'include',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ imei: item.imei, status: item.status, product_sku: item.sku }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return { imei: item.imei, ok: false, error: data.error || `HTTP ${res.status}` };
          return { imei: item.imei, ok: true };
        } catch (e) {
          return { imei: item.imei, ok: false, error: e instanceof Error ? e.message : 'Failed' };
        }
      })
    );

    setBatchResults(results);
    setBatchAdding(false);
    loadTrackers();
    // Refresh the full duplicate-detection list too
    fetch('/api/admin/stock/trackers', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) allTrackersRef.current = data.trackers ?? []; })
      .catch(() => {});

    const allOk = results.every((r) => r.ok);
    if (allOk) {
      // All good — close after 1.5s
      setTimeout(() => { setScanMode(false); }, 1500);
    } else {
      // Keep failed items so admin can review / retry
      const failed = new Set(results.filter((r) => !r.ok).map((r) => r.imei));
      setScanQueue((prev) => prev.filter((item) => failed.has(item.imei)));
    }
  }

  // ── SIM helpers ──
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

  async function updateTrackerStatus(trackerId: string, newStatus: string) {
    setTrackerStatusError(null);
    setTrackerStatusUpdating(trackerId);
    try {
      const res = await fetch(`/api/admin/stock/trackers/${encodeURIComponent(trackerId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setTrackers((prev) => prev.map((tr) => (tr.id === trackerId ? { ...tr, status: newStatus } : tr)));
    } catch (e) {
      setTrackerStatusError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setTrackerStatusUpdating(null);
    }
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
          if (String(id) === String(iccid)) return { ...sim, state: newState, tags: updatedTags ?? s.tags };
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

  const okCount = batchResults?.filter((r) => r.ok).length ?? 0;
  const failCount = batchResults?.filter((r) => !r.ok).length ?? 0;

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '1rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Package size={20} /> GPS tracker stock
            </h3>
            {!scanMode && (
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={() => setScanMode(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7 }}
              >
                <ScanBarcode size={17} /> Scan to add
              </button>
            )}
          </div>

          <p className="admin-time" style={{ marginBottom: '0.75rem' }}>
            Total: <strong>{trackers.length}</strong> unit{trackers.length !== 1 ? 's' : ''}
            {trackers.length > PAGE_SIZE && (
              <span style={{ marginLeft: '1rem' }}>
                (showing {((trackersPage - 1) * PAGE_SIZE) + 1}–{Math.min(trackersPage * PAGE_SIZE, trackers.length)})
              </span>
            )}
          </p>

          {/* ── Scan Mode Panel ── */}
          {scanMode && (
            <div className="admin-scan-panel">
              <div className="admin-scan-panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ScanBarcode size={20} />
                  <strong>Barcode Scan Mode</strong>
                  <span className="admin-time">Scan one or many, then click Complete</span>
                </div>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => setScanMode(false)}
                  disabled={batchAdding}
                >
                  <X size={15} /> Cancel
                </button>
              </div>

              {/* Config row */}
              <div className="admin-scan-config">
                <div className="admin-form-row" style={{ marginBottom: 0 }}>
                  <label>Model</label>
                  <select
                    value={scanSku}
                    onChange={(e) => setScanSku(e.target.value)}
                    disabled={batchAdding}
                  >
                    {modelOptions.map((o) => (
                      <option key={o.sku} value={o.sku}>{o.label}</option>
                    ))}
                    {modelOptions.length === 0 && <option value="">Loading…</option>}
                  </select>
                </div>
                <div className="admin-form-row" style={{ marginBottom: 0 }}>
                  <label>Status</label>
                  <select
                    value={scanStatus}
                    onChange={(e) => setScanStatus(e.target.value)}
                    disabled={batchAdding}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Scan input */}
              <div className="admin-scan-input-wrap">
                <ScanBarcode size={20} className="admin-scan-input-icon" />
                <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={handleScanKeyDown}
                  placeholder="Aim scanner at barcode — or type IMEI and press Enter"
                  className="admin-scan-input admin-mono"
                  disabled={batchAdding}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="numeric"
                />
              </div>
              {scanError && (
                <p className="admin-scan-error">
                  <AlertCircle size={14} /> {scanError}
                </p>
              )}

              {/* Staged queue */}
              {scanQueue.length > 0 && (
                <div className="admin-scan-queue">
                  <div className="admin-scan-queue-header">
                    <span>
                      <strong>{scanQueue.length}</strong> tracker{scanQueue.length !== 1 ? 's' : ''} staged
                    </span>
                    {!batchAdding && !batchResults && (
                      <button
                        type="button"
                        className="admin-btn"
                        style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => { setScanQueue([]); setBatchResults(null); }}
                      >
                        <Trash2 size={13} /> Clear all
                      </button>
                    )}
                  </div>

                  <div className="admin-scan-queue-list">
                    {scanQueue.map((item, i) => {
                      const result = batchResults?.find((r) => r.imei === item.imei);
                      return (
                        <div
                          key={item.imei}
                          className={`admin-scan-queue-item${result?.ok ? ' admin-scan-queue-item--ok' : result ? ' admin-scan-queue-item--err' : ''}`}
                        >
                          <span className="admin-scan-queue-num">{i + 1}</span>
                          <span className="admin-mono admin-scan-queue-imei">{item.imei}</span>
                          <span className="admin-badge admin-badge--muted">
                            {modelOptions.find((m) => m.sku === item.sku)?.label ?? item.sku}
                          </span>
                          <span className="admin-badge">
                            {STATUS_OPTIONS.find((o) => o.value === item.status)?.label ?? item.status}
                          </span>
                          {result?.ok && (
                            <span className="admin-badge admin-badge--success admin-scan-result-badge">
                              <CheckCircle size={13} /> Added
                            </span>
                          )}
                          {result && !result.ok && (
                            <span className="admin-badge admin-badge--error admin-scan-result-badge" title={result.error}>
                              <AlertCircle size={13} /> {result.error}
                            </span>
                          )}
                          {!batchAdding && !result?.ok && (
                            <button
                              type="button"
                              className="admin-scan-queue-remove"
                              onClick={() => setScanQueue((prev) => prev.filter((q) => q.imei !== item.imei))}
                              aria-label="Remove"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Batch result summary */}
                  {batchResults && (
                    <div className="admin-scan-summary">
                      {okCount > 0 && (
                        <span className="admin-scan-summary-ok">
                          <CheckCircle size={15} /> {okCount} added successfully
                        </span>
                      )}
                      {failCount > 0 && (
                        <span className="admin-scan-summary-err">
                          <AlertCircle size={15} /> {failCount} failed — review above
                        </span>
                      )}
                    </div>
                  )}

                  {/* Complete button */}
                  {!batchResults && (
                    <div className="admin-scan-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn--primary admin-scan-complete-btn"
                        onClick={handleBatchAdd}
                        disabled={scanQueue.length === 0 || batchAdding}
                      >
                        {batchAdding ? (
                          <>Adding {scanQueue.length} tracker{scanQueue.length !== 1 ? 's' : ''}…</>
                        ) : (
                          <><Check size={16} /> Complete — Add {scanQueue.length} tracker{scanQueue.length !== 1 ? 's' : ''}</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Single add form (shown when not in scan mode) ── */}
          {!scanMode && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                <label style={{ marginRight: 4 }}>Show:</label>
                <select
                  value={trackersFilter}
                  onChange={(e) => setTrackersFilter(e.target.value)}
                  style={{ minWidth: '140px' }}
                >
                  <option value="all">All models</option>
                  {modelOptions.map((m) => (
                    <option key={m.sku} value={m.sku}>{m.label}</option>
                  ))}
                </select>
              </div>
              <form onSubmit={handleAddTracker} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '1rem' }}>
                <div className="admin-form-row" style={{ marginBottom: 0 }}>
                  <label>IMEI</label>
                  <input
                    type="text"
                    value={addImei}
                    onChange={(e) => setAddImei(e.target.value)}
                    placeholder="e.g. 867747070319866 (15 digits)"
                    className="admin-mono"
                    style={{ minWidth: '180px' }}
                    disabled={adding}
                  />
                </div>
                <div className="admin-form-row" style={{ marginBottom: 0 }}>
                  <label>Model</label>
                  <select
                    value={addProductSku}
                    onChange={(e) => setAddProductSku(e.target.value)}
                    style={{ minWidth: '140px' }}
                    disabled={adding}
                  >
                    {modelOptions.map((opt) => (
                      <option key={opt.sku} value={opt.sku}>{opt.label}</option>
                    ))}
                    {modelOptions.length === 0 && <option value="">Loading…</option>}
                  </select>
                </div>
                <div className="admin-form-row" style={{ marginBottom: 0 }}>
                  <label>Status</label>
                  <select value={addStatus} onChange={(e) => setAddStatus(e.target.value)} style={{ minWidth: '120px' }} disabled={adding}>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={adding}>
                  <Plus size={16} /> Add tracker
                </button>
              </form>
              {addError && <p style={{ color: 'var(--error)', marginBottom: '0.5rem' }}>{addError}</p>}
            </>
          )}

          {trackerStatusError && <p style={{ color: 'var(--error)', marginBottom: '0.5rem' }}>{trackerStatusError}</p>}
          {trackersError && <p style={{ color: 'var(--error)' }}>{trackersError}</p>}

          {/* Filter row (scan mode) */}
          {scanMode && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', margin: '1rem 0 0.5rem' }}>
              <label style={{ marginRight: 4 }}>Show:</label>
              <select
                value={trackersFilter}
                onChange={(e) => setTrackersFilter(e.target.value)}
                style={{ minWidth: '140px' }}
              >
                <option value="all">All models</option>
                {modelOptions.map((m) => (
                  <option key={m.sku} value={m.sku}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── Trackers table ── */}
          {trackersLoading ? (
            <p className="admin-time">Loading…</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>IMEI</th>
                    <th>Model</th>
                    <th>Status</th>
                    <th>Order number</th>
                    <th>Email</th>
                    <th>Added (AU)</th>
                  </tr>
                </thead>
                <tbody>
                  {trackers.length === 0 ? (
                    <tr><td colSpan={6} className="admin-time">No trackers. Add one above or change filter.</td></tr>
                  ) : (
                    trackersPaged.map((t) => {
                      const isUpdating = trackerStatusUpdating === t.id;
                      const modelLabel = modelOptions.find((m) => m.sku === t.product_sku)?.label ?? t.product_sku ?? '—';
                      return (
                        <tr key={t.id}>
                          <td className="admin-mono">{t.imei}</td>
                          <td>{modelLabel}</td>
                          <td>
                            <select
                              value={t.status}
                              onChange={(e) => updateTrackerStatus(t.id, e.target.value)}
                              disabled={isUpdating}
                              style={{ minWidth: '110px', cursor: isUpdating ? 'wait' : 'pointer' }}
                              title="Change status"
                            >
                              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            {isUpdating && <span className="admin-time" style={{ marginLeft: 6 }}>Updating…</span>}
                          </td>
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
              <span className="admin-time">Page {trackersPage} of {trackersTotalPages}</span>
              <button type="button" className="admin-btn" onClick={() => setTrackersPage((p) => Math.max(1, p - 1))} disabled={trackersPage <= 1}>
                <ChevronLeft size={16} /> Previous
              </button>
              <button type="button" className="admin-btn" onClick={() => setTrackersPage((p) => Math.min(trackersTotalPages, p + 1))} disabled={trackersPage >= trackersTotalPages}>
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SIM cards tab ── */}
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
            Auto-refreshes every 2 min.{' '}
            <button type="button" className="admin-btn" onClick={loadSimcards} disabled={simcardsLoading}>
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
                            <span className="admin-badge admin-badge--warn" title="State changing in Simbase">{stateRaw || '—'}</span>
                          ) : (
                            <span className={`admin-badge admin-badge--${stateLower === 'enabled' ? 'success' : stateLower === 'disabled' ? 'error' : ''}`}>{stateRaw || '—'}</span>
                          )}
                        </td>
                        <td>{s.order_number ?? '—'}</td>
                        <td>{s.email ?? '—'}</td>
                        <td>{tags.length === 0 ? '—' : tags.map((t) => <span key={t} className={getTagClass(t)} style={{ marginRight: 4 }}>{t}</span>)}</td>
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
              <span className="admin-time">Page {simcardsPage} of {simcardsTotalPages}</span>
              <button type="button" className="admin-btn" onClick={() => setSimcardsPage((p) => Math.max(1, p - 1))} disabled={simcardsPage <= 1}>
                <ChevronLeft size={16} /> Previous
              </button>
              <button type="button" className="admin-btn" onClick={() => setSimcardsPage((p) => Math.min(simcardsTotalPages, p + 1))} disabled={simcardsPage >= simcardsTotalPages}>
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
