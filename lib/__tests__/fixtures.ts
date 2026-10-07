// Test fixtures: deterministic keys, addresses and transactions built with the Cardano serialization lib
import { core } from '@meshsdk/core';
import { blake2b } from 'blakejs';

const { Cardano, Serialization } = core;

export const PAY_KEY = '11'.repeat(28);
export const STAKE_KEY = '22'.repeat(28);
export const SIGNER_KEY = '33'.repeat(28);
export const SCRIPT_HASH = '44'.repeat(28);
export const CERT_KEY = '55'.repeat(28);
export const LEGACY_REG_KEY = '66'.repeat(28);
export const DREP_KEY = '77'.repeat(28);
export const COLLATERAL_KEY = '88'.repeat(28);
export const REFERENCE_KEY = '99'.repeat(28);
export const POOL_KEY = 'aa'.repeat(28);
export const POOL_ID = Cardano.PoolId.fromKeyHash(POOL_KEY as any);

const keyCred = (hash: string) => ({ type: Cardano.CredentialType.KeyHash, hash: hash as any });
const scriptCred = (hash: string) => ({ type: Cardano.CredentialType.ScriptHash, hash: hash as any });

export const baseAddress = Cardano.BaseAddress.fromCredentials(0, keyCred(PAY_KEY), keyCred(STAKE_KEY))
  .toAddress()
  .toBech32();
export const scriptAddress = Cardano.EnterpriseAddress.fromCredentials(0, scriptCred(SCRIPT_HASH))
  .toAddress()
  .toBech32();
export const collateralAddress = Cardano.EnterpriseAddress.fromCredentials(0, keyCred(COLLATERAL_KEY))
  .toAddress()
  .toBech32();
export const referenceAddress = Cardano.EnterpriseAddress.fromCredentials(0, keyCred(REFERENCE_KEY))
  .toAddress()
  .toBech32();
export const rewardAddress = Cardano.RewardAddress.fromCredentials(0, keyCred(STAKE_KEY))
  .toAddress()
  .toBech32();

/** A tx naming SIGNER_KEY as required signer, withdrawing from STAKE_KEY and registering CERT_KEY */
export function sampleTxCbor(): string {
  const tx = Serialization.Transaction.fromCore({
    id: '00'.repeat(32) as any,
    body: {
      inputs: [{ txId: 'aa'.repeat(32) as any, index: 0 }],
      outputs: [{ address: baseAddress as any, value: { coins: 2_000_000n } }],
      fee: 200_000n,
      requiredExtraSignatures: [SIGNER_KEY as any],
      withdrawals: [{ stakeAddress: rewardAddress as any, quantity: 1n }],
      certificates: [
        // legacy registration: needs no witness, must be ignored
        { __typename: Cardano.CertificateType.StakeRegistration, stakeCredential: keyCred(LEGACY_REG_KEY) } as any,
        { __typename: Cardano.CertificateType.StakeDelegation, stakeCredential: keyCred(CERT_KEY), poolId: POOL_ID } as any,
        { __typename: Cardano.CertificateType.UpdateDelegateRepresentative, dRepCredential: keyCred(DREP_KEY), anchor: null } as any,
      ],
    },
    witness: { signatures: new Map() },
  } as any);
  return tx.toCbor();
}

/** A CLAIM_TX transaction: label 170 record, required signer SIGNER_KEY, TTL 1000, spending input aa..#0 */
export function claimTxCbor(opts: { record?: any; requiredSigners?: string[]; ttl?: number; withCert?: boolean } = {}): string {
  const record =
    opts.record ??
    new Map<any, any>([
      ['t', 'CLAIM_TX'],
      ['i', 'EKYLUMmNPZeEs77Zvclf0bSN5IN-mLfLpx2ySb-HDlk4'],
      ['r', ['bb'.repeat(32)]],
      ['v', new Map([['v', '1.1']])],
    ]);
  const aux = Serialization.AuxiliaryData.fromCore({ blob: new Map([[170n, record]]) } as any);
  const auxiliaryDataHash = Buffer.from(blake2b(Buffer.from(aux.toCbor(), 'hex'), undefined, 32)).toString('hex');
  const tx = Serialization.Transaction.fromCore({
    id: '00'.repeat(32) as any,
    body: {
      inputs: [{ txId: 'aa'.repeat(32) as any, index: 0 }],
      outputs: [{ address: baseAddress as any, value: { coins: 1_000_000n } }],
      fee: 180_000n,
      validityInterval: { invalidHereafter: opts.ttl ?? 1000 },
      requiredExtraSignatures: (opts.requiredSigners ?? [SIGNER_KEY]) as any,
      auxiliaryDataHash: auxiliaryDataHash as any,
      ...(opts.withCert
        ? { certificates: [{ __typename: Cardano.CertificateType.StakeDelegation, stakeCredential: keyCred(CERT_KEY), poolId: POOL_ID }] }
        : {}),
    },
    witness: { signatures: new Map() },
    auxiliaryData: aux.toCore(),
  } as any);
  return tx.toCbor();
}
