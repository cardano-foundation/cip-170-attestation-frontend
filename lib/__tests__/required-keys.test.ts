import { describe, expect, it } from 'vitest';
import {
  certificateWitnessKeys,
  keysFromBlockfrostInputs,
  keysFromInputAddresses,
  keysFromTxCbor,
  mergeRequiredKeys,
  paymentKeyHashOf,
  stakeKeyHashOf,
} from '@/lib/required-keys';
import {
  baseAddress,
  CERT_KEY,
  collateralAddress,
  COLLATERAL_KEY,
  DREP_KEY,
  PAY_KEY,
  POOL_ID,
  POOL_KEY,
  referenceAddress,
  rewardAddress,
  sampleTxCbor,
  scriptAddress,
  SIGNER_KEY,
  STAKE_KEY,
} from './fixtures';

describe('address key hashes', () => {
  it('extracts the payment key hash of a base address', () => {
    expect(paymentKeyHashOf(baseAddress)).toBe(PAY_KEY);
  });

  it('ignores script addresses and garbage', () => {
    expect(paymentKeyHashOf(scriptAddress)).toBeNull();
    expect(paymentKeyHashOf('not-an-address')).toBeNull();
  });

  it('extracts stake key hashes from reward and base addresses', () => {
    expect(stakeKeyHashOf(rewardAddress)).toBe(STAKE_KEY);
    expect(stakeKeyHashOf(baseAddress)).toBe(STAKE_KEY);
  });
});

describe('keysFromTxCbor', () => {
  it('collects required signers, withdrawal and certificate keys', () => {
    const keys = keysFromTxCbor(sampleTxCbor());
    expect(keys).toEqual(
      expect.arrayContaining([
        { keyHash: SIGNER_KEY, roles: ['required_signer'] },
        { keyHash: STAKE_KEY, roles: ['withdrawal'] },
        { keyHash: CERT_KEY, roles: ['certificate'] },
        { keyHash: DREP_KEY, roles: ['certificate'] },
      ])
    );
    // the legacy StakeRegistration key needs no witness
    expect(keys).toHaveLength(4);
  });
});

describe('merge', () => {
  it('combines roles of the same key and skips script inputs', () => {
    const inputs = keysFromInputAddresses([baseAddress, scriptAddress, baseAddress]);
    expect(inputs).toEqual([{ keyHash: PAY_KEY, roles: ['input'] }]);
    const merged = mergeRequiredKeys(inputs, [{ keyHash: PAY_KEY.toUpperCase(), roles: ['required_signer'] }]);
    expect(merged).toEqual([{ keyHash: PAY_KEY, roles: ['input', 'required_signer'] }]);
  });
});

describe('keysFromBlockfrostInputs', () => {
  it('drops reference inputs and labels collateral', () => {
    const keys = keysFromBlockfrostInputs([
      { address: baseAddress },
      { address: collateralAddress, collateral: true },
      { address: referenceAddress, reference: true },
    ]);
    expect(keys).toEqual([
      { keyHash: PAY_KEY, roles: ['input'] },
      { keyHash: COLLATERAL_KEY, roles: ['collateral'] },
    ]);
  });
});

describe('certificateWitnessKeys', () => {
  it('requires the operator and owners for a pool registration', () => {
    const keys = certificateWitnessKeys({
      __typename: 'PoolRegistrationCertificate',
      poolParameters: { id: POOL_ID, owners: [rewardAddress] },
    });
    expect(keys).toEqual([POOL_KEY, STAKE_KEY]);
  });

  it('requires the operator for a pool retirement', () => {
    expect(certificateWitnessKeys({ __typename: 'PoolRetirementCertificate', poolId: POOL_ID })).toEqual([POOL_KEY]);
  });

  it('ignores the legacy stake registration and MIR', () => {
    expect(
      certificateWitnessKeys({ __typename: 'StakeRegistrationCertificate', stakeCredential: { type: 0, hash: PAY_KEY } })
    ).toEqual([]);
    expect(certificateWitnessKeys({ __typename: 'MirCertificate' })).toEqual([]);
  });
});
