// Minimal raw CBOR walker: reads top-level map keys of a transaction's parts without trusting a full parser.
// Used to allow-list transaction body / witness set keys and to detect duplicate keys.

interface Head {
  major: number;
  /** argument value, or -1 for indefinite length */
  value: number;
  offset: number;
}

function readHead(bytes: Uint8Array, offset: number): Head {
  if (offset >= bytes.length) throw new Error('Truncated CBOR');
  const initial = bytes[offset];
  const major = initial >> 5;
  const info = initial & 0x1f;
  offset += 1;
  if (info < 24) return { major, value: info, offset };
  const size = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : info === 31 ? 0 : -1;
  if (size < 0) throw new Error('Malformed CBOR head');
  if (size === 0) {
    if (major === 0 || major === 1 || major === 6) throw new Error('Malformed CBOR head');
    return { major, value: -1, offset };
  }
  if (offset + size > bytes.length) throw new Error('Truncated CBOR');
  let value = 0;
  for (let i = 0; i < size; i++) value = value * 256 + bytes[offset + i];
  return { major, value, offset: offset + size };
}

const BREAK = 0xff;

/** Offset just after the CBOR data item starting at `offset` */
export function skipItem(bytes: Uint8Array, offset: number, depth = 0): number {
  if (depth > 64) throw new Error('CBOR nested too deeply');
  const head = readHead(bytes, offset);
  const { major, value } = head;
  offset = head.offset;
  switch (major) {
    case 0:
    case 1:
    case 7:
      return offset;
    case 2:
    case 3:
      if (value >= 0) {
        if (offset + value > bytes.length) throw new Error('Truncated CBOR');
        return offset + value;
      }
      while (bytes[offset] !== BREAK) offset = skipItem(bytes, offset, depth + 1);
      return offset + 1;
    case 4:
    case 5: {
      const per = major === 5 ? 2 : 1;
      if (value >= 0) {
        for (let i = 0; i < value * per; i++) offset = skipItem(bytes, offset, depth + 1);
        return offset;
      }
      while (bytes[offset] !== BREAK) offset = skipItem(bytes, offset, depth + 1);
      return offset + 1;
    }
    case 6:
      return skipItem(bytes, offset, depth + 1);
    default:
      throw new Error('Unknown CBOR major type');
  }
}

/** Unsigned-integer keys of the map at `offset`; throws on non-integer keys */
function mapKeys(bytes: Uint8Array, offset: number): number[] {
  let head = readHead(bytes, offset);
  while (head.major === 6) head = readHead(bytes, head.offset); // tagged map
  if (head.major !== 5) throw new Error('Expected a CBOR map');
  offset = head.offset;
  const keys: number[] = [];
  const next = () => {
    const key = readHead(bytes, offset);
    if (key.major !== 0) throw new Error('Expected an unsigned integer map key');
    keys.push(key.value);
    offset = skipItem(bytes, key.offset);
  };
  if (head.value >= 0) for (let i = 0; i < head.value; i++) next();
  else while (bytes[offset] !== BREAK) next();
  return keys;
}

/** Top-level keys of the body (element 0) and witness set (element 1) of a transaction */
export function transactionShape(txHex: string): { bodyKeys: number[]; witnessKeys: number[] } {
  const bytes = Uint8Array.from(Buffer.from(txHex, 'hex'));
  const head = readHead(bytes, 0);
  if (head.major !== 4 || (head.value !== 4 && head.value !== 3)) throw new Error('Not a transaction');
  const bodyKeys = mapKeys(bytes, head.offset);
  const witnessOffset = skipItem(bytes, head.offset);
  const witnessKeys = mapKeys(bytes, witnessOffset);
  const end = skipItem(bytes, skipItem(bytes, skipItem(bytes, witnessOffset)));
  if (head.value === 4 && end !== bytes.length) throw new Error('Trailing bytes after the transaction');
  return { bodyKeys, witnessKeys };
}

/** Top-level keys of a witness set given as its own CBOR */
export function witnessSetKeys(witnessSetHex: string): number[] {
  return mapKeys(Uint8Array.from(Buffer.from(witnessSetHex, 'hex')), 0);
}
