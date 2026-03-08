/**
 * Tests for packet type 133 decoder (RG-WF1 / VT-style).
 * Run: npm test
 */
process.env.DEVICE_TIMEZONE = 'Australia/Melbourne';

import {
  decodePacket133,
  parsePacket133Line,
  parseAnalogBlock,
  parseVoltageBlock,
  parseIstartekHeader,
  decodeStatusFlags,
  decodeSystemStatus,
  interpretTelemetryByModel,
  normalizeRgWf1Telemetry,
  estimateBackupBatteryPercent,
} from './packet-133';

function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

// Fixtures from requirements
const FIXTURE_NORMAL =
  '&&:133,868373079971794,000,0,,260308035512,A,-38.058221,145.254826,24,0.6,0,4,37,5,505|2|D070|014BD032,24,003D,00,00,052B|0163|0000|0000,1,F9';
const FIXTURE_EQUALS =
  '&&=133,868373079971794,000,0,,260308065927,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,22,003D,00,00,052E|0192|0000|0000,1,1B';
const FIXTURE_C =
  '&&C133,868373079971794,000,0,,260308055126,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,22,003D,00,00,052B|0179|0000|0000,1,19';
const FIXTURE_B =
  '&&B133,868373079971794,000,0,,260308055116,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,22,003D,00,00,052E|0179|0000|0000,1,1A';
const FIXTURE_A =
  '&&A133,868373079971794,000,0,,260308055106,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,22,003D,00,00,052B|0179|0000|0000,1,15';

// Exact samples from protocol (speed=0, satellites=24, voltage block 052B|0194 etc.)
const FIXTURE_V =
  '&&V133,868373079971794,000,0,,260308070337,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,21,003D,00,00,052B|0194|0000|0000,1,29';
const FIXTURE_U =
  '&&U133,868373079971794,000,0,,260308070327,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,20,003D,00,00,052E|0194|0000|0000,1,29';
const FIXTURE_T =
  '&&T133,868373079971794,000,0,,260308070317,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,20,003D,00,00,0529|0194|0000|0000,1,1B';
const FIXTURE_S =
  '&&S133,868373079971794,000,0,,260308070307,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,22,003D,00,00,052E|0194|0000|0000,1,27';

// --- Header: packNo + packetLength (per iStartek protocol) ---
const h = parseIstartekHeader('&&V133,868373079971794,000,0,,260308070337,A,-38.058156,145.254798,24,0.7,0,4,41,9,505|2|D070|014BD032,21,003D,00,00,052B|0194|0000|0000,1,29');
ok(h != null && h.packetNo === 'V' && h.packetLength === 133 && h.packetHeader === '&&V133', 'parseIstartekHeader &&V133');
ok(parseIstartekHeader('&&:122,xxx') === null, 'header 122 returns null (only 133 accepted)');

// --- Prefix / priority ---
const dNormal = decodePacket133(FIXTURE_NORMAL);
ok(dNormal != null, 'decodePacket133 normal');
ok(dNormal!.packetType === '133', 'packetType 133');
ok(dNormal!.packetHeader === '&&:133', 'packetHeader');
ok(dNormal!.packetNo === ':', 'packetNo colon');
ok(dNormal!.packetLength === 133, 'packetLength 133');
ok(dNormal!.commandCode === '000', 'commandCode 000');
ok(dNormal!.packetPriority === 'normal', 'priority normal');

const dEquals = decodePacket133(FIXTURE_EQUALS);
ok(dEquals != null, 'decodePacket133 &&=133');
ok(dEquals!.packetNo === '=', 'packetNo equals');
ok(dEquals!.packetPriority === 'normal', '&&=133 maps to priority normal');
ok(dEquals!.rawAnalogBlock === '052E|0192|0000|0000', '&&=133 analog block');

const dC = decodePacket133(FIXTURE_C);
ok(dC != null && dC.packetNo === 'C' && dC.packetPriority === 'C', 'priority C');
const dB = decodePacket133(FIXTURE_B);
ok(dB != null && dB.packetNo === 'B' && dB.packetPriority === 'B', 'priority B');
const dA = decodePacket133(FIXTURE_A);
ok(dA != null && dA.packetNo === 'A' && dA.packetPriority === 'A', 'priority A');

