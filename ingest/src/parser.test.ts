/**
 * Unit test for iStartek PT60-L parser.
 * Run: npm test
 */
process.env.DEVICE_TIMEZONE = 'Australia/Melbourne';
import { parseIStartekLine } from './parser';

const SAMPLE =
  '&&:120,867747070319866,000,0,,260224044557,V,-38.093638,145.175618,0,0.0,0,0,0,736,505|1|30A5|081A1F02,14,0010,00,00,0000|019AE4';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

const p = parseIStartekLine(SAMPLE);

assert(p.deviceId === '867747070319866', `deviceId: ${p.deviceId}`);
assert(p.msgType === '000', `msgType: ${p.msgType}`);
assert(p.eventCode === '0', `eventCode: ${p.eventCode}`);
assert(p.gpsTimeUtc === '2024-02-26T04:45:57.000Z', `gpsTimeUtc: ${p.gpsTimeUtc}`);
assert(
  Boolean(p.gpsTimeLocal === '2024-02-26T15:45:57.000+11:00' || p.gpsTimeLocal?.startsWith('2024-02-26T15:45:57')),
  `gpsTimeLocal: ${p.gpsTimeLocal} (expect AEDT +11)`
);
assert(Boolean(p.gpsValid), `gpsValid: ${String(p.gpsValid)}`);
assert(p.latitude === -38.093638, `latitude: ${p.latitude}`);
assert(p.longitude === 145.175618, `longitude: ${p.longitude}`);
assert(p.speedKph === 0, `speedKph: ${p.speedKph}`);
assert(p.courseDeg === 0, `courseDeg: ${p.courseDeg}`);
assert(p.batteryVoltageV === 3.68, `batteryVoltageV: ${p.batteryVoltageV}`);
assert(p.batteryPercent !== null && p.batteryPercent >= 44 && p.batteryPercent <= 52, `batteryPercent: ${p.batteryPercent} (expect ~46-50)`);
assert(p.packetLength === 120, `packetLength: ${p.packetLength}`);

console.log('All parser tests passed.');
console.log(JSON.stringify({ deviceId: p.deviceId, gpsTimeUtc: p.gpsTimeUtc, gpsTimeLocal: p.gpsTimeLocal, batteryVoltageV: p.batteryVoltageV, batteryPercent: p.batteryPercent }, null, 2));
