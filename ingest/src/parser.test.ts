/**
 * Unit test for iStartek PT60-L parser (Protocol v2.2 battery from tailToken ext-V|bat-V).
 * Run: npm test
 */
process.env.DEVICE_TIMEZONE = 'Australia/Melbourne';
import { parseIStartekLine } from './parser';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

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
