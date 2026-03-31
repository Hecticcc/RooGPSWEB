/**
 * Trip detection from location points (iStartek/PT60 GPRS event data).
 * Usable point = valid fix, sats >= 3, hdop in (0, 6], non-zero lat/lon.
 * Trip start/end and distance rules per spec; distance via Haversine (odometer optional later).
 */

/** Speed (km/h) to count as "moving" for trip start with previous point. */
const TRIP_START_SPEED_KMH = 3;
/** Single-point trip start: one point at this speed or above starts a new trip (e.g. first movement after 15 min stop). */
const TRIP_START_SPEED_STRONG_KMH = 5;
/** After this many minutes stationary (since last moving point), end the trip. Next movement starts a new trip. */
const TRIP_END_STATIONARY_MINUTES = 15;
/** Speed below this is treated as stationary (stops resetting "last moving" so 15 min of low speed ends the trip). */
const TRIP_END_SPEED_KMH = 3;

/** Speed (km/h) below which we consider the vehicle stopped for "end position" (where the car is parked). */
const STOPPED_SPEED_KMH = 3;
const TRIP_END_GAP_MINUTES = 20;
/** Max gap (min) between points to treat as same window for trip start; 15 allows ~10 min ping interval. */
const CONSECUTIVE_POINTS_WINDOW_MINUTES = 15;
const MIN_SEGMENT_DISTANCE_M = 30;
/** Ignore small moves with low speed (GPS drift); raise so ~20–30 m jitter doesn’t extend trip. */
const JITTER_DISTANCE_M = 35;
const JITTER_SPEED_KMH = 3;
const GPS_GLITCH_JUMP_M = 2000;
const GPS_GLITCH_WINDOW_SEC = 30;
const MIN_HDOP = 0;
const MAX_HDOP = 6;
const MIN_SATS = 3;
/** Keep segments that are at least this long or this far (so 30 min drive with 2–3 points qualifies). */
const MIN_TRIP_DURATION_SEC = 120;
/** Minimum distance (m) to count as a real trip; filters out drift (e.g. 0.1–0.3 km in one place). */
const MIN_TRIP_DISTANCE_M = 400;
/** Reject segments with very low average speed (GPS drift: e.g. 0.3 km in 90 min). */
const MIN_AVG_SPEED_KMH = 5;
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
  // Treat null/undefined gps_valid as valid when we have coords (ingest may not set the column)
  const assumeValid = p.gps_valid !== false;
  return { sats: assumeValid ? 4 : 0, hdop: assumeValid ? 3 : 99 };
}

export function isUsablePoint(p: LocationPoint): boolean {
  if (p.gps_valid === false) return false;
  if (p.latitude == null || p.longitude == null) return false;
  if (p.latitude === 0 && p.longitude === 0) return false;
  // If gps_valid is explicitly true, trust the device's own fix validity judgement
  // (some devices, e.g. iStartek packet-133, report HDOP in a non-standard scale)
  if (p.gps_valid === true) return true;
  // For points without explicit gps_valid, apply the sats/hdop quality filter
  const { sats, hdop } = getSatsHdop(p);
  return sats >= MIN_SATS && hdop > MIN_HDOP && hdop <= MAX_HDOP;
}

export function getSpeedKmh(p: LocationPoint): number {
  const v = p.speed_kph ?? (p.extra?.signal as { gps?: { speed_kmh?: number } } | undefined)?.gps?.speed_kmh;
  return typeof v === 'number' && !Number.isNaN(v) ? Math.min(MAX_SPEED_KMH_CAP, v) : 0;
}

/**
 * Returns the best point to use for trip end position (where the car stopped).
 * Prefers the last consecutive stationary point after the segment (so two or more pings at rest
 * give a more reliable "parked" position); if none, the segment's last point.
 */
export function getSegmentEndPointForPosition(segment: TripSegment, allPoints: LocationPoint[]): LocationPoint {
  const lastInSegment = segment.points[segment.points.length - 1];
  let best: LocationPoint | null = null;
  for (let i = segment.endIndex + 1; i < allPoints.length; i++) {
    const p = allPoints[i];
    if (!isUsablePoint(p)) break;
    if (getSpeedKmh(p) >= STOPPED_SPEED_KMH) break;
    best = p;
  }
  return best ?? lastInSegment;
}

/** Effective speed: max of device-reported speed and GPS-derived speed (distance÷time).
 * Always derives from distance/time so max_speed_kmh reflects actual movement,
 * even when the device's raw GPS speed reading underreports (e.g. 20 km/h on a freeway). */
