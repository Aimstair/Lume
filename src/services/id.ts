export function newId(prefix = '') {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}${ts}${rand}`;
}

function formatUuidFromBytes(bytes: Uint8Array) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function newUuid() {
  const globalCrypto = (globalThis as unknown as { crypto?: { randomUUID?: () => string; getRandomValues?: (arr: Uint8Array) => Uint8Array } }).crypto;

  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (globalCrypto?.getRandomValues) {
    globalCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  // RFC4122 v4 marker bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuidFromBytes(bytes);
}
