// Required keys of a transaction (CIP-170 CLAIM_TX): key hashes whose signatures the body made necessary.
// Covered: payment keys of spent and collateral inputs, body required_signers, withdrawal stake keys and the
// keys certificates need a witness from. Not covered: voters, proposals and native-script keys.

import { core } from '@meshsdk/core';

const { Cardano, Serialization } = core;

export type KeyRole = 'input' | 'collateral' | 'required_signer' | 'withdrawal' | 'certificate';

export interface RequiredKey {
  keyHash: string;
  roles: KeyRole[];
}

export interface RequiredKeysResult {
  keys: RequiredKey[];
  warnings: string[];
}

const KEY_HASH = 0; // Cardano.CredentialType.KeyHash

function addKey(acc: Map<string, Set<KeyRole>>, keyHash: string, role: KeyRole) {
  const hash = keyHash.toLowerCase();
  if (!acc.has(hash)) acc.set(hash, new Set());
  acc.get(hash)!.add(role);
}

function toList(acc: Map<string, Set<KeyRole>>): RequiredKey[] {
  return Array.from(acc.entries()).map(([keyHash, roles]) => ({ keyHash, roles: Array.from(roles) }));
}

/** Payment key hash of an address, or null for script, Byron or unparsable addresses */
export function paymentKeyHashOf(address: string): string | null {
  try {
    const parsed = Cardano.Address.fromString(address);
    const part = parsed?.getProps().paymentPart;
    return part && part.type === KEY_HASH ? String(part.hash) : null;
  } catch {
    return null;
  }
}

/** Stake key hash of a reward (stake) address or of a base address' delegation part */
export function stakeKeyHashOf(address: string): string | null {
  try {
    const parsed = Cardano.Address.fromString(address);
    const props = parsed?.getProps();
    const part = props?.delegationPart ?? (parsed?.asReward() ? props?.paymentPart : undefined);
    return part && part.type === KEY_HASH ? String(part.hash) : null;
  } catch {
    return null;
  }
}

const T = Cardano.CertificateType;

// Certificates whose stake credential must witness the transaction (legacy StakeRegistration needs none)
const STAKE_WITNESS_CERTS = new Set<string>([
  T.StakeDeregistration,
  T.StakeDelegation,
  T.Registration,
  T.Unregistration,
  T.VoteDelegation,
  T.StakeVoteDelegation,
  T.StakeRegistrationDelegation,
  T.VoteRegistrationDelegation,
  T.StakeVoteRegistrationDelegation,
]);
const DREP_WITNESS_CERTS = new Set<string>([
  T.RegisterDelegateRepresentative,
  T.UnregisterDelegateRepresentative,
  T.UpdateDelegateRepresentative,
]);
const COMMITTEE_WITNESS_CERTS = new Set<string>([T.AuthorizeCommitteeHot, T.ResignCommitteeCold]);

function keyHashOfCredential(credential: any): string[] {
  return credential && credential.type === KEY_HASH ? [String(credential.hash)] : [];
}

/** Key hashes a certificate needs a vkey witness from */
export function certificateWitnessKeys(cert: any): string[] {
  const type = cert?.__typename;
  if (STAKE_WITNESS_CERTS.has(type)) return keyHashOfCredential(cert.stakeCredential);
  if (DREP_WITNESS_CERTS.has(type)) return keyHashOfCredential(cert.dRepCredential);
  if (COMMITTEE_WITNESS_CERTS.has(type)) return keyHashOfCredential(cert.coldCredential);
  if (type === T.PoolRegistration) {
    const params = cert.poolParameters;
    const owners = (params?.owners ?? [])
      .map((owner: string) => stakeKeyHashOf(String(owner)))
      .filter((h: string | null): h is string => !!h);
    return [String(Cardano.PoolId.toKeyHash(params.id)), ...owners];
  }
  if (type === T.PoolRetirement) return [String(Cardano.PoolId.toKeyHash(cert.poolId))];
  return [];
}

/** Keys that the transaction body itself names: required_signers, withdrawals, certificates */
export function keysFromTxCbor(txCbor: string): RequiredKey[] {
  const acc = new Map<string, Set<KeyRole>>();
  const body = Serialization.Transaction.fromCbor(txCbor as any).body();

  for (const signer of body.requiredSigners()?.toCore() ?? []) {
    addKey(acc, String(signer), 'required_signer');
  }

  for (const rewardAccount of body.withdrawals()?.keys() ?? []) {
    const hash = stakeKeyHashOf(String(rewardAccount));
    if (hash) addKey(acc, hash, 'withdrawal');
  }

  for (const cert of body.certs()?.toCore() ?? []) {
    for (const hash of certificateWitnessKeys(cert)) addKey(acc, hash, 'certificate');
  }

  return toList(acc);
}

