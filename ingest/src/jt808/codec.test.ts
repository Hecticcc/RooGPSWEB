import assert from 'assert';
import {
  unescapeFrame,
  xorChecksum,
  escapeBody,
  buildHeader12,
  buildFrame,
  splitBody,
  bcd6ToDigits,
  digitsToBcd6,
} from './codec';

// Escape: 0x7e -> 7d 01
const escapedSample = Buffer.from([0x02, 0x00, 0x7d, 0x01, 0x34]);
const un = unescapeFrame(escapedSample);
assert.deepStrictEqual(Array.from(un), [0x02, 0x00, 0x7e, 0x34]);

// Roundtrip: general reply body 5 bytes
const body = Buffer.alloc(5);
body.writeUInt16BE(3, 0);
body.writeUInt16BE(0x0200, 2);
body.writeUInt8(0, 4);
const phone = '8613800138000';
const h12 = buildHeader12(0x8001, phone, 7, body.length);
const frame = buildFrame(h12, body);
assert(frame[0] === 0x7e && frame[frame.length - 1] === 0x7e);
const inner = frame.subarray(1, frame.length - 1);
const unesc = unescapeFrame(inner);
const split = splitBody(unesc);
assert(split);
assert.strictEqual(split.header.messageId, 0x8001);
assert.strictEqual(split.header.serialNumber, 7);

const buf = Buffer.alloc(6);
digitsToBcd6('861380013800', buf, 0);
assert.strictEqual(bcd6ToDigits(buf), '861380013800');

console.log('JT808 codec tests passed.');
