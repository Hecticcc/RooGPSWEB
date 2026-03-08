/**
 * Tests for packet type 133 decoder (RG-WF1 / VT-style).
 * Run: npm test
 */
process.env.DEVICE_TIMEZONE = 'Australia/Melbourne';

import {
  decodePacket133,
  parsePacket133Line,
  parseAnalogBlock,
  decodeStatusFlags,
  interpretTelemetryByModel,
  estimateBackupBatteryPercent,
} from './packet-133';

function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

// Fixtures from requirements
const FIXTURE_NORMAL =
  '&&:133,868373079971794,000,0,,260308035512,A,-38.058221,145.254826,24,0.6,0,4,37,5,505|2|D070|014BD032,24,003D,00,00,052B|0163|0000|0000,1,F9';
const FIXTURE_C =
  '&&C133,868373079971794,000,0,,260308055126,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,22,003D,00,00,052B|0179|0000|0000,1,19';
const FIXTURE_B =
  '&&B133,868373079971794,000,0,,260308055116,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,22,003D,00,00,052E|0179|0000|0000,1,1A';
const FIXTURE_A =
  '&&A133,868373079971794,000,0,,260308055106,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,22,003D,00,00,052B|0179|0000|0000,1,15';

// --- Prefix / priority ---
const dNormal = decodePacket133(FIXTURE_NORMAL);
ok(dNormal != null, 'decodePacket133 normal');
ok(dNormal!.packetType === '133', 'packetType 133');
ok(dNormal!.packetPriority === 'normal', 'priority normal');

const dC = decodePacket133(FIXTURE_C);
ok(dC != null && dC.packetPriority === 'C', 'priority C');
const dB = decodePacket133(FIXTURE_B);
ok(dB != null && dB.packetPriority === 'B', 'priority B');
const dA = decodePacket133(FIXTURE_A);
ok(dA != null && dA.packetPriority === 'A', 'priority A');

// --- Base fields ---
ok(dNormal!.imei === '868373079971794', 'imei');
ok(dNormal!.timestamp != null && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dNormal!.timestamp), 'timestamp ISO');
ok(dNormal!.gpsValid === true, 'gpsValid A');
ok(dNormal!.latitude === -38.058221, 'latitude');
ok(dNormal!.longitude === 145.254826, 'longitude');
ok(dNormal!.speedKph === 24, 'speedKph');
ok(dNormal!.satellites === 4, 'satellites');
ok(dNormal!.gsmSignalRaw === 37, 'gsmSignalRaw');
ok(dNormal!.rawStatusFlags === '003D', 'rawStatusFlags');
ok(dNormal!.rawAnalogBlock === '052B|0163|0000|0000', 'rawAnalogBlock');
ok(dNormal!.rawAlarmCode === '1', 'rawAlarmCode');
ok(dNormal!.checksum === 'F9', 'checksum');

// --- Malformed ---
ok(decodePacket133('') === null, 'empty null');
ok(decodePacket133('&&:122,xxx') === null, 'non-133 null');
ok(decodePacket133('&&:133,short') === null, 'too few tokens null');
ok(decodePacket133('&&:133,not_an_imei_12_digits,000,0,,260308035512,A,-38,145,24,0.6,0,4,37,5,cell,24,003D,00,00,052B|0163|0000|0000,1,F9') === null, 'invalid imei null');

// --- Status flags ---
const status = decodeStatusFlags('003D', 'RG_WF1');
ok(status != null, 'decodeStatusFlags');
ok(status!.raw === '003D', 'status raw');
ok(status!.decimal === 61, '003D decimal 61');
ok(status!.binary.length <= 16, 'status binary');

// --- Analog block ---
const analog = parseAnalogBlock('052B|0163|0000|0000');
ok(analog != null, 'parseAnalogBlock');
ok(analog!.values.length === 4, 'analog values length');
ok(analog!.parsed.externalPowerRaw === '052B', 'externalPowerRaw');
ok(analog!.parsed.backupBatteryRaw === '0163', 'backupBatteryRaw');
ok(analog!.parsed.input3Raw === '0000', 'input3Raw');
ok(analog!.parsed.input4Raw === '0000', 'input4Raw');
ok(parseAnalogBlock('') === null, 'analog empty null');
ok(parseAnalogBlock('052B|0163') === null, 'analog too few parts null');

// --- RG-WF1 interpretation ---
const interp = interpretTelemetryByModel('RG-WF1', dNormal!);
ok(interp != null, 'interpretTelemetryByModel RG-WF1');
ok(interp!.modelCode === 'RG-WF1', 'modelCode');
ok(interp!.isWired === true && interp!.hasBackupBattery === true && interp!.hasAcc === true, 'wired flags');
ok(interp!.packetPriority === 'normal', 'interpreted priority');
ok(interp!.externalPowerVoltage != null, 'externalPowerVoltage');
ok(interp!.backupBatteryVoltage != null, 'backupBatteryVoltage');
ok(interp!.backupBatteryPercent != null && interp!.backupBatteryPercent >= 0 && interp!.backupBatteryPercent <= 100, 'backupBatteryPercent 0-100');
ok(['external', 'backup_battery', 'unknown'].includes(interp!.powerSource), 'powerSource');
ok(interpretTelemetryByModel('OTHER', dNormal!) === null, 'other model null');

// --- estimateBackupBatteryPercent ---
const pct = estimateBackupBatteryPercent(3.55, '0163', 'RG-WF1');
ok(pct != null && pct >= 0 && pct <= 100, 'estimateBackupBatteryPercent');
ok(estimateBackupBatteryPercent(null, null, 'RG-WF1') === null, 'estimate null voltage');

// --- parsePacket133Line full pipeline ---
const parsed = parsePacket133Line(FIXTURE_NORMAL);
ok(parsed != null, 'parsePacket133Line');
ok(parsed!.device_id === '868373079971794', 'parsed device_id');
ok(parsed!.latitude === -38.058221 && parsed!.longitude === 145.254826, 'parsed lat/lon');
ok(parsed!.extra.packet_type_133 === true, 'extra packet_type_133');
ok(parsed!.extra.wired_power != null, 'extra wired_power');
ok(parsed!.extra.rg_wf1_telemetry != null, 'extra rg_wf1_telemetry');
const wp = parsed!.extra.wired_power as { external_power_connected?: boolean; backup_battery_percent?: number; acc_status?: string };
ok(wp.backup_battery_percent != null, 'wired_power backup_battery_percent');
ok(parsePacket133Line('&&:122,866069069149704,000,0,,260227075105,A,-38.093690,145.175548,6,4.4,0,0,14,5260,505|2|D070|0152CF42,20,0014,00,00,0002|01A43E') === null, '122 packet not 133');

console.log('All packet-133 tests passed.');
