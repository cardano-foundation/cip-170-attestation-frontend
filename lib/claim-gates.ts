// Safety gates for the CLAIM_TX flow, kept pure so they can be unit-tested.
// - canAnchor / canSubmit decide when the initiator may anchor the seal and submit.
// - validateCosignTx decides whether the /cosign page may ask a visitor's wallet to sign.

import { core } from '@meshsdk/core';
import { blake2b } from 'blakejs';
import { txSeal, isTxHash } from './cip170';
import {
  claimTxBodyInfo,
  txIdOf,
  verifyVkeyWitness,
  vkeyWitnessesOfWitnessSet,
  witnessedKeyHashes,
} from './claim-tx';
import { transactionShape, witnessSetKeys } from './cbor-shape';

const { Cardano, Serialization } = core;

export interface Gate {
  ok: boolean;
  reason?: string;
}

/** Witnesses are collected before anchoring (CIP-170 construction step 3 SHOULD) */
/** Keys that must witness the claim tx: its required_signers plus the payment keys of the inputs it spends */
function neededKeys(txHex: string, inputKeys: string[]): string[] {
  return Array.from(new Set([...claimTxBodyInfo(txHex).requiredSigners, ...inputKeys]));
}

export function canAnchor(args: { txHex: string; inputKeys: string[]; tipSlot: number; hasSeal: boolean }): Gate {
  const { ttl } = claimTxBodyInfo(args.txHex);
  if (args.hasSeal) return { ok: false, reason: 'The transaction seal is already anchored' };
  if (ttl === undefined) return { ok: false, reason: 'The transaction has no TTL' };
  if (args.tipSlot >= ttl) return { ok: false, reason: 'The transaction has expired (TTL passed)' };
  const witnessed = witnessedKeyHashes(args.txHex);
  const missing = neededKeys(args.txHex, args.inputKeys).filter((k) => !witnessed.has(k));
  if (missing.length > 0) return { ok: false, reason: `${missing.length} required signature(s) missing` };
  return { ok: true };
}

/** Submit only a fully witnessed tx whose final ID is the one the anchored seal covers */
export function canSubmit(args: {
  txHex: string;
  inputKeys: string[];
  tipSlot: number;
  networkMagic: number;
  seal?: { said: string };
}): Gate {
  const { ttl } = claimTxBodyInfo(args.txHex);
  if (!args.seal) return { ok: false, reason: 'The transaction seal is not anchored yet' };
  if (ttl === undefined || args.tipSlot >= ttl) return { ok: false, reason: 'The transaction has expired (TTL passed)' };
  const witnessed = witnessedKeyHashes(args.txHex);
  if (neededKeys(args.txHex, args.inputKeys).some((k) => !witnessed.has(k))) return { ok: false, reason: 'Required signatures are missing' };
  const expected = txSeal(args.networkMagic, txIdOf(args.txHex)).said;
  if (expected !== args.seal.said) {
    return { ok: false, reason: 'The anchored seal does not match the final transaction ID' };
  }
  return { ok: true };
}

