import net from 'net';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env: app dir (ingest/.env), repo root (.env when run from repo/ingest/dist), or cwd
const appRoot = path.resolve(__dirname, '..');       // ingest/
const repoRoot = path.resolve(__dirname, '..', '..');
const envInApp = path.join(appRoot, '.env');
const envInRepo = path.join(repoRoot, '.env');
const envLoadedFrom = fs.existsSync(envInApp) ? envInApp : fs.existsSync(envInRepo) ? envInRepo : 'cwd';
if (fs.existsSync(envInApp)) config({ path: envInApp });
else if (fs.existsSync(envInRepo)) config({ path: envInRepo });
else config();
import { parseIStartekLine, parsePT60Line } from './parser';
import { parsePacket133Line } from './packet-133';
import { initNightGuard, runNightGuard, shutdownNightGuard } from './night-guard';
import { initCarrierPoller, shutdownCarrierPoller } from './carrier-poller';
import { createLocationPipeline, sleep, type ParsedLocationLike } from './location-pipeline';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const INGEST_HOST = process.env.INGEST_HOST ?? '0.0.0.0';
const INGEST_PORT = parseInt(process.env.INGEST_PORT ?? '8011', 10);
const REQUIRE_DEVICE_PREEXIST = process.env.REQUIRE_DEVICE_PREEXIST !== 'false';
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? '8090', 10);
const MAX_SOCKET_BUFFER_BYTES = parseInt(process.env.MAX_SOCKET_BUFFER_BYTES ?? '1048576', 10) || 1048576;
const LOG_MAX_PER_SEC = parseInt(process.env.LOG_MAX_PER_SEC ?? '20', 10) || 20;
const SUPABASE_RETRIES = parseInt(process.env.SUPABASE_RETRIES ?? '3', 10) || 3;
/** How long to cache "device exists" (ms). New devices appear within this after being added. */
const DEVICE_CACHE_TTL_MS = parseInt(process.env.DEVICE_CACHE_TTL_MS ?? '60000', 10) || 60000;
/** When device not found, retry once after this delay (ms) before deadlettering (handles "just added" / replication lag). */
const DEVICE_CHECK_RETRY_DELAY_MS = parseInt(process.env.DEVICE_CHECK_RETRY_DELAY_MS ?? '3000', 10) || 3000;

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEADLETTER_PATH = path.join(DATA_DIR, 'deadletter.log');
const FALLBACK_PATH = path.join(DATA_DIR, 'fallback.log');

/** Server name for this ingest instance (e.g. Skippy, Joey). Stored on each location row so the UI can show "Server: Skippy". */
const INGEST_SERVER_NAME = (process.env.INGEST_SERVER_NAME ?? '').trim() || null;

const startTime = Date.now();
let connections = 0;
let parsedLines = 0;
let insertedRows = 0;
let rejectedUnknownDevice = 0;
let deadletterWrites = 0;
let fallbackWrites = 0;
let errors = 0;
let lastError: string | null = null;
let lastErrorAt: number | null = null;
let shuttingDown = false;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const LOG_LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let logCount = 0;
let logCountResetAt = Date.now();

