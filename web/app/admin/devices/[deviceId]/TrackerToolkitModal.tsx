'use client';

import { useEffect, useState, useCallback } from 'react';

const AU_TZ = 'Australia/Melbourne';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', { timeZone: AU_TZ, dateStyle: 'short', timeStyle: 'medium' });
}

type DiagnosticsData = {
  last_seen_at: string | null;
  gps_valid: boolean | null;
  sats: number | null;
  hdop: number | null;
  csq: number | null;
  battery_percent: number | null;
  battery_tier: string | null;
  subscription_status: string;
  suggested_fixes: string[];
};

type CommandJob = {
  id: string;
  created_at: string;
  status: string;
  command_name: string;
  command_text: string;
  target_phone?: string;
  target_iccid?: string | null;
  provider?: string | null;
  user_id?: string;
  sent_at?: string | null;
  replied_at?: string | null;
  reply_raw?: string | null;
  reply_parsed?: unknown;
  error?: string | null;
};

type SimbaseSmsItem = {
  direction: 'mt' | 'mo';
  message: string;
  status: string;
  timestamp: string;
};

const DIAGNOSTIC_KEYS = [
  'live_location',
  'work_status',
  'check_ip_port',
  'check_upload_interval',
  'check_apn',
] as const;

const DIAGNOSTIC_LABELS: Record<(typeof DIAGNOSTIC_KEYS)[number], { label: string; short: string }> = {
  live_location: { label: 'Live location', short: '800' },
  work_status: { label: 'Work status', short: '802' },
  check_ip_port: { label: 'Check IP/Port', short: '808,100' },
  check_upload_interval: { label: 'Upload interval', short: '808,102' },
  check_apn: { label: 'Check APN', short: '808,109' },
};

const UPLOAD_INTERVAL_PRESETS = [10, 30, 60, 300];

type TrackerToolkitModalProps = {
  deviceId: string;
  deviceSimPhone: string | null;
  deviceSimIccid: string | null;
  canWrite: boolean;
  getAuthHeaders: () => Record<string, string>;
  onClose: () => void;
};

const hasSim = (phone: string | null, iccid: string | null) => !!(phone?.trim() || iccid?.trim());

