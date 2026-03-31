/**
 * Parallel JT808 TCP ingest (e.g. GAT24). Listens on INGEST_JT808_PORT (default 8012).
 * Does not modify the main line-based ingest (index.ts).
 */
import net from 'net';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { ParsedLocation } from './parser';
import { createLocationPipeline, sleep, type ParsedLocationLike } from './location-pipeline';
import { runNightGuard } from './night-guard';
import { unescapeFrame, splitBody, bcd6ToDigits } from './jt808/codec';
import { parseLocationBody, parseRegisterTerminalId } from './jt808/location';
import { buildGeneralReply, buildRegisterReply } from './jt808/reply';

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(__dirname, '..', '..');
const envInApp = path.join(appRoot, '.env');
const envInRepo = path.join(repoRoot, '.env');
const envLoadedFrom = fs.existsSync(envInApp) ? envInApp : fs.existsSync(envInRepo) ? envInRepo : 'cwd';
if (fs.existsSync(envInApp)) config({ path: envInApp });
else if (fs.existsSync(envInRepo)) config({ path: envInRepo });
else config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const INGEST_HOST = process.env.INGEST_JT808_HOST ?? process.env.INGEST_HOST ?? '0.0.0.0';
const INGEST_JT808_PORT = parseInt(process.env.INGEST_JT808_PORT ?? '8012', 10);
const REQUIRE_DEVICE_PREEXIST = process.env.REQUIRE_DEVICE_PREEXIST !== 'false';
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const HEALTH_JT808_PORT = parseInt(process.env.HEALTH_JT808_PORT ?? process.env.JT808_HEALTH_PORT ?? '8091', 10);
const MAX_SOCKET_BUFFER_BYTES = parseInt(process.env.MAX_SOCKET_BUFFER_BYTES ?? '1048576', 10) || 1048576;
const LOG_MAX_PER_SEC = parseInt(process.env.LOG_MAX_PER_SEC ?? '20', 10) || 20;
const SUPABASE_RETRIES = parseInt(process.env.SUPABASE_RETRIES ?? '3', 10) || 3;
const DEVICE_CACHE_TTL_MS = parseInt(process.env.DEVICE_CACHE_TTL_MS ?? '60000', 10) || 60000;
const DEVICE_CHECK_RETRY_DELAY_MS = parseInt(process.env.DEVICE_CHECK_RETRY_DELAY_MS ?? '3000', 10) || 3000;
const DEDUP_WINDOW_MS = 10_000;
const JT808_AUTH_CODE = (process.env.JT808_AUTH_CODE ?? '123456').trim() || '123456';
/** Prefer INGEST_JT808_SERVER_NAME so a shared .env can set INGEST_SERVER_NAME for the line ingest only. */
const INGEST_SERVER_NAME =
  (process.env.INGEST_JT808_SERVER_NAME ?? process.env.INGEST_SERVER_NAME ?? 'GAT24-test').trim() || 'GAT24-test';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEADLETTER_PATH = path.join(DATA_DIR, 'jt808-deadletter.log');
const FALLBACK_PATH = path.join(DATA_DIR, 'jt808-fallback.log');

const startTime = Date.now();
let connections = 0;
let jt808Frames = 0;
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
  console.log(JSON.stringify({ level, msg, service: 'jt808', ...meta }));
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

const clientSockets = new Set<net.Socket>();
/** Populated when processing JT808 frames (used for connection error attribution). */
const socketToDeviceId = new Map<net.Socket, string>();

function normalizeDeviceId(digits: string): string {
  const d = digits.replace(/\D/g, '');
  const trimmed = d.replace(/^0+/, '');
  return trimmed || d || '0';
}

const MSG_REGISTER = 0x0100;
const MSG_AUTH = 0x0102;
const MSG_HEARTBEAT = 0x0002;
const MSG_LOCATION = 0x0200;
const MSG_LOCATION_REPLY = 0x0201;

