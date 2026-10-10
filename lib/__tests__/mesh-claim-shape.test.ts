import { describe, expect, it } from 'vitest';
import { MeshTxBuilder } from '@meshsdk/core';
import { validateCosignTx } from '@/lib/claim-gates';
import { transactionShape } from '@/lib/cbor-shape';
import { baseAddress, SIGNER_KEY } from './fixtures';

describe('a claim tx built by Mesh', () => {
  it('fits the cosign allow-list', async () => {
    const txHex = new MeshTxBuilder()
      .txIn('aa'.repeat(32), 0, [{ unit: 'lovelace', quantity: '10000000' }], baseAddress)
      .txOut(baseAddress, [{ unit: 'lovelace', quantity: '1000000' }])
      .changeAddress(baseAddress)
      .invalidHereafter(5000)
      .requiredSignerHash(SIGNER_KEY)
      .metadataValue(170, {
        t: 'CLAIM_TX',
        i: 'EKYLUMmNPZeEs77Zvclf0bSN5IN-mLfLpx2ySb-HDlk4',
        r: ['bb'.repeat(32)],
        v: { v: '1.1' },
      })
      .completeSync();
    const shape = transactionShape(txHex);
    expect(shape.bodyKeys.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 7, 14]);
    const check = validateCosignTx(txHex, [SIGNER_KEY], [], 'preprod');
    expect(check.errors).toEqual([]);
    expect(check.record?.r).toEqual(['bb'.repeat(32)]);
  });
});

describe('buildSealedTx', () => {
  const stubWallet = {
    getUsedAddresses: async () => [baseAddress],
    getChangeAddress: async () => baseAddress,
    getUtxos: async () => [
      { input: { txHash: 'aa'.repeat(32), outputIndex: 0 }, output: { address: baseAddress, amount: [{ unit: 'lovelace', quantity: '10000000' }] } },
    ],
  };

  it('puts the linking keys of a claim into required_signers', async () => {
    const { buildSealedTx, claimTxBodyInfo } = await import('@/lib/claim-tx');
    const { buildClaimTxMetadata } = await import('@/lib/cip170');
    const { txHex } = await buildSealedTx({
      walletApi: stubWallet,
      blockfrostApiKey: '',
      metadata: buildClaimTxMetadata('EKYLUMmNPZeEs77Zvclf0bSN5IN-mLfLpx2ySb-HDlk4', ['bb'.repeat(32)]),
      requiredSigners: [SIGNER_KEY],
      ttlSlot: 5000,
      builder: new MeshTxBuilder(),
    });
    expect(claimTxBodyInfo(txHex).requiredSigners).toEqual([SIGNER_KEY]);
    expect(claimTxBodyInfo(txHex).ttl).toBe(5000);
    const { txMetadataAsJs } = await import('@/lib/claim-gates');
    expect(txMetadataAsJs(txHex)['170'].t).toBe('CLAIM_TX');
    expect(Object.keys(txMetadataAsJs(txHex))).toEqual(['170']);
  });
});
