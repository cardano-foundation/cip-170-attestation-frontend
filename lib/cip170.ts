// CIP-170 metadata builders and seal derivations (spec v1.1: CLAIM_TX, transaction seal)

import { Saider } from 'signify-ts';

export const CIP170_LABEL = '170';
export const TX_SEAL_PURPOSE = 'cardano-tx-attest';

const TX_HASH_RE = /^[0-9a-f]{64}$/;

export function isTxHash(value: string): boolean {
  return TX_HASH_RE.test(value);
}

/**
 * Transaction seal: the SAID of { d, t: "cardano-tx-attest", n, txHash }, keys in exactly this order.
 * Saider.saidify serialises the object as compact JSON in insertion order with a 44-char '#' placeholder
 * and Blake3-256 code 'E', which is the derivation the spec prescribes (checked against its test vectors).
 */
export function txSeal(networkMagic: number, txHash: string): { said: string; sad: Record<string, any> } {
  if (!isTxHash(txHash)) {
    throw new Error(`Transaction ID must be 64 lowercase hex characters, got "${txHash}"`);
  }
  if (!Number.isInteger(networkMagic) || networkMagic < 0) {
    throw new Error(`Invalid network magic: ${networkMagic}`);
  }
  const [saider, sad] = Saider.saidify({ d: '', t: TX_SEAL_PURPOSE, n: networkMagic, txHash });
  return { said: saider.qb64, sad };
}

/**
 * CLAIM_TX record. `s` is omitted on purpose: the anchoring event is created after the
 * transaction ID is fixed, and `s` would be part of the auxiliary data that the ID covers.
 */
export function buildClaimTxMetadata(aid: string, claimedTxHashes: string[]): Record<string, any> {
  const r = Array.from(new Set(claimedTxHashes.map((h) => h.trim().toLowerCase())));
  if (r.length === 0) {
    throw new Error('CLAIM_TX needs at least one claimed transaction');
  }
  for (const h of r) {
    if (!isTxHash(h)) throw new Error(`Invalid claimed transaction ID: "${h}"`);
  }
  if (!aid) throw new Error('CLAIM_TX needs the signer identifier');
  return {
    [CIP170_LABEL]: {
      t: 'CLAIM_TX',
      i: aid,
      r,
      v: { v: '1.1' },
    },
  };
}
