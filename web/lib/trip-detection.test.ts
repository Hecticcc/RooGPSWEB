/**
 * Unit tests for trip segmentation.
 * Run from web: npx ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' -r tsconfig-paths/register lib/trip-detection.test.ts
 * Or: node --experimental-vm-modules node_modules/jest/bin/jest.js lib/trip-detection.test.ts (if Jest is added).
 */

import { segmentTrips, isUsablePoint, type LocationPoint } from './trip-detection';

function point(overrides: Partial<LocationPoint> & { id: string; received_at: string }): LocationPoint {
  return {
    id: overrides.id,
    gps_time: overrides.gps_time ?? overrides.received_at,
    received_at: overrides.received_at,
    gps_valid: overrides.gps_valid ?? true,
    latitude: overrides.latitude ?? -37.8,
    longitude: overrides.longitude ?? 145,
    speed_kph: overrides.speed_kph ?? 0,
    extra: overrides.extra ?? { signal: { gps: { sats: 6, hdop: 2, speed_kmh: 0 } } },
  };
}

function run() {
  let passed = 0;
  let failed = 0;

  function ok(cond: boolean, msg: string) {
    if (cond) {
      passed++;
      console.log('  OK:', msg);
    } else {
      failed++;
      console.error('  FAIL:', msg);
    }
  }

  console.log('Trip detection tests\n');

  const base = '2025-01-15T10:00:00.000Z';
  const min = 60 * 1000;

  const movingPoint = (i: number, speed: number) =>
    point({
      id: `p-${i}`,
      received_at: new Date(Date.parse(base) + i * 2 * min).toISOString(),
      gps_time: new Date(Date.parse(base) + i * 2 * min).toISOString(),
      latitude: -37.8 + i * 0.001,
      longitude: 145 + i * 0.001,
      speed_kph: speed,
      extra: { signal: { gps: { sats: 6, hdop: 2, speed_kmh: speed } } },
    });

  const stationaryPoint = (i: number) =>
    point({
      id: `s-${i}`,
      received_at: new Date(Date.parse(base) + i * 2 * min).toISOString(),
      gps_time: new Date(Date.parse(base) + i * 2 * min).toISOString(),
      speed_kph: 0,
      extra: { signal: { gps: { sats: 6, hdop: 2, speed_kmh: 0 } } },
    });

  const invalidPoint = (i: number) =>
    point({
      id: `v-${i}`,
      received_at: new Date(Date.parse(base) + i * 2 * min).toISOString(),
      gps_valid: false,
      latitude: -37.8,
      longitude: 145,
      extra: { signal: { gps: { sats: 0, hdop: 99, speed_kmh: 0 } } },
    });

  // 1) A trip with valid fix, sats >= 3, hdop <= 6, speed > 3
  const movingSequence = [
    movingPoint(0, 5),
    movingPoint(1, 10),
    movingPoint(2, 15),
    movingPoint(3, 20),
    movingPoint(4, 10),
  ];
  const segments1 = segmentTrips(movingSequence);
  ok(segments1.length >= 1, 'Moving sequence produces at least one trip');
  ok(
    segments1[0].durationSeconds >= 120 || segments1[0].distanceMeters >= 300,
    'Trip meets min duration or distance threshold'
  );

  // 2) Stationary points should not create a trip
  const stationaryOnly = [stationaryPoint(0), stationaryPoint(1), stationaryPoint(2)];
  const segments2 = segmentTrips(stationaryOnly);
  ok(segments2.length === 0, 'Stationary-only points produce no trip');

  // 3) A sequence with a 30-minute gap ends a trip
  const withGap = [
    movingPoint(0, 10),
    movingPoint(1, 15),
    movingPoint(2, 12),
    movingPoint(3, 0),
    movingPoint(4, 0),
    movingPoint(5, 0),
    point({
      id: 'gap',
      received_at: new Date(Date.parse(base) + 35 * min).toISOString(),
      gps_time: new Date(Date.parse(base) + 35 * min).toISOString(),
      latitude: -37.81,
      longitude: 145.01,
      speed_kph: 10,
      extra: { signal: { gps: { sats: 6, hdop: 2, speed_kmh: 10 } } },
    }),
  ];
  const segments3 = segmentTrips(withGap);
  ok(segments3.length >= 1, 'Sequence with gap produces segments (trip ends at gap)');

  // 4) isUsablePoint: valid fix, sats >= 3, hdop in (0, 6]
  ok(isUsablePoint(movingPoint(0, 5)), 'Usable: valid fix, sats 6, hdop 2');
  ok(!isUsablePoint(invalidPoint(0)), 'Not usable: gps_valid false');
  ok(
    !isUsablePoint(
      point({
        id: 'x',
        received_at: base,
        extra: { signal: { gps: { sats: 2, hdop: 2, speed_kmh: 5 } } },
      })
    ),
    'Not usable: sats < 3'
  );

  console.log('\n---');
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

run();