function sendReply(socket: net.Socket, buf: Buffer) {
  socket.write(buf);
}

function rememberSocketDevice(
  socket: net.Socket,
  socketState: { lastTerminalId: string | null },
  phoneDigits: string
) {
  socketToDeviceId.set(socket, socketState.lastTerminalId ?? normalizeDeviceId(phoneDigits));
}

function processFrame(socket: net.Socket, escapedPayload: Buffer, socketState: { lastTerminalId: string | null }) {
  const unescaped = unescapeFrame(escapedPayload);
  const frame = splitBody(unescaped);
  if (!frame) {
    log('warn', 'jt808 frame verify failed', { hex: unescaped.toString('hex').slice(0, 80) });
    return;
  }
  jt808Frames++;
  const { header, body } = frame;
  const phoneDigits = bcd6ToDigits(unescaped.subarray(4, 10));
  const terminalId = socketState.lastTerminalId ?? normalizeDeviceId(phoneDigits);

  log('debug', 'jt808 message', {
    msgId: `0x${header.messageId.toString(16)}`,
    serial: header.serialNumber,
    terminalId,
    bodyLen: body.length,
  });

  const replyPhone = phoneDigits.padStart(12, '0');

  if (header.messageId === MSG_REGISTER) {
    const regId = parseRegisterTerminalId(body);
    if (regId) {
      socketState.lastTerminalId = normalizeDeviceId(regId);
    }
    sendReply(socket, buildRegisterReply(header, replyPhone, JT808_AUTH_CODE, 0));
    rememberSocketDevice(socket, socketState, phoneDigits);
    return;
  }

  if (header.messageId === MSG_AUTH) {
    sendReply(socket, buildGeneralReply(header, replyPhone, 0));
    rememberSocketDevice(socket, socketState, phoneDigits);
    return;
  }

  if (header.messageId === MSG_HEARTBEAT) {
    sendReply(socket, buildGeneralReply(header, replyPhone, 0));
    rememberSocketDevice(socket, socketState, phoneDigits);
    return;
  }

  if (header.messageId === MSG_LOCATION || header.messageId === MSG_LOCATION_REPLY) {
    const rawHex = unescaped.toString('hex');
    const idForLocation = socketState.lastTerminalId ?? normalizeDeviceId(phoneDigits);
    const parsed = parseLocationBody(body, idForLocation, rawHex);
    if (!parsed) {
      log('warn', 'jt808 location parse failed', { bodyLen: body.length });
      sendReply(socket, buildGeneralReply(header, replyPhone, 0));
      rememberSocketDevice(socket, socketState, phoneDigits);
      return;
    }
    sendReply(socket, buildGeneralReply(header, replyPhone, 0));
    rememberSocketDevice(socket, socketState, phoneDigits);
    void handleParsedLocation(parsed, socket);
    return;
  }

  sendReply(socket, buildGeneralReply(header, replyPhone, 0));
  rememberSocketDevice(socket, socketState, phoneDigits);
  log('info', 'jt808 unhandled message id', { msgId: `0x${header.messageId.toString(16)}` });
}

async function handleParsedLocation(parsed: ParsedLocationLike, socket: net.Socket) {
  if (!supabase) {
    log('warn', 'Supabase not configured');
    return;
  }
  if (!parsed.device_id) return;

  const exists = await ensureDevice(parsed.device_id);
  if (shuttingDown) return;

  if (REQUIRE_DEVICE_PREEXIST && !exists) {
    await sleep(DEVICE_CHECK_RETRY_DELAY_MS);
    const existsAfter = await ensureDeviceFresh(parsed.device_id);
    if (shuttingDown) return;
    if (existsAfter) {
      setDeviceCacheEntry(parsed.device_id, true);
      runNightGuard(supabase, parsed as ParsedLocation);
      const inserted = await insertLocation(parsed);
      log('info', 'jt808 location', { device_id: parsed.device_id, inserted });
      return;
    }
    setDeviceCacheEntry(parsed.device_id, false);
    rejectedUnknownDevice++;
    appendDeadletter(parsed.device_id, parsed.raw_payload);
    log('info', 'rejected unknown device', { device_id: parsed.device_id });
    return;
  }

  if (!exists) return;
  runNightGuard(supabase, parsed as ParsedLocation);
  const inserted = await insertLocation(parsed);
  log('info', 'jt808 location', { device_id: parsed.device_id, inserted });
}

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
    });
}