export default function TrackerToolkitModal({
  deviceId,
  deviceSimPhone,
  deviceSimIccid,
  canWrite,
  getAuthHeaders,
  onClose,
}: TrackerToolkitModalProps) {
  const [tab, setTab] = useState<'diagnostics' | 'commands' | 'log' | 'sms'>('diagnostics');
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [jobs, setJobs] = useState<CommandJob[]>([]);
  const [smsList, setSmsList] = useState<{ sms: SimbaseSmsItem[]; iccid?: string; message?: string }>({ sms: [] });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [manualReplyText, setManualReplyText] = useState('');
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmSet, setConfirmSet] = useState<{ key: string; params?: Record<string, unknown> } | null>(null);
  const [setForm, setSetForm] = useState<{ host: string; port: string; seconds: number; apn: string; apnUser: string; apnPw: string }>({
    host: '',
    port: '',
    seconds: 60,
    apn: '',
    apnUser: '',
    apnPw: '',
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const canSend = hasSim(deviceSimPhone, deviceSimIccid);

  function lastJobForCommand(commandKey: string): CommandJob | undefined {
    const label = DIAGNOSTIC_LABELS[commandKey as (typeof DIAGNOSTIC_KEYS)[number]]?.label;
    if (!label) return undefined;
    return jobs.find((j) => j.command_name.toLowerCase().includes(label.toLowerCase()));
  }

  const fetchDiagnostics = useCallback(() => {
    fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/diagnostics`, { credentials: 'include', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDiagnostics);
  }, [deviceId, getAuthHeaders]);

  const fetchJobs = useCallback(() => {
    fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/commands?limit=50`, { credentials: 'include', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((d) => setJobs(d.jobs ?? []));
  }, [deviceId, getAuthHeaders]);

  const fetchSms = useCallback(() => {
    fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/sms?limit=100`, { credentials: 'include', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : { sms: [] }))
      .then((d) => setSmsList({ sms: d.sms ?? [], iccid: d.iccid, message: d.message }));
  }, [deviceId, getAuthHeaders]);

  useEffect(() => {
    fetchDiagnostics();
    fetchJobs();
    fetchSms();
  }, [fetchDiagnostics, fetchJobs, fetchSms]);

  useEffect(() => {
    if (tab !== 'sms' && tab !== 'commands') return;
    const t = setInterval(() => {
      fetchJobs();
      if (tab === 'sms') fetchSms();
    }, 5000);
    return () => clearInterval(t);
  }, [tab, fetchJobs, fetchSms]);

  useEffect(() => {
    if (!pollingJobId) return;
    const t = setInterval(() => {
      fetch(`/api/admin/commands/${encodeURIComponent(pollingJobId)}`, { credentials: 'include', headers: getAuthHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d?.job) return;
          setJobs((prev) => prev.map((j) => (j.id === d.job.id ? d.job : j)));
          const status = d.job.status;
          if (['replied', 'manual_reply', 'failed', 'timeout'].includes(status)) {
            setPollingJobId(null);
            if (selectedJobId === d.job.id) setSelectedJobId(d.job.id);
          }
        });
    }, 2000);
    return () => clearInterval(t);
  }, [pollingJobId, getAuthHeaders, selectedJobId]);

  function sendCommand(commandKey: string, params?: Record<string, string | number>) {
    if (!canWrite || !canSend) {
      alert('No SIM (phone or ICCID) for this device, or you do not have permission.');
      return;
    }
    setSending(true);
    fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/commands`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ command_key: commandKey, params }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          alert(data.error);
          return;
        }
        if (data.job) {
          setJobs((prev) => [data.job, ...prev]);
          setPollingJobId(data.job.id);
          setTab('commands');
        }
      })
      .finally(() => {
        setSending(false);
        setConfirmSet(null);
      });
  }

  function submitManualReply(jobId: string) {
    if (!manualReplyText.trim()) return;
    fetch(`/api/admin/commands/${encodeURIComponent(jobId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply_raw: manualReplyText.trim() }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.job) {
          setJobs((prev) => prev.map((j) => (j.id === jobId ? d.job : j)));
          setManualReplyText('');
          setSelectedJobId(null);
        }
      });
  }

  const selectedJob = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : null;
  const latestReply = jobs.find((j) => j.reply_parsed && ['replied', 'manual_reply'].includes(j.status));

  return (
    <div className="tracker-settings-modal-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tracker-settings-modal toolkit-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="tracker-settings-modal-header">
          <h2 className="tracker-settings-modal-title">Tracker Toolkit</h2>
          <button type="button" className="tracker-settings-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="tracker-settings-modal-tabs">
          {(['diagnostics', 'commands', 'log', 'sms'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`tracker-settings-modal-tab ${tab === t ? 'tracker-settings-modal-tab--active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'diagnostics' ? 'Diagnostics' : t === 'commands' ? 'Commands' : t === 'log' ? 'Command Log' : 'SMS (Simbase)'}
            </button>
          ))}
        </div>
        <div className="tracker-settings-modal-body">
          {tab === 'diagnostics' && (
            <div className="tracker-settings-modal-panel toolkit-panel">
              {diagnostics ? (
                <>
                  <div className="toolkit-stats">
                    <div className="toolkit-stat"><span className="toolkit-stat-label">Last seen (AU/Melbourne)</span><span>{formatDate(diagnostics.last_seen_at)}</span></div>
                    <div className="toolkit-stat"><span className="toolkit-stat-label">GPS Fix</span><span>{diagnostics.gps_valid === true ? 'Valid' : diagnostics.gps_valid === false ? 'Invalid' : '—'}</span></div>
                    <div className="toolkit-stat"><span className="toolkit-stat-label">Sats</span><span>{diagnostics.sats ?? '—'}</span></div>
                    <div className="toolkit-stat"><span className="toolkit-stat-label">HDOP</span><span>{diagnostics.hdop ?? '—'}</span></div>
                    <div className="toolkit-stat"><span className="toolkit-stat-label">GSM (CSQ)</span><span>{diagnostics.csq ?? '—'}</span></div>
                    <div className="toolkit-stat"><span className="toolkit-stat-label">Battery</span><span>{diagnostics.battery_percent != null ? `${diagnostics.battery_percent}%` : '—'} {diagnostics.battery_tier ? `(${diagnostics.battery_tier})` : ''}</span></div>
                    <div className="toolkit-stat"><span className="toolkit-stat-label">Subscription</span><span>{diagnostics.subscription_status ?? '—'}</span></div>
                  </div>
                  {diagnostics.suggested_fixes.length > 0 && (
                    <div className="toolkit-section">
                      <h4 className="toolkit-section-title">Suggested fixes</h4>
                      <ul className="toolkit-fixes">
                        {diagnostics.suggested_fixes.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="admin-time">Loading diagnostics…</p>
              )}
            </div>
          )}

          {tab === 'commands' && (
            <div className="tracker-settings-modal-panel toolkit-panel">
              {!canSend && (
                <p style={{ color: 'var(--warn)', marginBottom: '1rem' }}>No SIM for this device. Use an activated device (ICCID from activation token) or set <code>sim_phone</code> to send commands.</p>
              )}
              <div className="toolkit-section">
                <h4 className="toolkit-section-title">Diagnostics</h4>
                <p className="toolkit-section-desc">Request data from the tracker. Status shows the latest run for each command.</p>
                <div className="toolkit-cmd-grid">
                  {DIAGNOSTIC_KEYS.map((key) => {
                    const meta = DIAGNOSTIC_LABELS[key];
                    const last = lastJobForCommand(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        className="toolkit-cmd-btn"
                        disabled={sending || !canSend}
                        onClick={() => sendCommand(key)}
                      >
                        <span className="toolkit-cmd-btn-label">{meta.label}</span>
                        <span className="toolkit-cmd-btn-short">{meta.short}</span>
                        {last && (
                          <span className={`toolkit-cmd-btn-status toolkit-chip--${last.status}`}>
                            {last.status}
                            {last.replied_at && <span className="toolkit-cmd-btn-time"> · {formatDate(last.replied_at).replace(/^(\d+\/\d+\/\d+),\s*/, '')}</span>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {canWrite && (
                <div className="toolkit-section">
                  <button
                    type="button"
                    className="toolkit-advanced-toggle"
                    onClick={() => setAdvancedOpen((o) => !o)}
                    aria-expanded={advancedOpen}
                  >
                    <span>Advanced (SET)</span>
                    <span className="toolkit-advanced-chevron">{advancedOpen ? '▼' : '▶'}</span>
                  </button>
                  {advancedOpen && (
                    <div className="toolkit-advanced-body">
                      <p className="toolkit-section-desc">Server, upload interval, APN. Confirm before sending.</p>
                      <div className="toolkit-form-row">
                        <label>Server host</label>
                        <input
                          type="text"
                          placeholder="host or IP"
                          value={setForm.host}
                          onChange={(e) => setSetForm((f) => ({ ...f, host: e.target.value }))}
                          className="toolkit-input"
                        />
                      </div>
                      <div className="toolkit-form-row">
                        <label>Port</label>
                        <input
                          type="text"
                          placeholder="port"
                          value={setForm.port}
                          onChange={(e) => setSetForm((f) => ({ ...f, port: e.target.value }))}
                          className="toolkit-input"
                        />
                      </div>
                      <button
                        type="button"
                        className="admin-btn admin-btn--small"
                        disabled={sending || !canSend}
                        onClick={() => setConfirmSet({ key: 'set_server', params: { host: setForm.host.trim(), port: Number(setForm.port) || 0 } })}
                      >
                        Set server host+port
                      </button>
                      <div className="toolkit-form-row" style={{ marginTop: '0.75rem' }}>
                        <label>Upload interval (s)</label>
                        <div className="toolkit-buttons">
                          {UPLOAD_INTERVAL_PRESETS.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className="admin-btn admin-btn--small"
                              disabled={sending || !canSend}
                              onClick={() => setConfirmSet({ key: 'set_upload_interval', params: { seconds: s } })}
                            >
                              {s}s
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="toolkit-form-row">
                        <label>APN</label>
                        <input type="text" placeholder="APN" value={setForm.apn} onChange={(e) => setSetForm((f) => ({ ...f, apn: e.target.value }))} className="toolkit-input" />
                        <input type="text" placeholder="User (optional)" value={setForm.apnUser} onChange={(e) => setSetForm((f) => ({ ...f, apnUser: e.target.value }))} className="toolkit-input" />
                        <input type="text" placeholder="Password (optional)" value={setForm.apnPw} onChange={(e) => setSetForm((f) => ({ ...f, apnPw: e.target.value }))} className="toolkit-input" />
                      </div>
                      <button
                        type="button"
                        className="admin-btn admin-btn--small"
                        disabled={sending || !canSend}
                        onClick={() => setConfirmSet({ key: 'set_apn', params: { apn: setForm.apn.trim(), user: setForm.apnUser.trim(), pw: setForm.apnPw.trim() } })}
                      >
                        Set APN
                      </button>
                    </div>
                  )}
                </div>
              )}
              {confirmSet && (
                <div className="toolkit-confirm">
                  <p>Confirm: send SET command &quot;{confirmSet.key}&quot;?</p>
                  <div className="admin-confirm-actions" style={{ marginTop: '0.5rem' }}>
                    <button type="button" className="admin-btn admin-btn--primary" onClick={() => sendCommand(confirmSet.key, confirmSet.params as Record<string, string | number>)}>Send</button>
                    <button type="button" className="admin-btn" onClick={() => setConfirmSet(null)}>Cancel</button>
                  </div>
                </div>
              )}
              <div className="toolkit-section">
                <h4 className="toolkit-section-title">Recent commands</h4>
                <div className="toolkit-recent-list">
                  {jobs.length === 0 && <p className="toolkit-recent-empty">No commands sent yet.</p>}
                  {jobs.slice(0, 8).map((j) => (
                    <div key={j.id} className="toolkit-recent-item">
                      <div className="toolkit-recent-item-main">
                        <span className="toolkit-recent-cmd">{j.command_name}</span>
                        <span className={`toolkit-recent-status toolkit-chip toolkit-chip--${j.status}`}>{j.status}</span>
                      </div>
                      <div className="toolkit-recent-item-meta">
                        {formatDate(j.created_at)}
                        {j.provider && <span className="toolkit-recent-provider"> · {j.provider}</span>}
                      </div>
                      {j.reply_raw && (
                        <div className="toolkit-recent-reply" title={j.reply_raw}>
                          {j.reply_raw.length > 60 ? j.reply_raw.slice(0, 60) + '…' : j.reply_raw}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {latestReply?.reply_parsed && (
                  <div className="toolkit-parsed-summary">
                    <strong>Latest reply:</strong>{' '}
                    {(latestReply.reply_parsed as { type?: string; map?: { url?: string }; gps?: { fix_flag?: string; speed_kmh?: number }; battery?: { percent?: number }; gsm?: { csq?: number }; power?: { battery_v?: number } }).type === '800' && (
                      <>Map: {(latestReply.reply_parsed as { map?: { url?: string } }).map?.url ? <a href={(latestReply.reply_parsed as { map: { url: string } }).map.url} target="_blank" rel="noreferrer">Link</a> : '—'}, Fix: {(latestReply.reply_parsed as { gps?: { fix_flag?: string } }).gps?.fix_flag ?? '—'}, Speed: {(latestReply.reply_parsed as { gps?: { speed_kmh?: number } }).gps?.speed_kmh ?? '—'}, Battery: {(latestReply.reply_parsed as { battery?: { percent?: number } }).battery?.percent ?? '—'}%</>
                    )}
                    {(latestReply.reply_parsed as { type?: string }).type === '802' && (
                      <>CSQ: {(latestReply.reply_parsed as { gsm?: { csq?: number } }).gsm?.csq ?? '—'}, Sats: {(latestReply.reply_parsed as { gps?: { sats?: number } }).gps?.sats ?? '—'}, Battery V: {(latestReply.reply_parsed as { power?: { battery_v?: number } }).power?.battery_v ?? '—'}</>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'log' && (
            <div className="tracker-settings-modal-panel toolkit-panel">
              <div className="toolkit-log-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Command</th>
                      <th>Status</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id} onClick={() => setSelectedJobId(j.id)} style={{ cursor: 'pointer' }}>
                        <td className="admin-time">{formatDate(j.created_at)}</td>
                        <td>{j.command_name}</td>
                        <td><span className={`toolkit-chip toolkit-chip--${j.status}`}>{j.status}</span> {j.provider ? `(${j.provider})` : ''}</td>
                        <td>{j.user_id ? (j.user_id.slice(0, 8) + '…') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedJob && (
                <div className="toolkit-detail">
                  <h4>Job: {selectedJob.command_name}</h4>
                  <p><strong>Command text</strong> <button type="button" className="admin-btn admin-btn--small" onClick={() => navigator.clipboard.writeText(selectedJob.command_text)}>Copy</button></p>
                  <pre className="toolkit-pre">{selectedJob.command_text}</pre>
                  <p><strong>Reply raw</strong> <button type="button" className="admin-btn admin-btn--small" onClick={() => selectedJob.reply_raw && navigator.clipboard.writeText(selectedJob.reply_raw)}>Copy</button></p>
                  <pre className="toolkit-pre">{selectedJob.reply_raw ?? '—'}</pre>
                  {selectedJob.reply_parsed && <p><strong>Parsed</strong></p>}
                  {selectedJob.reply_parsed && <pre className="toolkit-pre">{JSON.stringify(selectedJob.reply_parsed, null, 2)}</pre>}
                  {canWrite && !['replied', 'manual_reply'].includes(selectedJob.status) && (
                    <div className="toolkit-manual-reply">
                      <label>Manual reply (paste tracker SMS)</label>
                      <textarea value={manualReplyText} onChange={(e) => setManualReplyText(e.target.value)} className="toolkit-textarea" rows={3} />
                      <button type="button" className="admin-btn admin-btn--primary" onClick={() => submitManualReply(selectedJob.id)}>Save reply</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'sms' && (
            <div className="tracker-settings-modal-panel toolkit-panel">
              <p className="toolkit-section-title">Simbase SMS (Simbase API)</p>
              {smsList.message && <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{smsList.message}</p>}
              {smsList.iccid && <p style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>ICCID: <code>{smsList.iccid}</code></p>}
              <div className="toolkit-log-table-wrap" style={{ maxHeight: '320px' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Direction</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smsList.sms.length === 0 && (
                      <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>No SMS or no SIM ICCID for this device.</td></tr>
                    )}
                    {smsList.sms.map((s, i) => (
                      <tr key={i}>
                        <td className="admin-time">{formatDate(s.timestamp)}</td>
                        <td><span className={`toolkit-chip ${s.direction === 'mo' ? 'toolkit-chip--replied' : 'toolkit-chip--sent'}`}>{s.direction === 'mo' ? 'From SIM (reply)' : 'To SIM'}</span></td>
                        <td>{s.status}</td>
                        <td className="admin-mono" style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.message}>{s.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--muted)' }}>Refreshes every 5s when this tab is open.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
