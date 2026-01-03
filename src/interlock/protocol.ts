/**
 * InterLock Protocol - BaNano Encoding/Decoding
 * Binary format for mesh communication
 */

import { Signal, SignalTypes } from '../types.js';

/**
 * Encode a signal into BaNano binary format
 * Format: [code:1][sender_len:1][sender:N][timestamp:8][data_len:4][data:M]
 */
export function encodeSignal(signal: Signal): Buffer {
  const senderBuffer = Buffer.from(signal.sender, 'utf8');
  const dataBuffer = signal.data
    ? Buffer.from(JSON.stringify(signal.data), 'utf8')
    : Buffer.alloc(0);

  const totalLength = 1 + 1 + senderBuffer.length + 8 + 4 + dataBuffer.length;
  const buffer = Buffer.alloc(totalLength);

  let offset = 0;

  // Signal code (1 byte)
  buffer.writeUInt8(signal.code, offset);
  offset += 1;

  // Sender length (1 byte)
  buffer.writeUInt8(senderBuffer.length, offset);
  offset += 1;

  // Sender string
  senderBuffer.copy(buffer, offset);
  offset += senderBuffer.length;

  // Timestamp (8 bytes, big endian)
  buffer.writeBigUInt64BE(BigInt(signal.timestamp), offset);
  offset += 8;

  // Data length (4 bytes)
  buffer.writeUInt32BE(dataBuffer.length, offset);
  offset += 4;

  // Data payload
  if (dataBuffer.length > 0) {
    dataBuffer.copy(buffer, offset);
  }

  return buffer;
}

/**
 * Decode a signal from BaNano binary format
 */
export function decodeSignal(buffer: Buffer): Signal {
  let offset = 0;

  // Signal code (1 byte)
  const code = buffer.readUInt8(offset);
  offset += 1;

  // Sender length (1 byte)
  const senderLen = buffer.readUInt8(offset);
  offset += 1;

  // Sender string
  const sender = buffer.slice(offset, offset + senderLen).toString('utf8');
  offset += senderLen;

  // Timestamp (8 bytes)
  const timestamp = Number(buffer.readBigUInt64BE(offset));
  offset += 8;

  // Data length (4 bytes)
  const dataLen = buffer.readUInt32BE(offset);
  offset += 4;

  // Data payload
  let data: Record<string, unknown> | undefined;
  if (dataLen > 0) {
    const dataStr = buffer.slice(offset, offset + dataLen).toString('utf8');
    try {
      data = JSON.parse(dataStr);
    } catch {
      data = { raw: dataStr };
    }
  }

  // Find signal name
  const name = getSignalName(code);

  return { code, name, sender, timestamp, data };
}

/**
 * Get signal name from code
 */
export function getSignalName(code: number): string {
  for (const [name, signalCode] of Object.entries(SignalTypes)) {
    if (signalCode === code) {
      return name;
    }
  }
  return `UNKNOWN_${code.toString(16).toUpperCase()}`;
}

/**
 * Get signal code from name
 */
export function getSignalCode(name: string): number | undefined {
  return (SignalTypes as Record<string, number>)[name];
}

/**
 * Create a signal object
 */
export function createSignal(
  code: number,
  sender: string,
  data?: Record<string, unknown>
): Signal {
  return {
    code,
    name: getSignalName(code),
    sender,
    timestamp: Date.now(),
    data
  };
}