function getEffectiveSpeedKmh(p: LocationPoint, prev: LocationPoint | null): number {
  const reported = getSpeedKmh(p);
  if (!prev?.latitude || !prev?.longitude || p.latitude == null || p.longitude == null) return reported;
  const dtSec = (toTs(pointTime(p)) - toTs(pointTime(prev))) / 1000;
  if (dtSec <= 0) return reported;
  const distM = haversineMeters(prev.latitude, prev.longitude, p.latitude, p.longitude);
  const impliedKmh = (distM / 1000) / (dtSec / 3600);
  return Math.min(MAX_SPEED_KMH_CAP, Math.max(reported, impliedKmh));
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

/** Prefer received_at (correct AU time) over device gps_time (may be wrong year). */
function pointTime(p: LocationPoint): string | null {
  return p.received_at ?? p.gps_time ?? null;
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
 * Segment ordered points (by received_at / gps_time) into trips.
 * Uses received_at (correct AU time) when available; points must be sorted ascending by time.
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
    const time = toTs(pointTime(p));

    if (!usable) {
      if (segmentStart != null) {
        const gapMin = (time - toTs(pointTime(points[lastMovingIndex!]))) / 60000;
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
      const prev = i > 0 ? points[i - 1] : null;
      const prevUsable =
        prev != null && isUsablePoint(prev) && (time - toTs(pointTime(prev))) / 60000 <= CONSECUTIVE_POINTS_WINDOW_MINUTES;
      const prevSpeed = prev != null ? getEffectiveSpeedKmh(p, prev) : 0;
      const distToPrev =
        prev != null && prev.latitude != null && prev.longitude != null
          ? haversineMeters(prev.latitude, prev.longitude, lat, lon)
          : 0;
      const effectiveSpeed = prev != null ? getEffectiveSpeedKmh(p, prev) : speed;
      const startByTwo = prevUsable && prevSpeed >= TRIP_START_SPEED_KMH && distToPrev >= MIN_SEGMENT_DISTANCE_M;
      const startByOne = effectiveSpeed >= TRIP_START_SPEED_STRONG_KMH;
      if (startByTwo || startByOne) {
        segmentStart = i;
        lastMovingIndex = i;
      }
      continue;
    }

    const prevTime = toTs(pointTime(points[lastMovingIndex!]));
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
    const effectiveSpeedHere = getEffectiveSpeedKmh(p, prev);
    const isJitter = distSegment < JITTER_DISTANCE_M && effectiveSpeedHere < JITTER_SPEED_KMH;
    if (isJitter) continue;

    if (dtSec <= GPS_GLITCH_WINDOW_SEC && distSegment > GPS_GLITCH_JUMP_M) continue;

    if (effectiveSpeedHere >= TRIP_END_SPEED_KMH) lastMovingIndex = i;

    const lastMovingTime = toTs(pointTime(points[lastMovingIndex!]));
    const sinceMovingMin = (time - lastMovingTime) / 60000;
    if (sinceMovingMin >= TRIP_END_STATIONARY_MINUTES) {
      pushSegment(segments, points, segmentStart, lastMovingIndex!);
      segmentStart = null;
      lastMovingIndex = null;
      const effectiveAfterStop = i > 0 ? getEffectiveSpeedKmh(p, points[i - 1]) : speed;
      if (effectiveAfterStop >= TRIP_START_SPEED_KMH || effectiveAfterStop >= TRIP_START_SPEED_STRONG_KMH) {
        segmentStart = i;
        lastMovingIndex = i;
      }
    }
  }

  if (segmentStart != null && lastMovingIndex != null) {
    pushSegment(segments, points, segmentStart, lastMovingIndex);
  }

  return segments.filter((s) => {
    if (s.durationSeconds < MIN_TRIP_DURATION_SEC && s.distanceMeters < MIN_TRIP_DISTANCE_M) return false;
    const avgSpeedKmh = s.durationSeconds > 0 ? (s.distanceMeters / 1000) / (s.durationSeconds / 3600) : 0;
    if (avgSpeedKmh < MIN_AVG_SPEED_KMH) return false;
    return true;
  });
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
    const dtSec = (toTs(pointTime(curr)) - toTs(pointTime(prev))) / 1000;
    const d = haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    if (dtSec <= GPS_GLITCH_WINDOW_SEC && d > GPS_GLITCH_JUMP_M) continue;
    // Only skip distance if GPS is explicitly invalid; for gps_valid=true devices with non-standard
    // HDOP (e.g. iStartek packet-133 reporting hdop~24), always count the distance.
    if (curr.gps_valid !== false) distanceMeters += d;
    const reported = getSpeedKmh(curr);
    const effective = getEffectiveSpeedKmh(curr, prev);
    const sp = Math.max(reported, effective);
    if (sp > maxSpeedKmh) maxSpeedKmh = sp;
  }
  const startedAt = pointTime(points[startIdx]) ?? points[startIdx].received_at;
  const endedAt = pointTime(points[endIdx]) ?? points[endIdx].received_at;
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
