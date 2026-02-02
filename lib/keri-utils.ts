// Utility functions for KERI and transaction handling

import { blake2b } from 'blakejs';

/**
 * Hash data using Blake2b and return CESR format
 */
export function hashMetadata(data: any): string {
  const jsonString = JSON.stringify(data);
  const hash = blake2b(jsonString, undefined, 32); // 32 bytes = 256 bits
  
  // In CESR format for Blake2b-256, we use 'E' prefix for 256-bit digest
  // Convert hash to base64url and add CESR prefix
  const hashBase64 = Buffer.from(hash).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `E${hashBase64}`;
}

/**
 * Convert decimal to hex string (for sequence number)
 */
export function decimalToHex(decimal: number): string {
  return decimal.toString(16);
}

/**
 * Build CIP-0170 compliant metadata for attestation
 */
export function buildCIP170Metadata(
  identifier: string,
  digest: string,
  sequenceNumber: number,
  originalMetadata: any,
  metadataLabel: number = 1447
): any {
  const metadata = {
    "170": {
      "t": "ATTEST",
      "i": identifier,
      "d": digest,
      "s": decimalToHex(sequenceNumber),
      "v": {
        "v": "1.0"
      }
    },
    [metadataLabel.toString()]: originalMetadata
  };
  
  return metadata;
}
