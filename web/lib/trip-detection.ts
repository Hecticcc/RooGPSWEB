/**
 * Trip detection from location points (iStartek/PT60 GPRS event data).
 * Usable point = valid fix, sats >= 3, hdop in (0, 6], non-zero lat/lon.
 * Trip start/end and distance rules per spec; distance via Haversine (odometer optional later).
 */

const TRIP_START_SPEED_KMH = 3;
const TRIP_START_SPEED_STRONG_KMH = 8;
const TRIP_END_STATIONARY_MINUTES = 5;
const TRIP_END_SPEED_KMH = 1;
const TRIP_END_GAP_MINUTES = 20;
const CONSECUTIVE_POINTS_WINDOW_MINUTES = 5;
const MIN_SEGMENT_DISTANCE_M = 30;
const JITTER_DISTANCE_M = 15;
const JITTER_SPEED_KMH = 3;
const GPS_GLITCH_JUMP_M = 2000;
const GPS_GLITCH_WINDOW_SEC = 30;
const MIN_HDOP = 0;
const MAX_HDOP = 6;
const MIN_SATS = 3;
const MIN_TRIP_DURATION_SEC = 120;
const MIN_TRIP_DISTANCE_M = 300;
const MAX_SPEED_KMH_CAP = 200;

export type LocationPoint = {
  id: string;
  gps_time: string | null;
  received_at: string;
  gps_valid: boolean | null;
  latitude: number | null;
  longitude: number | null;
  speed_kph: number | null;
  extra: Record<string, unknown> | null;
};

function getSatsHdop(p: LocationPoint): { sats: number; hdop: number } {
  const signal = (p.extra?.signal as { gps?: { sats?: number; hdop?: number } } | undefined)?.gps;
  if (signal && typeof signal.sats === 'number' && typeof signal.hdop === 'number') {
    return { sats: signal.sats, hdop: signal.hdop };
  }
  return { sats: p.gps_valid ? 4 : 0, hdop: p.gps_valid ? 3 : 99 };
}

export function isUsablePoint(p: LocationPoint): boolean {
  if (p.gps_valid !== true || p.latitude == null || p.longitude == null) return false;
  if (p.latitude === 0 && p.longitude === 0) return false;
  const { sats, hdop } = getSatsHdop(p);
  return sats >= MIN_SATS && hdop > MIN_HDOP && hdop <= MAX_HDOP;
}

