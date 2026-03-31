import assert from 'assert';
import { parseVendorEbPowerRecords, parseLocationBody } from './location';

// GAT24 sample: EB block tail includes 0x002D (mV) + 0x00A8 (%) per vendor manual
const ebSample = Buffer.from(
  '000c00b28944538532054956374f00060089ffffffff000600c5ffffffef0004002d0f57000300a85a001100d5383638373931303838303530343031',
  'hex'
);

const vp = parseVendorEbPowerRecords(ebSample);
assert.strictEqual(vp.external_voltage_mv, 3927, 'external voltage mV');
assert.strictEqual(vp.voltage_percent, 90, 'voltage percent byte 0x5a = 90%');
assert.strictEqual(vp.imei_ascii, '868791088050401', '15-digit IMEI ASCII');

const bodySample = Buffer.from(
  '0000000000000007024543ff08a7344200250000006c26033116343601040000007930011531011deb3c' +
    '000c00b28944538532054956374f00060089ffffffff000600c5ffffffef0004002d0f57000300a85a001100d5383638373931303838303530343031',
  'hex'
);
const loc = parseLocationBody(bodySample, '91088050401', 'hex');
assert(loc);
const ex = loc!.extra as Record<string, unknown>;
assert.strictEqual(ex.battery_percent, 90);
assert.strictEqual(ex.external_voltage_mv, 3927);
assert.strictEqual(ex.external_voltage_v, 3.927);
assert.strictEqual(ex.altitude_m, 37);
assert.strictEqual(ex.mileage_raw, 121);
assert.strictEqual(ex.gsm_signal, 21);
assert.strictEqual(ex.gnss_sat_count, 29);

console.log('JT808 location tests passed.');
