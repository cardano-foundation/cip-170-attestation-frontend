// Utility functions for KERI and transaction handling

import { blake2b } from 'blakejs';
import { encode as cborEncode, decode } from 'cbor-x';
import { Diger } from 'signify-ts';

export function hashMetadata(data: any): string {
  // Find the first available label in the CBOR metadata
  const labels = Object.keys(data);
  if (labels.length === 0) {
    throw new Error("No metadata labels found");
  }

  const label = labels[0];
  console.log("Hashing metadata label:", label, "data:", data[label]);

  // 1. Remove \x and convert hex → bytes
  const hex = data[label].replace(/\\x/g, "");
  const bytes = Uint8Array.from(
    hex.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16))
  );

  // 2. Strip the outer map(label → value) WITHOUT re-encoding
  // CBOR structure: a1 <label> <value>
  // We skip the map header and the label encoding, then take the value bytes

  let offset = 0;

  // skip map header
  if (bytes[offset] === 0xa1) {
    offset += 1;
  } else if (bytes[offset] === 0xb9) {
    offset += 3; // map with uint16 length
  } else {
    throw new Error("Unexpected CBOR map header");
  }

  // skip label - detect encoding size
  const labelByte = bytes[offset];
  if (labelByte <= 0x17) {
    offset += 1; // tiny uint (0-23)
  } else if (labelByte === 0x18) {
    offset += 2; // uint8
  } else if (labelByte === 0x19) {
    offset += 3; // uint16
  } else if (labelByte === 0x1a) {
    offset += 5; // uint32
  } else {
    throw new Error("Unexpected metadata label encoding");
  }

  // 3. Remaining bytes are EXACT value bytes
  const valueBytes = bytes.slice(offset);

  console.log("CBOR value hex:", Buffer.from(valueBytes).toString("hex"));

  // 4. qb64 hash EXACT bytes
  const diger = new Diger({}, valueBytes);

  console.log("Computed digest qb64:", diger.qb64);
  return diger.qb64;
}

/**
 * Convert decimal to hex string (for sequence number)
 */
export function decimalToHex(decimal: number): string {
  return decimal.toString(16);
}

/**
 * Build CIP-0170 compliant metadata for attestation
 * Preserves original metadata labels and adds label 170 for attestation
 */
export function buildCIP170Metadata(
  identifier: string,
  digest: string,
  sequenceNumber: number,
  originalMetadata: any
): any {
  // Start with the CIP-170 attestation at label 170
  const metadata: any = {
    "170": {
      "t": "ATTEST",
      "i": identifier,
      "d": digest,
      "s": decimalToHex(sequenceNumber),
      "v": {
        "v": "1.0"
      }
    }
  };

  // Add all original metadata with their original labels
  // This preserves the exact structure of the original transaction
  if (originalMetadata && typeof originalMetadata === 'object') {
    // Use Object.assign to safely copy properties, filtering out label 170 and prototype pollution
    const filteredMetadata = Object.keys(originalMetadata)
      .filter(label => label !== "170" && label !== "__proto__" && label !== "constructor" && label !== "prototype")
      .reduce((acc, label) => {
        acc[label] = originalMetadata[label];
        return acc;
      }, {} as any);

    Object.assign(metadata, filteredMetadata);
  }

  return metadata;
}
