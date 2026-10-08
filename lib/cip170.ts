// CIP-170 metadata builders and seal derivations (spec v1.1: CLAIM_TX, transaction seal, metadata seal)

import { Saider } from 'signify-ts';

export const CIP170_LABEL = '170';
export const TX_SEAL_PURPOSE = 'cardano-tx-attest';
export const METADATA_SEAL_PURPOSE = 'cardano-metadata-attest';

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
 * Metadata seal (CIP-170 v1.1): the SAID of { d, t: "cardano-metadata-attest", l, digest }, keys in exactly this order,
 * `l` the attested label as a JSON integer. Lets a signer that can only anchor SAIDs (Veridian remote signing) produce an
 * ATTEST whose `d` stays the plain digest; verifiers recompute the seal from `d` and the label.
 */
export function metadataSeal(label: string | number, digest: string): { said: string; sad: Record<string, any> } {
  const text = String(label);
  if (!/^(0|[1-9][0-9]*)$/.test(text)) throw new Error(`Metadata label must be a decimal integer, got "${text}"`);
  const l = Number(text);
  // JSON numbers in JS are exact only up to 2^53; the spec requires the label to be serialised exactly
  if (!Number.isSafeInteger(l)) throw new Error(`Metadata label ${text} is too large to serialise exactly`);
  if (text === CIP170_LABEL) throw new Error('Label 170 cannot be the attested label');
  if (!digest) throw new Error('Metadata seal needs the digest');
  const [saider, sad] = Saider.saidify({ d: '', t: METADATA_SEAL_PURPOSE, l, digest });
  return { said: saider.qb64, sad };
}

/**
 * What a Veridian ATTEST anchors: the attested label is the label whose CBOR value was digested (the first key, the same
 * rule hashMetadata uses), and the anchor is the metadata seal of that label and digest. Refuses label 170, whose value is
 * never copied into the new transaction, so the anchor could never verify.
 */
export function veridianAttestPlan(cborMetadata: Record<string, unknown> | null, digest: string): {
  label: string;
  seal: { said: string; sad: Record<string, any> };
} {
  const label = Object.keys(cborMetadata ?? {})[0];
  if (!label || !digest) throw new Error('No metadata digest to attest');
  if (label === CIP170_LABEL) {
    throw new Error('The source transaction carries a label 170 record first; it cannot be attested as metadata');
  }
  return { label, seal: metadataSeal(label, digest) };
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
