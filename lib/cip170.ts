// CIP-170 metadata builders and seal derivations (spec v1.1: ATTEST, CLAIM_TX, transaction seal)

import { Saider } from 'signify-ts';
import { decimalToHex } from './keri-utils';

export const CIP170_LABEL = '170';
export const TX_SEAL_PURPOSE = 'cardano-tx-attest';

const TX_HASH_RE = /^[0-9a-f]{64}$/;

export function isTxHash(value: string): boolean {
  return TX_HASH_RE.test(value);
}

/** Labels that must never be copied from untrusted metadata into the new transaction */
function copyOriginalLabels(target: Record<string, any>, originalMetadata: any) {
  if (!originalMetadata || typeof originalMetadata !== 'object') return;
  for (const label of Object.keys(originalMetadata)) {
    if (label === CIP170_LABEL || label === '__proto__' || label === 'constructor' || label === 'prototype') continue;
    target[label] = originalMetadata[label];
  }
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
 * SAD payload a Veridian wallet anchors for a metadata attestation (Reeve recipe):
 * { i, d, metadataLabel, metadataDigest } in this key order, label as a decimal string.
 * Veridian can only anchor the SAID of a JSON object, so label 170's `d` becomes SAID(P).
 */
export function attestSadPayload(
  aid: string,
  metadataLabel: string,
  metadataDigest: string
): { said: string; sad: Record<string, any> } {
  if (!/^\d+$/.test(metadataLabel)) {
    throw new Error(`Metadata label must be a decimal string, got "${metadataLabel}"`);
  }
  const [saider, sad] = Saider.saidify({ i: aid, d: '', metadataLabel, metadataDigest });
  return { said: saider.qb64, sad };
}

/**
 * ATTEST in the SAD variant: `d` is SAID(P) of the payload anchored by the wallet, signalled by v.s = "SAD".
 * Original application labels are preserved as in the raw-digest variant.
 */
export function buildAttestSadMetadata(
  aid: string,
  payloadSaid: string,
  sequenceNumber: number,
  originalMetadata: any
): Record<string, any> {
  const metadata: Record<string, any> = {
    [CIP170_LABEL]: {
      t: 'ATTEST',
      i: aid,
      d: payloadSaid,
      s: decimalToHex(sequenceNumber),
      v: { v: '1.1', s: 'SAD' },
    },
  };
  copyOriginalLabels(metadata, originalMetadata);
  return metadata;
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