/** Merge key lists, combining roles of the same key hash */
export function mergeRequiredKeys(...lists: RequiredKey[][]): RequiredKey[] {
  const acc = new Map<string, Set<KeyRole>>();
  for (const list of lists) {
    for (const key of list) {
      for (const role of key.roles) addKey(acc, key.keyHash, role);
    }
  }
  return toList(acc);
}

export function keysFromInputAddresses(addresses: string[], role: KeyRole = 'input'): RequiredKey[] {
  const acc = new Map<string, Set<KeyRole>>();
  for (const address of addresses) {
    const hash = paymentKeyHashOf(address);
    if (hash) addKey(acc, hash, role);
  }
  return toList(acc);
}

/** Keys of Blockfrost `/txs/{hash}/utxos` inputs: reference inputs need no witness, collateral has its own role */
export function keysFromBlockfrostInputs(
  inputs: { address: string; collateral?: boolean; reference?: boolean }[]
): RequiredKey[] {
  const spent = inputs.filter((input) => !input.reference);
  return mergeRequiredKeys(
    keysFromInputAddresses(spent.filter((input) => !input.collateral).map((input) => input.address)),
    keysFromInputAddresses(spent.filter((input) => input.collateral).map((input) => input.address), 'collateral')
  );
}

/**
 * Resolve the required keys of an on-chain transaction from a Blockfrost-compatible API.
 * Inputs come from /txs/{hash}/utxos (collateral excluded); body fields from /txs/{hash}/cbor.
 */
export async function fetchRequiredKeys(
  blockfrostUrl: string,
  apiKey: string,
  txHash: string
): Promise<RequiredKeysResult> {
  const headers = { project_id: apiKey };
  const warnings: string[] = [];

  const utxoResponse = await fetch(`${blockfrostUrl}/txs/${txHash}/utxos`, { headers });
  if (!utxoResponse.ok) {
    throw new Error(`Transaction ${txHash.slice(0, 12)}… not found (${utxoResponse.status})`);
  }
  const utxos = await utxoResponse.json();
  const inputKeys = keysFromBlockfrostInputs(utxos.inputs ?? []);

  let bodyKeys: RequiredKey[] = [];
  try {
    const cborResponse = await fetch(`${blockfrostUrl}/txs/${txHash}/cbor`, { headers });
    if (!cborResponse.ok) throw new Error(`status ${cborResponse.status}`);
    const { cbor } = await cborResponse.json();
    bodyKeys = keysFromTxCbor(cbor);
  } catch (err: any) {
    warnings.push(
      `Could not read the transaction body (${err.message}); only input keys are listed.`
    );
  }

  return { keys: mergeRequiredKeys(inputKeys, bodyKeys), warnings };
}

export interface WalletKeys {
  payment: Set<string>;
  stake: Set<string>;
}

/** Key hashes the connected CIP-30 wallet controls, as far as its addresses reveal them */
export async function walletKeyHashes(walletApi: any): Promise<WalletKeys> {
  const settle = async (fn: () => Promise<any>) => {
    try {
      const value = await fn();
      return Array.isArray(value) ? value : value ? [value] : [];
    } catch {
      return [];
    }
  };
  const addresses: string[] = [
    ...(await settle(() => walletApi.getUsedAddresses())),
    ...(await settle(() => walletApi.getUnusedAddresses())),
    ...(await settle(() => walletApi.getChangeAddress())),
  ];
  const rewards: string[] = await settle(() => walletApi.getRewardAddresses());
  const payment = new Set<string>();
  const stake = new Set<string>();
  for (const address of addresses) {
    const p = paymentKeyHashOf(address);
    if (p) payment.add(p);
    const s = stakeKeyHashOf(address);
    if (s) stake.add(s);
  }
  for (const reward of rewards) {
    const s = stakeKeyHashOf(reward);
    if (s) stake.add(s);
  }
  return { payment, stake };
}

export function walletOwnsKey(keys: WalletKeys | null, keyHash: string): boolean {
  return !!keys && (keys.payment.has(keyHash) || keys.stake.has(keyHash));
}