function log(level: string, msg: string, meta?: Record<string, unknown>) {
  if ((LOG_LEVELS[level] ?? 0) < (LOG_LEVELS[LOG_LEVEL] ?? 1)) return;
  const now = Date.now();
  if (now >= logCountResetAt + 1000) {
    logCountResetAt = now;
    logCount = 0;
  }
  logCount++;
  if (logCount > LOG_MAX_PER_SEC) return;
  const line = JSON.stringify({ level, msg, ...meta });
  console.log(line);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function appendDeadletter(deviceId: string, raw: string) {
  try {
    ensureDataDir();
    const line = `${new Date().toISOString()}\t${deviceId}\t${raw}\n`;
    fs.appendFileSync(DEADLETTER_PATH, line);
    deadletterWrites++;
  } catch (e) {
    errors++;
    lastError = `deadletter write: ${e}`;
    lastErrorAt = Date.now();
    log('error', 'deadletter write failed', { err: String(e) });
  }
}

function appendFallback(raw: string) {
  try {
    ensureDataDir();
    const line = `${new Date().toISOString()}\t${raw}\n`;
    fs.appendFileSync(FALLBACK_PATH, line);
    fallbackWrites++;
  } catch (e) {
    errors++;
    lastError = `fallback write: ${e}`;
    lastErrorAt = Date.now();
    log('error', 'fallback write failed', { err: String(e) });
  }
}

// ── Duplicate-packet deduplication (see location-pipeline) ────────────────────
const DEDUP_WINDOW_MS = 10_000;
const locationPipeline = createLocationPipeline({
  supabase,
  ingestServerName: INGEST_SERVER_NAME,
  deviceCacheTtlMs: DEVICE_CACHE_TTL_MS,
  supabaseRetries: SUPABASE_RETRIES,
  dedupWindowMs: DEDUP_WINDOW_MS,
  hooks: {
    log,
    appendFallback,
    onLastError: (msg) => {
      lastError = msg;
      lastErrorAt = Date.now();
    },
    onInsertedRow: () => {
      insertedRows++;
    },
    onErrorCount: () => {
      errors++;
    },
  },
});
const { ensureDevice, ensureDeviceFresh, insertLocation, setDeviceCacheEntry, getDedupSkipped } = locationPipeline;

function logParsedMessage(
  isStartek: ReturnType<typeof parseIStartekLine>,
  inserted: boolean,
  reasonIfNot: string | null
) {
  try {
    const power = (isStartek.extra?.power as { bat_hex?: string } | undefined) ?? undefined;
    log('info', 'parsed', {
      deviceId: isStartek.deviceId,
      gpsTimeUtc: isStartek.gpsTimeUtc,
      gpsTimeLocal: isStartek.gpsTimeLocal,
      lat: isStartek.latitude,
      lon: isStartek.longitude,
      speedKph: isStartek.speedKph,
      batteryVoltageV: isStartek.batteryVoltageV,
      batteryPercent: isStartek.batteryPercent,
      batV_hex: power?.bat_hex,
      inserted,
      reasonIfNot,
    });
  } catch {
    // never crash on malformed log
  }
}

const clientSockets = new Set<net.Socket>();
/** Last device_id seen on each socket (so we can attribute connection errors to a device) */
const socketToDeviceId = new Map<net.Socket, string>();

/** Idle/sleep disconnects: device or network closed after no data (e.g. 12h heartbeat). Don't count as errors. */
function isExpectedIdleDisconnect(err: Error): boolean {
  const code = (err as NodeJS.ErrnoException).code ?? '';
  const msg = (err.message ?? '').toLowerCase();
  if (['ETIMEDOUT', 'ECONNRESET', 'EPIPE'].includes(code)) return true;
  if (msg.includes('read etimedout') || msg.includes('econnreset') || msg.includes('socket hang up')) return true;
  return false;
}

function recordConnectionError(deviceId: string, errorMessage: string) {
  if (!supabase) return;
  supabase
    .from('device_connection_errors')
    .insert({ device_id: deviceId, error_message: errorMessage })
    .then(({ error }) => {
      if (error) log('warn', 'device_connection_errors insert failed', { err: error.message });
      else log('info', 'recorded connection error for device', { device_id: deviceId, error: errorMessage });
    });
}

function handleLine(line: string, socket?: net.Socket) {
  if (shuttingDown) return;
  const isStartek = parseIStartekLine(line);
  parsedLines++;
  const parsed = parsePacket133Line(line) ?? parsePT60Line(line);
  if (!parsed) {
    logParsedMessage(isStartek, false, 'parse_failed');
    return;
  }
  if (!parsed.device_id) {
    logParsedMessage(isStartek, false, 'no_device_id');
    return;
  }
  if (socket) socketToDeviceId.set(socket, parsed.device_id);
  if (!supabase) {
    log('warn', 'Supabase not configured');
    logParsedMessage(isStartek, false, 'no_supabase');
    return;
  }
  ensureDevice(parsed.device_id).then((exists) => {
    if (shuttingDown) return;
    if (REQUIRE_DEVICE_PREEXIST && !exists) {
      // Retry once after a short delay so a newly added device (or replication lag) is picked up without restart
      sleep(DEVICE_CHECK_RETRY_DELAY_MS).then(() => ensureDeviceFresh(parsed.device_id)).then((existsAfterRetry) => {
        if (shuttingDown) return;
        if (existsAfterRetry) {
          setDeviceCacheEntry(parsed.device_id, true);
          runNightGuard(supabase, parsed);
          insertLocation(parsed).then((inserted) => {
            logParsedMessage(isStartek, inserted, inserted ? null : 'insert_failed');
          });
          return;
        }
        setDeviceCacheEntry(parsed.device_id, false);
        rejectedUnknownDevice++;
        appendDeadletter(parsed.device_id, parsed.raw_payload);
        log('info', 'rejected unknown device', { device_id: parsed.device_id, raw: parsed.raw_payload });
        logParsedMessage(isStartek, false, 'unknown_device');
      });
      return;
    }
    if (!exists) return;
    runNightGuard(supabase, parsed);
    insertLocation(parsed).then((inserted) => {
      logParsedMessage(isStartek, inserted, inserted ? null : 'insert_failed');
    });
  });
}

// TCP keepalive: send probes after idle so NAT/firewalls don't close the connection (reduces overnight ECONNRESET)
const SOCKET_KEEPALIVE_INITIAL_DELAY_MS = 30_000;

const server = net.createServer((socket) => {
  if (shuttingDown) {
    socket.destroy();
    return;
  }
  connections++;
  clientSockets.add(socket);
  socket.setKeepAlive(true, SOCKET_KEEPALIVE_INITIAL_DELAY_MS);
  let buffer = '';
  const bufferByteLimit = Math.max(1024, Math.min(MAX_SOCKET_BUFFER_BYTES, 10 * 1024 * 1024));
  socket.setEncoding('utf8');
  const removeSocket = () => {
    clientSockets.delete(socket);
    socketToDeviceId.delete(socket);
  };
  socket.once('close', removeSocket);
  socket.once('error', removeSocket);
  socket.on('data', (chunk) => {
    const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    log('debug', 'socket data', { bytes: Buffer.byteLength(chunkStr, 'utf8'), preview: chunkStr.slice(0, 200).replace(/[\r\n]/g, ' ') });
    buffer += chunkStr;
    const byteLength = Buffer.byteLength(buffer, 'utf8');
    if (byteLength > bufferByteLimit) {
      errors++;
      lastError = `socket buffer exceeded (limit ${bufferByteLimit})`;
      lastErrorAt = Date.now();
      log('warn', 'socket buffer exceeded limit', { limit: bufferByteLimit });
      socket.destroy();
      connections--;
      return;
    }
    // Split on \r\n or \n so we handle both (some devices send \n only)
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    parts.forEach((p) => {
      if (p.trim()) handleLine(p, socket);
    });
  });
  socket.on('end', () => {
    if (buffer.trim()) handleLine(buffer, socket);
    connections--;
  });
  socket.on('error', (err: Error) => {
    connections--;
    if (isExpectedIdleDisconnect(err)) {
      log('debug', 'socket closed (idle/sleep disconnect)', { err: err.message });
      return;
    }
    errors++;
    lastError = `socket error: ${err.message}`;
    lastErrorAt = Date.now();
    const deviceId = socketToDeviceId.get(socket);
    if (deviceId) recordConnectionError(deviceId, err.message);
  });
});

function closeAllSockets() {
  for (const s of clientSockets) {
    try {
      s.destroy();
    } catch {
      // ignore
    }
  }
  clientSockets.clear();
}

server.listen(INGEST_PORT, INGEST_HOST, () => {
  log('info', `TCP ingest listening on ${INGEST_HOST}:${INGEST_PORT}`);
  log('info', 'ingest_server name for locations', {
    ingest_server: INGEST_SERVER_NAME ?? '(not set)',
    env_loaded_from: envLoadedFrom,
  });
  initNightGuard(supabase);
  if (supabase) initCarrierPoller(supabase, log);
});

const DEADLETTER_MAX_LINES = parseInt(process.env.DEADLETTER_MAX_LINES ?? '200', 10) || 200;

const healthServer = http.createServer((req, res) => {
  const path = req.url?.split('?')[0] ?? '/';
  const method = req.method ?? 'GET';

  if (path === '/reset-last-error' && method === 'POST') {
    lastError = null;
    lastErrorAt = null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (path === '/deadletter/reset' && method === 'POST') {
    try {
      ensureDataDir();
      fs.writeFileSync(DEADLETTER_PATH, '');
      deadletterWrites = 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (path === '/deadletter') {
    if (method === 'GET') {
      try {
        const raw = fs.existsSync(DEADLETTER_PATH) ? fs.readFileSync(DEADLETTER_PATH, 'utf8') : '';
        const lines = raw.trim().split('\n').filter(Boolean);
        const last = lines.slice(-DEADLETTER_MAX_LINES).map((line) => {
          const [ts, deviceId, ...rest] = line.split('\t');
          return { ts, device_id: deviceId, raw: rest.join('\t') };
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ entries: last, total_writes: deadletterWrites }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: shuttingDown ? 'draining' : 'ok',
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      connections,
      parsed_lines: parsedLines,
      inserted_rows: insertedRows,
      dedup_skipped: getDedupSkipped(),
      deadletter_writes: deadletterWrites,
      fallback_writes: fallbackWrites,
      rejected_unknown_device: rejectedUnknownDevice,
      errors,
      ...(lastError && { last_error: lastError, last_error_at: lastErrorAt != null ? new Date(lastErrorAt).toISOString() : null }),
    })
  );
});

healthServer.listen(HEALTH_PORT, '0.0.0.0', () => {
  log('info', `Health server on port ${HEALTH_PORT}`);
});

function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', `received ${signal}, shutting down`);
  shutdownNightGuard();
  shutdownCarrierPoller();
  closeAllSockets();
  server.close(() => {
    healthServer.close(() => {
      log('info', 'shutdown complete');
      process.exit(0);
    });
  });
  const forceExit = setTimeout(() => {
    log('warn', 'shutdown timeout, forcing exit');
    process.exit(1);
  }, 5000);
  forceExit.unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
