import { buildFrame, buildHeader12, type Jt808Header } from './codec';

const MSG_GENERAL_REPLY = 0x8001;
const MSG_REGISTER_REPLY = 0x8100;

/** Platform general response 0x8001 */
export function buildGeneralReply(
  requestHeader: Jt808Header,
  terminalPhoneDigits: string,
  result: number
): Buffer {
  const body = Buffer.alloc(5);
  body.writeUInt16BE(requestHeader.serialNumber, 0);
  body.writeUInt16BE(requestHeader.messageId, 2);
  body.writeUInt8(result & 0xff, 4);
  const serial = nextSerial();
  const header12 = buildHeader12(MSG_GENERAL_REPLY, terminalPhoneDigits, serial, body.length);
  return buildFrame(header12, body);
}

let serialCounter = 0;
function nextSerial(): number {
  serialCounter = (serialCounter + 1) & 0xffff;
  if (serialCounter === 0) serialCounter = 1;
  return serialCounter;
}

/** Registration response 0x8100: serial + result + auth code (ASCII). */
export function buildRegisterReply(
  requestHeader: Jt808Header,
  terminalPhoneDigits: string,
  authCode: string,
  result = 0
): Buffer {
  const authBuf = Buffer.from(authCode, 'ascii');
  const body = Buffer.alloc(3 + authBuf.length);
  body.writeUInt16BE(requestHeader.serialNumber, 0);
  body.writeUInt8(result & 0xff, 2);
  authBuf.copy(body, 3);
  const serial = nextSerial();
  const header12 = buildHeader12(MSG_REGISTER_REPLY, terminalPhoneDigits, serial, body.length);
  return buildFrame(header12, body);
}
