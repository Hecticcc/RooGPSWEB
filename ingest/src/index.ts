import net from 'net';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { parseIStartekLine, parsePT60Line } from './parser';

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

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEADLETTER_PATH = path.join(DATA_DIR, 'deadletter.log');
const FALLBACK_PATH = path.join(DATA_DIR, 'fallback.log');

const startTime = Date.now();
let connections = 0;
let parsedLines = 0;
let insertedRows = 0;
let rejectedUnknownDevice = 0;
let deadletterWrites = 0;
let fallbackWrites = 0;
let errors = 0;
let lastError: string | null = null;
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
    log('error', 'fallback write failed', { err: String(e) });
  }
}

async function ensureDevice(deviceId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.from('devices').select('id').eq('id', deviceId).maybeSingle();
  if (error) {
    errors++;
    lastError = `devices check: ${error.message}`;
    log('error', 'devices check failed', { err: error.message });
    return false;
  }
  return !!data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function insertLocation(parsed: ReturnType<typeof parsePT60Line>): Promise<boolean> {
  if (!supabase || !parsed) return false;
  const row = {
    device_id: parsed.device_id,
    gps_time: parsed.gps_time,
    gps_valid: parsed.gps_valid,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    speed_kph: parsed.speed_kph,
    course_deg: parsed.course_deg,
    event_code: parsed.event_code,
    raw_payload: parsed.raw_payload,
    extra: parsed.extra,
  };
  const backoffMs = [100, 300, 900];
  for (let attempt = 0; attempt < SUPABASE_RETRIES; attempt++) {
    const { error: insertErr } = await supabase.from('locations').insert(row);
    if (!insertErr) {
      insertedRows++;
      const { error: updateErr } = await supabase.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', parsed.device_id);
      if (updateErr) log('warn', 'devices last_seen_at update failed', { err: updateErr.message });
      return true;
    }
    if (attempt < SUPABASE_RETRIES - 1) {
      const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)];
      await sleep(delay);
    } else {
      errors++;
      lastError = `locations insert: ${insertErr.message}`;
      log('error', 'locations insert failed after retries', { err: insertErr.message });
      appendFallback(parsed.raw_payload);
      return false;
    }
  }
  return false;
}

function logParsedMessage(
  isStartek: ReturnType<typeof parseIStartekLine>,
  inserted: boolean,
  reasonIfNot: string | null
) {
  try {
    log('info', 'parsed', {
      deviceId: isStartek.deviceId,
      gpsTimeUtc: isStartek.gpsTimeUtc,
      gpsTimeLocal: isStartek.gpsTimeLocal,
      lat: isStartek.latitude,
      lon: isStartek.longitude,
      speedKph: isStartek.speedKph,
      batteryVoltageV: isStartek.batteryVoltageV,
      batteryPercent: isStartek.batteryPercent,
      inserted,
      reasonIfNot,
    });
  } catch {
    // never crash on malformed log
  }
}

function handleLine(line: string) {
  if (shuttingDown) return;
  const isStartek = parseIStartekLine(line);
  parsedLines++;
  const parsed = parsePT60Line(line);
  if (!parsed) {
    logParsedMessage(isStartek, false, 'parse_failed');
    return;
  }
  if (!parsed.device_id) {
    logParsedMessage(isStartek, false, 'no_device_id');
    return;
  }
  if (!supabase) {
    log('warn', 'Supabase not configured');
    logParsedMessage(isStartek, false, 'no_supabase');
    return;
  }
  ensureDevice(parsed.device_id).then((exists) => {
    if (shuttingDown) return;
    if (REQUIRE_DEVICE_PREEXIST && !exists) {
      rejectedUnknownDevice++;
      appendDeadletter(parsed.device_id, parsed.raw_payload);
      log('info', 'rejected unknown device', { device_id: parsed.device_id, raw: parsed.raw_payload });
      logParsedMessage(isStartek, false, 'unknown_device');
      return;
    }
    if (!exists) return;
    insertLocation(parsed).then((inserted) => {
      logParsedMessage(isStartek, inserted, inserted ? null : 'insert_failed');
    });
  });
}

const clientSockets = new Set<net.Socket>();

const server = net.createServer((socket) => {
  if (shuttingDown) {
    socket.destroy();
    return;
  }
  connections++;
  clientSockets.add(socket);
  let buffer = '';
  const bufferByteLimit = Math.max(1024, Math.min(MAX_SOCKET_BUFFER_BYTES, 10 * 1024 * 1024));
  socket.setEncoding('utf8');
  const removeSocket = () => {
    clientSockets.delete(socket);
  };
  socket.once('close', removeSocket);
  socket.once('error', removeSocket);
  socket.on('data', (chunk) => {
    buffer += chunk;
    const byteLength = Buffer.byteLength(buffer, 'utf8');
    if (byteLength > bufferByteLimit) {
      errors++;
      lastError = `socket buffer exceeded (limit ${bufferByteLimit})`;
      log('warn', 'socket buffer exceeded limit', { limit: bufferByteLimit });
      socket.destroy();
      connections--;
      return;
    }
    const parts = buffer.split('\r\n');
    buffer = parts.pop() ?? '';
    parts.forEach((p) => {
      if (p.trim()) handleLine(p);
    });
  });
  socket.on('end', () => {
    if (buffer.trim()) handleLine(buffer);
    connections--;
  });
  socket.on('error', (err: Error) => {
    connections--;
    errors++;
    lastError = `socket error: ${err.message}`;
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
});

const healthServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: shuttingDown ? 'draining' : 'ok',
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      connections,
      parsed_lines: parsedLines,
      inserted_rows: insertedRows,
      deadletter_writes: deadletterWrites,
      fallback_writes: fallbackWrites,
      rejected_unknown_device: rejectedUnknownDevice,
      errors,
      ...(lastError && { last_error: lastError }),
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