const SOCKET_KEEPALIVE_INITIAL_DELAY_MS = 30_000;

const server = net.createServer((socket) => {
  if (shuttingDown) {
    socket.destroy();
    return;
  }
  connections++;
  clientSockets.add(socket);
  socket.setKeepAlive(true, SOCKET_KEEPALIVE_INITIAL_DELAY_MS);
  let rx = Buffer.alloc(0);
  const bufferByteLimit = Math.max(1024, Math.min(MAX_SOCKET_BUFFER_BYTES, 10 * 1024 * 1024));
  const socketState = { lastTerminalId: null as string | null };

  const removeSocket = () => {
    clientSockets.delete(socket);
    socketToDeviceId.delete(socket);
  };
  socket.once('close', removeSocket);
  socket.once('error', removeSocket);

  socket.on('data', (chunk: Buffer) => {
    rx = Buffer.concat([rx, chunk]);
    if (rx.length > bufferByteLimit) {
      errors++;
      lastError = 'jt808 socket buffer exceeded';
      lastErrorAt = Date.now();
      log('warn', 'socket buffer exceeded limit', { limit: bufferByteLimit });
      socket.destroy();
      connections--;
      return;
    }

    while (rx.length > 0) {
      let start = rx.indexOf(0x7e);
      if (start < 0) break;
      if (start > 0) rx = rx.subarray(start);
      const end = rx.indexOf(0x7e, 1);
      if (end < 0) break;
      const escapedInner = rx.subarray(1, end);
      rx = rx.subarray(end + 1);
      if (escapedInner.length > 0) {
        try {
          processFrame(socket, escapedInner, socketState);
        } catch (e) {
          errors++;
          lastError = `jt808 process: ${e}`;
          lastErrorAt = Date.now();
          log('error', 'jt808 frame error', { err: String(e) });
        }
      }
    }
  });

  socket.on('end', () => {
    connections--;
  });
  socket.on('error', (err: Error) => {
    connections--;
    if (isExpectedIdleDisconnect(err)) {
      log('debug', 'socket closed (idle)', { err: err.message });
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

server.listen(INGEST_JT808_PORT, INGEST_HOST, () => {
  log('info', `JT808 TCP ingest listening on ${INGEST_HOST}:${INGEST_JT808_PORT}`);
  log('info', 'jt808 config', {
    ingest_server: INGEST_SERVER_NAME,
    health_port: HEALTH_JT808_PORT,
    env_loaded_from: envLoadedFrom,
  });
});

const healthServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: shuttingDown ? 'draining' : 'ok',
      service: 'jt808',
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      connections,
      jt808_frames: jt808Frames,
      inserted_rows: insertedRows,
      dedup_skipped: getDedupSkipped(),
      deadletter_writes: deadletterWrites,
      fallback_writes: fallbackWrites,
      rejected_unknown_device: rejectedUnknownDevice,
      errors,
      ...(lastError && {
        last_error: lastError,
        last_error_at: lastErrorAt != null ? new Date(lastErrorAt).toISOString() : null,
      }),
    })
  );
});

healthServer.listen(HEALTH_JT808_PORT, '0.0.0.0', () => {
  log('info', `JT808 health server on port ${HEALTH_JT808_PORT}`);
});

function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', `received ${signal}, shutting down`);
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