// --- Base fields (correct iStartek order: satQuantity=8, hdop=9, speed=10, course=11, altitude=12, ...) ---
ok(dNormal!.imei === '868373079971794', 'imei');
ok(dNormal!.timestamp != null && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dNormal!.timestamp), 'timestamp ISO');
ok(dNormal!.gpsValid === true, 'gpsValid A');
ok(dNormal!.latitude === -38.058221, 'latitude');
ok(dNormal!.longitude === 145.254826, 'longitude');
ok(dNormal!.satQuantity === 24, 'satQuantity 24 (not speed)');
ok(dNormal!.hdop === 0.6, 'hdop 0.6');
ok(dNormal!.speedKph === 0, 'speedKph 0 (was wrongly 24)');
ok(dNormal!.courseDeg === 4, 'courseDeg 4');
ok(dNormal!.csq === 24, 'csq 24');
ok(dNormal!.rawStatusFlags === '003D', 'rawStatusFlags');
ok(dNormal!.rawAnalogBlock === '052B|0163|0000|0000', 'rawAnalogBlock');
ok(dNormal!.rawAlarmCode === '0', 'rawAlarmCode alarm code field');
ok(dNormal!.checksum === 'F9', 'checksum');

// --- Malformed ---
ok(decodePacket133('') === null, 'empty null');
ok(decodePacket133('&&:122,xxx') === null, 'non-133 null');
ok(decodePacket133('&&:133,short') === null, 'too few tokens null');
ok(decodePacket133('&&:133,not_an_imei_12_digits,000,0,,260308035512,A,-38,145,24,0.6,0,4,37,5,cell,24,003D,00,00,052B|0163|0000|0000,1,F9') === null, 'invalid imei null');

// --- V/U/T/S packet assertions (per protocol) ---
for (const [name, fixture, expectedPackNo] of [
  ['V', FIXTURE_V, 'V'],
  ['U', FIXTURE_U, 'U'],
  ['T', FIXTURE_T, 'T'],
  ['S', FIXTURE_S, 'S'],
] as const) {
  const d = decodePacket133(fixture);
  ok(d != null, `decode ${name}`);
  ok(d!.packetNo === expectedPackNo, `${name} packetNo`);
  ok(d!.packetLength === 133, `${name} packetLength 133`);
  ok(d!.commandCode === '000', `${name} commandCode 000`);
  ok(d!.speedKph === 0, `${name} speedKph 0`);
  ok(d!.satQuantity === 24, `${name} satellites 24`);
  ok(d!.hdop === 0.7, `${name} hdop 0.7`);
  const norm = d && normalizeRgWf1Telemetry(d);
  ok(norm != null, `${name} normalizeRgWf1Telemetry`);
  ok(norm!.externalPowerVoltage != null && norm!.externalPowerVoltage > 10, `${name} externalPowerVoltage`);
  ok(norm!.backupBatteryVoltage != null && norm!.backupBatteryVoltage > 3, `${name} backupBatteryVoltage`);
  ok(norm!.externalPowerConnected === true, `${name} externalPowerConnected from 003D`);
  ok(norm!.stopped === true, `${name} stopped from 003D`);
}

// --- System status decode (003D = 61: bits 0,1,2,3,4,5 set => stopped, external power, gps valid, etc.) ---
const sysSta = decodeSystemStatus('003D');
ok(sysSta != null, 'decodeSystemStatus');
ok(sysSta!.raw === '003D' && sysSta!.numeric === 61, '003D numeric 61');
ok(sysSta!.externalPowerConnected === true, '003D bit3 external power');
ok(sysSta!.gpsValidBit === true, '003D bit2 GPS valid');
ok(sysSta!.stopped === true, '003D bit5 stopped');

// --- Status flags (legacy) ---
const status = decodeStatusFlags('003D', 'RG_WF1');
ok(status != null, 'decodeStatusFlags');
ok(status!.raw === '003D', 'status raw');
ok(status!.decimal === 61, '003D decimal 61');
ok(status!.binary.length <= 16, 'status binary');

// --- Voltage block (hex/100) ---
const vb = parseVoltageBlock('052B|0194|0000|0000');
ok(vb != null, 'parseVoltageBlock');
ok(vb!.externalPowerRaw === '052B' && vb!.backupBatteryRaw === '0194', 'voltage block raw');
ok(vb!.externalPowerVoltage === 13.23, '052B => 13.23V');
ok(vb!.backupBatteryVoltage === 4.04, '0194 => 4.04V');
ok(parseVoltageBlock('') === null, 'voltage block empty null');

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
