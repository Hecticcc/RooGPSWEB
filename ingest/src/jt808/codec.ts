/** JT/T 808 style framing: 0x7E … 0x7E, XOR checksum, 0x7D escape. */

export function unescapeFrame(raw: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 0x7d && i + 1 < raw.length) {
      if (raw[i + 1] === 0x01) {
        out.push(0x7e);
        i++;
      } else if (raw[i + 1] === 0x02) {
        out.push(0x7d);
        i++;
      } else {
        out.push(raw[i]);
      }
    } else {
      out.push(raw[i]);
    }
  }
  return Buffer.from(out);
}

export function xorChecksum(buf: Buffer, start: number, endExclusive: number): number {
  let cs = 0;
  for (let i = start; i < endExclusive; i++) cs ^= buf[i];
  return cs & 0xff;
}

export function escapeBody(buf: Buffer): Buffer {
  const chunks: Buffer[] = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x7e) chunks.push(Buffer.from([0x7d, 0x01]));
    else if (b === 0x7d) chunks.push(Buffer.from([0x7d, 0x02]));
    else chunks.push(Buffer.from([b]));
  }
  return Buffer.concat(chunks);
}

export type Jt808Header = {
  messageId: number;
  bodyProps: number;
  bodyLength: number;
  terminalPhone: string;
  serialNumber: number;
};

const HEADER_LEN = 12;

export function parseHeader(buf: Buffer): Jt808Header | null {
  if (buf.length < HEADER_LEN) return null;
  const messageId = buf.readUInt16BE(0);
  const bodyProps = buf.readUInt16BE(2);
  const bodyLength = bodyProps & 0x3ff;
  const phoneRaw = buf.subarray(4, 10);
  const terminalPhone = bcd6ToDigits(phoneRaw);
  const serialNumber = buf.readUInt16BE(10);
  return { messageId, bodyProps, bodyLength, terminalPhone, serialNumber };
}

/** 6-byte BCD → up to 12 decimal digits (leading zeros kept for IMEI-style IDs). */
export function bcd6ToDigits(buf: Buffer): string {
  let s = '';
  for (let i = 0; i < 6; i++) {
    const b = buf[i] ?? 0;
    s += String((b >> 4) & 0x0f) + String(b & 0x0f);
  }
  return s.replace(/^0+/, '') || '0';
}

export function verifyFrame(unescaped: Buffer): boolean {
  if (unescaped.length < HEADER_LEN + 1) return false;
  const h = parseHeader(unescaped);
  if (!h) return false;
  const expectedLen = HEADER_LEN + h.bodyLength + 1;
  if (unescaped.length !== expectedLen) return false;
  const cs = xorChecksum(unescaped, 0, HEADER_LEN + h.bodyLength);
  return cs === unescaped[HEADER_LEN + h.bodyLength];
}

export function splitBody(unescaped: Buffer): { header: Jt808Header; body: Buffer } | null {
  if (!verifyFrame(unescaped)) return null;
  const h = parseHeader(unescaped);
  if (!h) return null;
  const body = unescaped.subarray(HEADER_LEN, HEADER_LEN + h.bodyLength);
  return { header: h, body };
}

/** 12-byte header only; `bodyLength` must match actual body buffer length. */
export function buildHeader12(messageId: number, terminalPhoneDigits: string, serialNumber: number, bodyLength: number): Buffer {
  if (bodyLength > 0x3ff) throw new Error('JT808 body too large');
  const bodyProps = bodyLength & 0x3ff;
  const header = Buffer.alloc(12);
  header.writeUInt16BE(messageId, 0);
  header.writeUInt16BE(bodyProps, 2);
  digitsToBcd6(terminalPhoneDigits, header, 4);
  header.writeUInt16BE(serialNumber & 0xffff, 10);
  return header;
}

/**
 * Build a full JT808 frame: checksum XOR over header+body, then escape, 0x7E … 0x7E.
 */
export function buildFrame(header12: Buffer, body: Buffer): Buffer {
  const payload = Buffer.concat([header12, body]);
  const checksum = xorChecksum(payload, 0, payload.length);
  const withCs = Buffer.concat([payload, Buffer.from([checksum])]);
  const escaped = escapeBody(withCs);
  return Buffer.concat([Buffer.from([0x7e]), escaped, Buffer.from([0x7e])]);
}

export function digitsToBcd6(digits: string, out: Buffer, offset: number) {
  const padded = digits.padStart(12, '0').slice(-12);
  for (let i = 0; i < 6; i++) {
    const hi = parseInt(padded[i * 2] ?? '0', 10);
    const lo = parseInt(padded[i * 2 + 1] ?? '0', 10);
    out[offset + i] = ((hi & 0x0f) << 4) | (lo & 0x0f);
  }
}
