/**
 * Unit test for iStartek PT60-L parser (Protocol v2.2 battery from tailToken ext-V|bat-V).
 * Run: npm test
 */
process.env.DEVICE_TIMEZONE = 'Australia/Melbourne';
import { parseIStartekLine, parsePT60Line, computeSatelliteConnectivity } from './parser';
import type { SignalExtra } from './parser';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

// --- Position-based signal (cmd 000/010/020) Sample A: valid fix, sats 6, hdop 4.4, csq 20 ---
const SAMPLE_A =
  '&&:122,866069069149704,000,0,,260227075105,A,-38.093690,145.175548,6,4.4,0,0,14,5260,505|2|D070|0152CF42,20,0014,00,00,0002|01A43E';

// --- Position-based Sample B: invalid fix, sats 0, hdop 0.0, csq 15 ---
const SAMPLE_B =
  '&&:120,867747070319866,000,0,,260225100251,V,-38.093730,145.175573,0,0.0,0,0,0,745,505|1|30A5|081A1F02,15,0010,00,00,0000|019DD2';

// tailToken "0000|019AE4" => batV_hex=019A => 0x019A=410 => 4.10V => 90%
const SAMPLE_019A =
  '&&:120,867747070319866,000,0,,260224044557,V,-38.093638,145.175618,0,0.0,0,0,0,736,505|1|30A5|081A1F02,14,0010,00,00,0000|019AE4';

// tailToken "0000|019806" => batV_hex=0198 => 0x0198=408 => 4.08V => ~88% (interpolated between 4.1->90 and 4.0->80)
const SAMPLE_0198 =
  '&&:121,867747070319866,000,0,,260225064618,V,-38.093236,145.175665,0,0.0,0,0,0,1083,505|1|30A5|081A1F02,15,0010,00,00,0000|019806';

// tailToken "0000|01A0E6" => batV_hex=01A0 => 0x01A0=416 => 4.16V => ~96% (interpolated between 4.2->100 and 4.1->90)
const SAMPLE_01A0 =
  '&&:120,867747070319866,000,0,,260225103127,V,-38.093730,145.175573,0,0.0,0,0,0,745,505|1|30BB|08349E0D,23,0010,00,00,0000|01A0E6';

const p1 = parseIStartekLine(SAMPLE_019A);
assert(p1.deviceId === '867747070319866', `deviceId: ${p1.deviceId}`);
assert(p1.gpsTimeUtc === '2024-02-26T04:45:57.000Z', `gpsTimeUtc: ${p1.gpsTimeUtc}`);
assert(
  Boolean(p1.gpsTimeLocal === '2024-02-26T15:45:57.000+11:00' || p1.gpsTimeLocal?.startsWith('2024-02-26T15:45:57')),
  `gpsTimeLocal: ${p1.gpsTimeLocal}`
);
assert(p1.latitude === -38.093638, `latitude: ${p1.latitude}`);
assert(p1.longitude === 145.175618, `longitude: ${p1.longitude}`);
assert(p1.batteryVoltageV === 4.1, `batteryVoltageV: ${p1.batteryVoltageV} (expect 4.10)`);
assert(p1.batteryPercent === 90, `batteryPercent: ${p1.batteryPercent} (expect 90)`);
assert(p1.packetLength === 120, `packetLength: ${p1.packetLength}`);
const power1 = p1.extra.power as { bat_hex?: string; source?: string };
assert(power1?.bat_hex === '019A', `extra.power.bat_hex: ${power1?.bat_hex}`);
assert((p1.extra.battery as { curve?: string })?.curve === 'pt60_curve_v1', 'extra.battery.curve');

const p2 = parseIStartekLine(SAMPLE_0198);
assert(p2.batteryVoltageV === 4.08, `batteryVoltageV: ${p2.batteryVoltageV} (expect 4.08)`);
assert(
  p2.batteryPercent !== null && p2.batteryPercent >= 87 && p2.batteryPercent <= 89,
  `batteryPercent: ${p2.batteryPercent} (expect ~88 ±1)`
);
assert((p2.extra.power as { bat_hex?: string })?.bat_hex === '0198', 'extra.power.bat_hex 0198');

const p3 = parseIStartekLine(SAMPLE_01A0);
assert(p3.batteryVoltageV === 4.16, `batteryVoltageV: ${p3.batteryVoltageV} (expect 4.16)`);
assert(
  p3.batteryPercent !== null && p3.batteryPercent >= 95 && p3.batteryPercent <= 97,
  `batteryPercent: ${p3.batteryPercent} (expect ~96 ±1)`
);
assert((p3.extra.power as { bat_hex?: string })?.bat_hex === '01A0', 'extra.power.bat_hex 01A0');

// --- Position-based (Protocol v2.2) Sample A ---
const pa = parseIStartekLine(SAMPLE_A);
const signalA = pa.extra.signal as SignalExtra | undefined;
assert(signalA != null, 'Sample A must have extra.signal');
assert(signalA!.gps.valid === true, `Sample A valid fix: ${signalA!.gps.valid}`);
assert(signalA!.gps.sats === 6, `Sample A sats: ${signalA!.gps.sats}`);
assert(signalA!.gps.hdop === 4.4, `Sample A hdop: ${signalA!.gps.hdop}`);
assert(signalA!.gsm.csq === 20, `Sample A csq: ${signalA!.gsm.csq}`);
assert(pa.latitude === -38.09369, `Sample A latitude: ${pa.latitude}`);
assert(pa.longitude === 145.175548, `Sample A longitude: ${pa.longitude}`);
assert(pa.speedKph === 0, `Sample A speed must be 0 (from position 10): ${pa.speedKph}`);
assert(signalA!.gps.has_signal === true, `Sample A has_signal: ${signalA!.gps.has_signal}`);

