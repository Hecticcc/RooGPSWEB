import { getBatteryStatus } from '../battery';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
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

  console.log('Battery status tests\n');

  const s415 = getBatteryStatus({ voltage_v: 4.15 });
  ok(s415.tier === 'high', 'voltage 4.15 => high');
  ok(s415.ringValue === 100, 'voltage 4.15 => ring 100');

  const s390 = getBatteryStatus({ voltage_v: 3.9 });
  ok(s390.tier === 'medium', 'voltage 3.90 => medium');
  ok(s390.ringValue === 70, 'voltage 3.90 => ring 70');

  const s370 = getBatteryStatus({ voltage_v: 3.7 });
  ok(s370.tier === 'low', 'voltage 3.70 => low');
  ok(s370.ringValue === 40, 'voltage 3.70 => ring 40');

  const s345 = getBatteryStatus({ voltage_v: 3.45 });
  ok(s345.tier === 'very_low', 'voltage 3.45 => very_low');
  ok(s345.ringValue === 15, 'voltage 3.45 => ring 15');

  const missing = getBatteryStatus({});
  ok(missing.tier === 'unknown', 'missing => unknown');
  ok(missing.ringValue === 0, 'missing => ring 0');

  const percentOnly = getBatteryStatus({ percent: 55 });
  ok(percentOnly.tier === 'medium', 'percent 55 (no voltage) => medium');
  ok(percentOnly.approxPercent === 55, 'percent fallback: approxPercent preserved');

  const percentLow = getBatteryStatus({ percent: 15 });
  ok(percentLow.tier === 'very_low', 'percent 15 => very_low');

  const approxFromVoltage = getBatteryStatus({ voltage_v: 4.0 });
  ok(approxFromVoltage.approxPercent === 80, 'voltage 4.0 => approx 80% from curve');

  const approxFromVoltage37 = getBatteryStatus({ voltage_v: 3.7 });
  ok(approxFromVoltage37.approxPercent === 50, 'voltage 3.7 => approx 50% from curve');

  const withBoth = getBatteryStatus({ voltage_v: 3.85, percent: 72 });
  ok(withBoth.tier === 'medium', 'prefer voltage for tier when both present');
  ok(withBoth.approxPercent === 72, 'when both present, use percent for approxPercent');

  const unknownPercent = getBatteryStatus({ voltage_v: 3.9 });
  ok(unknownPercent.approxPercent != null && unknownPercent.approxPercent >= 65 && unknownPercent.approxPercent <= 75, 'approx percent derived from voltage when percent missing');

  console.log('\n---');
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

run();
