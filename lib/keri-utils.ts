// Utility functions for KERI and transaction handling

import { blake2b } from 'blakejs';

/**
 * Hash data using Blake2b-256 and return CESR qb64 format
 * Uses 'F' prefix for Blake2b-256 digest (32 bytes)
 */
export function hashMetadata(data: any): string {
  const jsonString = JSON.stringify(data);
  const hash = blake2b(jsonString, undefined, 32); // 32 bytes = 256 bits
  
  // Convert to base64url (RFC 4648 §5)
  const hashBase64 = Buffer.from(hash).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  // CESR qb64 format for Blake2b-256: 'F' prefix + 43 chars base64url = 44 chars total
  return `F${hashBase64}`;
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