// --- Position-based Sample B ---
const pb = parseIStartekLine(SAMPLE_B);
const signalB = pb.extra.signal as SignalExtra | undefined;
assert(signalB != null, 'Sample B must have extra.signal');
assert(signalB!.gps.valid === false, `Sample B valid fix: ${signalB!.gps.valid}`);
assert(signalB!.gps.sats === 0, `Sample B sats: ${signalB!.gps.sats}`);
assert(signalB!.gps.hdop === 0.0, `Sample B hdop: ${signalB!.gps.hdop}`);
assert(signalB!.gsm.csq === 15, `Sample B csq: ${signalB!.gsm.csq}`);
assert(signalB!.gps.has_signal === false, `Sample B has_signal: ${signalB!.gps.has_signal}`);

// sats is NOT parsed from speed and speed is NOT parsed as sats
assert(Boolean(signalA && signalA.gps.sats === 6), 'sats must be 6 from position 8');
assert(Boolean(signalB && signalB.gps.sats === 0), 'sats must be 0 from position 8');
const ptA = parsePT60Line(SAMPLE_A);
assert(ptA != null && ptA.extra?.signal != null, 'parsePT60Line Sample A must have extra.signal');
assert((ptA!.extra!.signal as SignalExtra).gps.sats === 6, 'PT60 sats 6');

// --- Satellite connectivity (HDOP + sats) ---
assert(signalA?.gps.connectivity != null, 'Sample A must have gps.connectivity');
assert(signalA!.gps.connectivity!.sats === 6 && signalA!.gps.connectivity!.hdop === 4.4, 'Sample A connectivity sats/hdop');
assert(signalB?.gps.connectivity != null, 'Sample B must have gps.connectivity');
assert(signalB!.gps.connectivity!.barPercent === 0 && signalB!.gps.connectivity!.tier === 'poor', 'Sample B invalid fix -> 0% poor');

// 1) sats=8, hdop=1.2 -> barPercent ~80+, tier good, green
const c1 = computeSatelliteConnectivity(true, 8, 1.2);
assert(c1.barPercent >= 80, `sats=8 hdop=1.2 barPercent >= 80: ${c1.barPercent}`);
assert(c1.tier === 'good', `sats=8 hdop=1.2 tier good: ${c1.tier}`);

// 2) sats=6, hdop=4.5 -> satelliteScore 60, modifier 0.6 -> ~36%, tier weak, orange
const c2 = computeSatelliteConnectivity(true, 6, 4.5);
assert(c2.barPercent >= 35 && c2.barPercent <= 38, `sats=6 hdop=4.5 barPercent ~36: ${c2.barPercent}`);
assert(c2.tier === 'weak', `sats=6 hdop=4.5 tier weak: ${c2.tier}`);

// 3) sats=10, hdop=6.5 -> 100 * 0.4 = 40%, tier weak
const c3 = computeSatelliteConnectivity(true, 10, 6.5);
assert(c3.barPercent === 40, `sats=10 hdop=6.5 barPercent 40: ${c3.barPercent}`);
assert(c3.tier === 'weak', `sats=10 hdop=6.5 tier weak: ${c3.tier}`);

// 4) fix invalid -> barPercent 0, red (poor)
const c4 = computeSatelliteConnectivity(false, 5, 2.0);
assert(c4.barPercent === 0 && c4.tier === 'poor', `fix invalid -> 0 poor: ${c4.barPercent} ${c4.tier}`);

// Ford Ranger-style: optional empty token at 4, time at 5, fix at 6 (alternate layout)
const FORD_RANGER_STYLE =
  '&&h126,866069069149704,000,23,,260310032517,A,-38.093815,145.175653,15,0.7,0,41,24,21918,505|2|D070|0152CF0A,18,0037,00,00,0003|01A24D';
const pFord = parseIStartekLine(FORD_RANGER_STYLE);
const signalFord = pFord.extra.signal as SignalExtra | undefined;
assert(signalFord != null, 'Ford Ranger-style packet must have extra.signal (alternate layout)');
assert(pFord.gpsValid === true, 'Ford Ranger gps_valid from fix A');
assert(pFord.latitude === -38.093815 && pFord.longitude === 145.175653, 'Ford Ranger lat/lon');
assert(signalFord!.gps.valid === true && signalFord!.gps.has_signal === true, 'Ford Ranger signal.gps valid');
assert(signalFord!.gps.sats === 20, 'Ford Ranger sats (41 clamped to 20)');
assert(signalFord!.gps.hdop === 24, 'Ford Ranger hdop 24');
assert(signalFord!.gsm.csq === 18, 'Ford Ranger CSQ from token 16');

console.log('All parser tests passed.');
console.log(
  JSON.stringify(
    {
      '019A': { batteryVoltageV: p1.batteryVoltageV, batteryPercent: p1.batteryPercent, bat_hex: power1?.bat_hex },
      '0198': { batteryVoltageV: p2.batteryVoltageV, batteryPercent: p2.batteryPercent },
      '01A0': { batteryVoltageV: p3.batteryVoltageV, batteryPercent: p3.batteryPercent },
    },
    null,
    2
  )
);