function getSpeedKmh(p: LocationPoint): number {
  const v = p.speed_kph ?? (p.extra?.signal as { gps?: { speed_kmh?: number } } | undefined)?.gps?.speed_kmh;
  return typeof v === 'number' && !Number.isNaN(v) ? Math.min(MAX_SPEED_KMH_CAP, v) : 0;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toTs(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export type TripSegment = {
  points: LocationPoint[];
  startIndex: number;
  endIndex: number;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  distanceMeters: number;
  maxSpeedKmh: number;
};

/**
 * Segment ordered points (by gps_time or received_at) into trips.
 * Points array must be sorted ascending by time.
 */
export function segmentTrips(points: LocationPoint[]): TripSegment[] {
  if (points.length === 0) return [];
  const segments: TripSegment[] = [];
  let segmentStart: number | null = null;
  let lastMovingIndex: number | null = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const usable = isUsablePoint(p);
    const speed = getSpeedKmh(p);
    const time = toTs(p.gps_time ?? p.received_at);

    if (!usable) {
      if (segmentStart != null) {
        const gapMin = (time - toTs(points[lastMovingIndex!].gps_time ?? points[lastMovingIndex!].received_at)) / 60000;
        if (gapMin > TRIP_END_GAP_MINUTES) {
          pushSegment(segments, points, segmentStart, lastMovingIndex!);
          segmentStart = null;
          lastMovingIndex = null;
        }
      }
      continue;
    }

    const lat = p.latitude!;
    const lon = p.longitude!;

    if (segmentStart == null) {
      const prevUsable =
        i > 0 && isUsablePoint(points[i - 1]) && (time - toTs(points[i - 1].gps_time ?? points[i - 1].received_at)) / 60000 <= CONSECUTIVE_POINTS_WINDOW_MINUTES;
      const prevSpeed = i > 0 ? getSpeedKmh(points[i - 1]) : 0;
      const distToPrev =
        i > 0 && points[i - 1].latitude != null && points[i - 1].longitude != null
          ? haversineMeters(points[i - 1].latitude!, points[i - 1].longitude!, lat, lon)
          : 0;
      const startByTwo = prevUsable && prevSpeed >= TRIP_START_SPEED_KMH && distToPrev >= MIN_SEGMENT_DISTANCE_M;
      const startByOne = speed >= TRIP_START_SPEED_STRONG_KMH;
      if (startByTwo || startByOne) {
        segmentStart = i;
        lastMovingIndex = i;
      }
      continue;
    }

    const prevTime = toTs(points[lastMovingIndex!].gps_time ?? points[lastMovingIndex!].received_at);
    const dtSec = (time - prevTime) / 1000;
    const gapMin = (time - prevTime) / 60000;

    if (gapMin > TRIP_END_GAP_MINUTES) {
      pushSegment(segments, points, segmentStart, lastMovingIndex!);
      segmentStart = i;
      lastMovingIndex = i;
      continue;
    }

    const prev = points[lastMovingIndex!];
    const distSegment = haversineMeters(prev.latitude!, prev.longitude!, lat, lon);
    const isJitter = distSegment < JITTER_DISTANCE_M && speed < JITTER_SPEED_KMH;
    if (isJitter) continue;

    if (dtSec <= GPS_GLITCH_WINDOW_SEC && distSegment > GPS_GLITCH_JUMP_M) continue;

    if (speed >= TRIP_END_SPEED_KMH) lastMovingIndex = i;

    const lastMovingTime = toTs(points[lastMovingIndex!].gps_time ?? points[lastMovingIndex!].received_at);
    const sinceMovingMin = (time - lastMovingTime) / 60000;
    if (sinceMovingMin >= TRIP_END_STATIONARY_MINUTES) {
      pushSegment(segments, points, segmentStart, lastMovingIndex!);
      segmentStart = null;
      lastMovingIndex = null;
      if (speed >= TRIP_START_SPEED_KMH || speed >= TRIP_START_SPEED_STRONG_KMH) {
        segmentStart = i;
        lastMovingIndex = i;
      }
    }
  }

  if (segmentStart != null && lastMovingIndex != null) {
    pushSegment(segments, points, segmentStart, lastMovingIndex);
  }

  return segments.filter(
    (s) =>
      s.durationSeconds >= MIN_TRIP_DURATION_SEC || s.distanceMeters >= MIN_TRIP_DISTANCE_M
  );
}

function pushSegment(
  segments: TripSegment[],
  points: LocationPoint[],
  startIdx: number,
  endIdx: number
): void {
  const slice = points.slice(startIdx, endIdx + 1);
  let distanceMeters = 0;
  let maxSpeedKmh = 0;
  const { sats: _s, hdop: _h } = getSatsHdop(points[startIdx]);
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1];
    const curr = slice[i];
    if (prev.latitude == null || prev.longitude == null || curr.latitude == null || curr.longitude == null) continue;
    const dtSec = (toTs(curr.gps_time ?? curr.received_at) - toTs(prev.gps_time ?? prev.received_at)) / 1000;
    const d = haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    if (dtSec <= GPS_GLITCH_WINDOW_SEC && d > GPS_GLITCH_JUMP_M) continue;
    const { sats, hdop } = getSatsHdop(curr);
    if (hdop <= MAX_HDOP && sats >= MIN_SATS) distanceMeters += d;
    const sp = getSpeedKmh(curr);
    if (sp > maxSpeedKmh) maxSpeedKmh = sp;
  }
  const startedAt = points[startIdx].gps_time ?? points[startIdx].received_at;
  const endedAt = points[endIdx].gps_time ?? points[endIdx].received_at;
  const durationSeconds = Math.round((toTs(endedAt) - toTs(startedAt)) / 1000);
  segments.push({
    points: slice,
    startIndex: startIdx,
    endIndex: endIdx,
    startedAt,
    endedAt,
    durationSeconds,
    distanceMeters: Math.round(distanceMeters),
    maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
  });
}