/** Convert a core metadatum (bigint | string | bytes | list | map) to plain JSON-like values */
export function metadatumToJs(value: any): any {
  if (value instanceof Map) {
    const out: Record<string, any> = {};
    for (const [k, v] of value.entries()) out[String(metadatumToJs(k))] = metadatumToJs(v);
    return out;
  }
  if (Array.isArray(value)) return value.map(metadatumToJs);
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function versionAtLeast(version: unknown, major: number, minor: number): boolean {
  if (typeof version !== 'string' || !/^\d+\.\d+$/.test(version)) return false;
  const [a, b] = version.split('.').map(Number);
  return a > major || (a === major && b >= minor);
}

export interface UtxoRef {
  txHash: string;
  outputIndex: number;
}

export interface CosignCheck {
  ok: boolean;
  errors: string[];
  txId: string;
  record?: { t: string; i: string; r: string[]; v: Record<string, any> };
  requiredSigners: string[];
  ttl?: number;
  fee: string;
  outputs: { address: string; lovelace: string }[];
  /** Spent inputs; each must be resolved with resolveCosignInputs and pass checkResolvedInputs */
  inputs: UtxoRef[];
}

/**
 * Body keys a genuine claim tx may carry: inputs, outputs, fee, ttl, auxiliary data hash, validity start,
 * required signers, network id. An allow-list, so any field a future era adds (or a Plutus/collateral field)
 * is refused, and the raw walk also catches keys the SDK parser would silently misread.
 */
const ALLOWED_BODY_KEYS = new Set([0, 1, 2, 3, 7, 8, 14, 15]);
/** The received tx may only carry vkey witnesses (key 0) */
const ALLOWED_WITNESS_KEYS = new Set([0]);

function shapeErrors(keys: number[], allowed: Set<number>, what: string): string[] {
  const errors: string[] = [];
  if (new Set(keys).size !== keys.length) errors.push(`The ${what} has duplicate fields`);
  const extra = keys.filter((k) => !allowed.has(k));
  if (extra.length) errors.push(`The ${what} has fields a claim never needs (${extra.join(', ')})`);
  return errors;
}

/**
 * The /cosign page signs with whatever wallet the visitor connects, so it only accepts a narrow shape:
 * a CLAIM_TX transaction that runs no scripts and asks for keys it lists as required signers. Input ownership
 * needs chain data and is checked separately (resolveCosignInputs + checkResolvedInputs), and the returned
 * signatures by checkReturnedWitnessSet.
 */
export function validateCosignTx(
  txHex: string,
  expectedKeys: string[],
  walletUtxos: UtxoRef[],
  network?: 'mainnet' | 'preprod' | 'preview'
): CosignCheck {
  const errors: string[] = [];

  // Raw shape first: never reason about a body the parser may have misread
  const shape = transactionShape(txHex);
  errors.push(...shapeErrors(shape.bodyKeys, ALLOWED_BODY_KEYS, 'transaction body'));
  errors.push(...shapeErrors(shape.witnessKeys, ALLOWED_WITNESS_KEYS, 'witness set'));
  if (errors.length > 0) {
    // the SDK parser cannot be trusted on such a body: refuse without parsing further
    return { ok: false, errors, txId: '', requiredSigners: [], fee: '0', outputs: [], inputs: [] };
  }

  const tx = Serialization.Transaction.fromCbor(txHex as any);
  const body = tx.body();
  const txId = String(tx.getId());
  const info = claimTxBodyInfo(txHex);
  const outputs = body.outputs().map((o) => ({
    address: String(o.address().toBech32()),
    lovelace: String(o.amount().coin()),
  }));
  const inputs = body.inputs().toCore().map((i) => ({ txHash: String(i.txId), outputIndex: i.index }));
  const result: CosignCheck = {
    ok: false,
    errors,
    txId,
    requiredSigners: info.requiredSigners,
    ttl: info.ttl,
    fee: info.fee,
    outputs,
    inputs,
  };

  // Auxiliary data must be the one the body commits to, metadata only, otherwise the shown record means nothing
  const aux = tx.auxiliaryData();
  const auxHash = body.auxiliaryDataHash();
  if (!aux || !auxHash) {
    errors.push('The transaction carries no metadata');
  } else {
    const digest = Buffer.from(blake2b(Buffer.from(aux.toCbor(), 'hex'), undefined, 32)).toString('hex');
    if (digest !== String(auxHash)) errors.push('The metadata does not match the auxiliary data hash in the body');
    const core = aux.toCore();
    if ((core.scripts ?? []).length > 0) errors.push('The metadata carries scripts');
    const record = metadatumToJs(core.blob?.get(170n));
    const valid =
      record &&
      record.t === 'CLAIM_TX' &&
      typeof record.i === 'string' &&
      record.i.length > 0 &&
      Array.isArray(record.r) &&
      record.r.length > 0 &&
      record.r.every((h: unknown) => typeof h === 'string' && isTxHash(h)) &&
      versionAtLeast(record.v?.v, 1, 1);
    if (valid) result.record = record;
    else errors.push('Label 170 does not hold a well-formed CLAIM_TX record');
  }

  if (info.ttl === undefined) errors.push('The transaction has no TTL');

  const keys = expectedKeys.map((k) => k.toLowerCase());
  if (keys.length === 0) errors.push('The link names no key to sign with');
  const missing = keys.filter((k) => !info.requiredSigners.includes(k));
  if (missing.length > 0) errors.push('The link asks for keys that are not required signers of the transaction');

  if (network) {
    const expectedId = network === 'mainnet' ? 1 : 0;
    const wrong = body.outputs().some((o) => o.address().getNetworkId() !== expectedId);
    if (wrong) errors.push(`An output address is not on ${network}`);
  }

  const own = new Set(walletUtxos.map((u) => `${u.txHash.toLowerCase()}#${u.outputIndex}`));
  if (inputs.some((input) => own.has(`${input.txHash}#${input.outputIndex}`))) {
    errors.push('The transaction spends UTxOs of the connected wallet; signing would authorise moving your funds');
  }

  result.ok = errors.length === 0;
  return result;
}

export interface ResolvedInput extends UtxoRef {
  address: string;
}

/**
 * Resolve each spent input's address from the app-configured Blockfrost-compatible API (never from the link).
 * Matches by output_index, requires exactly one non-collateral match; any failure throws (fail closed).
 */
export async function resolveCosignInputs(
  blockfrostUrl: string,
  apiKey: string,
  inputs: UtxoRef[]
): Promise<ResolvedInput[]> {
  const byTx = new Map<string, any[]>();
  const resolved: ResolvedInput[] = [];
  for (const input of inputs) {
    if (!byTx.has(input.txHash)) {
      const response = await fetch(`${blockfrostUrl}/txs/${input.txHash}/utxos`, { headers: { project_id: apiKey } });
      if (!response.ok) throw new Error(`Input ${input.txHash.slice(0, 12)}… could not be resolved (${response.status})`);
      byTx.set(input.txHash, (await response.json())?.outputs ?? []);
    }
    resolved.push({ ...input, address: matchOutputAddress(byTx.get(input.txHash)!, input) });
  }
  return resolved;
}

export function matchOutputAddress(outputs: any[], input: UtxoRef): string {
  const matches = outputs.filter((o) => o?.output_index === input.outputIndex && !o?.collateral);
  if (matches.length !== 1 || typeof matches[0].address !== 'string') {
    throw new Error(`Input ${input.txHash.slice(0, 12)}…#${input.outputIndex} could not be resolved`);
  }
  return matches[0].address;
}

/**
 * Funds rule: no input may be script-locked or Byron, and no input may be locked by a key the visitor's wallet
 * holds or is asked to sign with; otherwise the returned signature could authorise spending it.
 */
export function checkResolvedInputs(resolved: ResolvedInput[], requestedKeys: string[], walletPaymentKeys: Set<string>): string[] {
  const errors: string[] = [];
  const requested = new Set(requestedKeys.map((k) => k.toLowerCase()));
  for (const input of resolved) {
    const label = `${input.txHash.slice(0, 12)}…#${input.outputIndex}`;
    let props: any;
    try {
      const parsed = Cardano.Address.fromString(input.address);
      if (!parsed) throw new Error('unparsable');
      if (parsed.getType() === Cardano.AddressType.Byron) {
        errors.push(`Input ${label} is at a Byron address`);
        continue;
      }
      props = parsed.getProps();
    } catch {
      errors.push(`Input ${label} has an unreadable address`);
      continue;
    }
    const payment = props?.paymentPart;
    if (!payment) {
      errors.push(`Input ${label} has no payment credential`);
    } else if (payment.type !== Cardano.CredentialType.KeyHash) {
      errors.push(`Input ${label} is locked by a script; your signature could unlock it`);
    } else {
      const hash = String(payment.hash).toLowerCase();
      if (requested.has(hash) || walletPaymentKeys.has(hash)) {
        errors.push(`Input ${label} is locked by your key; signing would authorise spending it`);
      }
    }
  }
  return errors;
}

/**
 * Returned signatures: only vkey witnesses, each valid for this transaction and from a requested key.
 * Anything else (an extra key, a bootstrap witness, scripts) means the wallet signed for more than the claim.
 */
export async function checkReturnedWitnessSet(witnessSetHex: string, txId: string, requestedKeys: string[]): Promise<string[]> {
  const errors: string[] = [];
  try {
    errors.push(...shapeErrors(witnessSetKeys(witnessSetHex), ALLOWED_WITNESS_KEYS, 'returned witness set'));
  } catch {
    return ['The wallet returned an unreadable witness set'];
  }
  const requested = new Set(requestedKeys.map((k) => k.toLowerCase()));
  const witnesses = vkeyWitnessesOfWitnessSet(witnessSetHex);
  if (witnesses.length === 0) errors.push('The wallet returned no signatures');
  for (const w of witnesses) {
    if (!requested.has(w.keyHash)) errors.push(`The wallet also signed with key ${w.keyHash.slice(0, 12)}…, which this claim does not ask for`);
    else if (!(await verifyVkeyWitness(txId, w))) errors.push('The wallet returned an invalid signature');
  }
  return errors;
}
