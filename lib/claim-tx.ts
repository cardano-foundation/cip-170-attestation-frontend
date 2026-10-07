// CLAIM_TX transaction: build, collect and verify vkey witnesses, submit.
// The body is frozen once built: every later step works on the witness set only and re-checks the ID.

import { BlockfrostProvider, MeshTxBuilder, core } from '@meshsdk/core';
import type { UTxO } from '@meshsdk/core';
import { blake2b } from 'blakejs';
import sodium from 'libsodium-wrappers-sumo';
import { paymentKeyHashOf } from './required-keys';

const { Serialization } = core;

/** Upper bound of the validity interval, in slots after the current tip (1 s slots: ~24 h) */
export const CLAIM_TTL_SLOTS = 86_400;
const SELF_OUTPUT_LOVELACE = '1000000';

export interface VkeyWitnessInfo {
  vkey: string;
  signature: string;
  keyHash: string;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error('Invalid hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ed25519 verification key → key hash (Blake2b-224) */
export function keyHashOfVkey(vkeyHex: string): string {
  return bytesToHex(blake2b(hexToBytes(vkeyHex), undefined, 28));
}

/** Transaction ID: Blake2b-256 of the original body bytes (never re-serialised) */
export function txIdOf(txHex: string): string {
  return String(Serialization.Transaction.fromCbor(txHex as any).getId());
}

export function vkeyWitnessesOfWitnessSet(witnessSetHex: string): VkeyWitnessInfo[] {
  const set = Serialization.TransactionWitnessSet.fromCbor(witnessSetHex as any);
  return (set.vkeys()?.values() ?? []).map((w) => ({
    vkey: String(w.vkey()),
    signature: String(w.signature()),
    keyHash: keyHashOfVkey(String(w.vkey())),
  }));
}

export function vkeyWitnessesOfTx(txHex: string): VkeyWitnessInfo[] {
  return vkeyWitnessesOfWitnessSet(Serialization.Transaction.fromCbor(txHex as any).witnessSet().toCbor());
}

/** Key hashes that already have a vkey witness in the transaction */
export function witnessedKeyHashes(txHex: string): Set<string> {
  return new Set(vkeyWitnessesOfTx(txHex).map((w) => w.keyHash));
}

export async function verifyVkeyWitness(txId: string, witness: VkeyWitnessInfo): Promise<boolean> {
  await sodium.ready;
  try {
    return sodium.crypto_sign_verify_detached(
      hexToBytes(witness.signature),
      hexToBytes(txId),
      hexToBytes(witness.vkey)
    );
  } catch {
    return false;
  }
}

/**
 * Merge vkey witnesses into a transaction. Every incoming witness must sign the ID recomputed from `txHex`
 * (which must equal `expectedTxId` when given) and, when `allowedKeyHashes` is given, belong to one of those keys. Duplicates (same vkey) are dropped.
 * Throws if any witness is invalid or if the ID would change, so a bad paste never alters the tx.
 */
export async function mergeVkeyWitnesses(
  txHex: string,
  witnessSetHex: string,
  opts: { allowedKeyHashes?: Set<string>; expectedTxId?: string } = {}
): Promise<{ txHex: string; added: string[] }> {
  const verified = await verifyWitnessSet(txHex, witnessSetHex, opts);
  return addVerifiedVkeyWitnesses(txHex, verified);
}

/**
 * Check every witness of a witness set against the ID recomputed from `txHex` (and `expectedTxId`, `allowedKeyHashes`).
 * The result can be added synchronously, also to a newer copy of the same transaction.
 */
export async function verifyWitnessSet(
  txHex: string,
  witnessSetHex: string,
  opts: { allowedKeyHashes?: Set<string>; expectedTxId?: string } = {}
): Promise<{ txId: string; witnesses: VkeyWitnessInfo[] }> {
  const { allowedKeyHashes, expectedTxId } = opts;
  const txId = txIdOf(txHex);
  if (expectedTxId !== undefined && expectedTxId.toLowerCase() !== txId) {
    throw new Error('These signatures belong to a different transaction');
  }
  const incoming = vkeyWitnessesOfWitnessSet(witnessSetHex);
  if (incoming.length === 0) throw new Error('The witness set contains no signatures');

  for (const w of incoming) {
    if (allowedKeyHashes && !allowedKeyHashes.has(w.keyHash)) {
      throw new Error(`Signature from key ${w.keyHash.slice(0, 12)}… is not expected for this transaction`);
    }
    if (!(await verifyVkeyWitness(txId, w))) {
      throw new Error(`Signature from key ${w.keyHash.slice(0, 12)}… does not sign transaction ${txId.slice(0, 12)}…`);
    }
  }
  return { txId, witnesses: incoming };
}

/** Add witnesses verified by verifyWitnessSet; refuses a transaction with another ID. Dedupes by vkey. */
export function addVerifiedVkeyWitnesses(
  txHex: string,
  verified: { txId: string; witnesses: VkeyWitnessInfo[] }
): { txHex: string; added: string[] } {
  const tx = Serialization.Transaction.fromCbor(txHex as any);
  const txId = String(tx.getId());
  if (txId !== verified.txId) throw new Error('These signatures were verified for a different transaction');
  const incoming = verified.witnesses;

  const witnessSet = tx.witnessSet();
  const existing = witnessSet.vkeys()?.values() ?? [];
  const seen = new Set(existing.map((w) => String(w.vkey())));
  const merged = [...existing];
  const added: string[] = [];
  for (const w of incoming) {
    if (seen.has(w.vkey)) continue;
    seen.add(w.vkey);
    merged.push(new Serialization.VkeyWitness(w.vkey as any, w.signature as any));
    added.push(w.keyHash);
  }
  witnessSet.setVkeys(
    Serialization.CborSet.fromCore(
      merged.map((w) => w.toCore()),
      Serialization.VkeyWitness.fromCore
    )
  );
  tx.setWitnessSet(witnessSet);
  const out = tx.toCbor();
  if (txIdOf(out) !== txId) throw new Error('Merging witnesses changed the transaction ID');
  return { txHex: out, added };
}

export async function fetchTipSlot(blockfrostUrl: string, apiKey: string): Promise<number> {
  const response = await fetch(`${blockfrostUrl}/blocks/latest`, { headers: { project_id: apiKey } });
  if (!response.ok) throw new Error(`Could not read the chain tip (${response.status})`);
  const block = await response.json();
  if (typeof block.slot !== 'number') throw new Error('Chain tip has no slot');
  return block.slot;
}

/**
 * Wallet UTxOs that may pay for a transaction. A UTxO carrying a reference script is never spent: Conway charges a
 * per-byte fee for it even when no script runs, and spending it would consume a deployed reference script.
 */
export function spendableUtxos(utxos: UTxO[]): UTxO[] {
  const spendable = (utxos ?? []).filter((u) => !u.output.scriptRef);
  if (spendable.length === 0) {
    throw new Error('No wallet UTxO without a reference script is available to pay the fee');
  }
  return spendable;
}

export interface BuildClaimTxArgs {
  walletApi: any;
  blockfrostApiKey: string;
  metadata170: Record<string, any>;
  requiredSigners: string[];
  ttlSlot: number;
}

/**
 * Build the unsigned claim transaction: 1 ADA to self, required_signers, TTL and label 170.
 * Also returns the payment keys of the wallet inputs it spends, which must witness it as well.
 */
export async function buildClaimTx(
  args: BuildClaimTxArgs
): Promise<{ txHex: string; txId: string; inputKeys: string[] }> {
  const { walletApi, blockfrostApiKey, metadata170, requiredSigners, ttlSlot } = args;
  const usedAddresses = await walletApi.getUsedAddresses();
  const changeAddress = await walletApi.getChangeAddress();
  const all = await walletApi.getUtxos();
  if (!all || all.length === 0) throw new Error('No UTxOs available in wallet');
  const utxos = spendableUtxos(all);

  const provider = new BlockfrostProvider(blockfrostApiKey);
  let builder = new MeshTxBuilder({ fetcher: provider, submitter: provider, evaluator: provider })
    .txOut(usedAddresses?.[0] || changeAddress, [{ unit: 'lovelace', quantity: SELF_OUTPUT_LOVELACE }])
    .changeAddress(changeAddress)
    .invalidHereafter(ttlSlot)
    .metadataValue(170, metadata170);
  for (const key of Array.from(new Set(requiredSigners.map((k) => k.toLowerCase())))) {
    builder = builder.requiredSignerHash(key);
  }
  const txHex = await builder.selectUtxosFrom(utxos).complete();
  return { txHex, txId: txIdOf(txHex), inputKeys: inputKeysOf(txHex, utxos) };
}

/** Payment key hashes of the spent inputs, looked up in the wallet UTxOs (Mesh UTxO shape) */
export function inputKeysOf(txHex: string, utxos: { input: { txHash: string; outputIndex: number }; output: { address: string } }[]): string[] {
  const byRef = new Map(utxos.map((u) => [`${u.input.txHash.toLowerCase()}#${u.input.outputIndex}`, u.output.address]));
  const keys = new Set<string>();
  for (const input of Serialization.Transaction.fromCbor(txHex as any).body().inputs().toCore()) {
    const address = byRef.get(`${String(input.txId)}#${input.index}`);
    const hash = address ? paymentKeyHashOf(address) : null;
    if (!address || !hash) {
      throw new Error(
        `Cannot determine the key of input ${String(input.txId).slice(0, 12)}…#${input.index}: claims need a wallet whose UTxOs sit at key (not script or Byron) addresses`
      );
    }
    keys.add(hash);
  }
  return Array.from(keys);
}

/** Required signers and TTL as written in the body, for display and checks */
export function claimTxBodyInfo(txHex: string): { requiredSigners: string[]; ttl?: number; fee: string } {
  const body = Serialization.Transaction.fromCbor(txHex as any).body();
  return {
    requiredSigners: (body.requiredSigners()?.toCore() ?? []).map((k) => String(k)),
    ttl: body.ttl() !== undefined ? Number(body.ttl()) : undefined,
    fee: String(body.fee()),
  };
}

export async function submitTx(
  txHex: string,
  opts: { walletApi?: any; blockfrostUrl: string; blockfrostApiKey: string }
): Promise<string> {
  if (opts.walletApi) return opts.walletApi.submitTx(txHex);
  const response = await fetch(`${opts.blockfrostUrl}/tx/submit`, {
    method: 'POST',
    headers: { project_id: opts.blockfrostApiKey, 'Content-Type': 'application/cbor' },
    body: hexToBytes(txHex) as BodyInit,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Submit failed (${response.status}): ${text}`);
  return text.replace(/"/g, '');
}
