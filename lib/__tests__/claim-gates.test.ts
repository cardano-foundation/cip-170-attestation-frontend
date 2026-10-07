import { beforeAll, describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import { ready } from 'signify-ts';
import { core } from '@meshsdk/core';
import { canAnchor, canSubmit, validateCosignTx } from '@/lib/claim-gates';
import { keyHashOfVkey, mergeVkeyWitnesses, txIdOf } from '@/lib/claim-tx';
import { txSeal } from '@/lib/cip170';
import { claimTxCbor, SIGNER_KEY } from './fixtures';

const { Serialization } = core;
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');

let kp: any;
let signerHash: string;
beforeAll(async () => {
  await sodium.ready;
  await ready();
  kp = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(7));
  signerHash = keyHashOfVkey(toHex(kp.publicKey));
});

async function witnessed(txHex: string) {
  const id = txIdOf(txHex);
  const set = new Serialization.TransactionWitnessSet();
  set.setVkeys(
    Serialization.CborSet.fromCore(
      [[toHex(kp.publicKey), toHex(sodium.crypto_sign_detached(Buffer.from(id, 'hex'), kp.privateKey))] as any],
      Serialization.VkeyWitness.fromCore
    )
  );
  return (await mergeVkeyWitnesses(txHex, set.toCbor())).txHex;
}

describe('canAnchor', () => {
  it('requires every required signer to be witnessed first', async () => {
    const tx = claimTxCbor({ requiredSigners: [signerHash] });
    expect(canAnchor({ txHex: tx, inputKeys: [], tipSlot: 10, hasSeal: false }).ok).toBe(false);
    expect(canAnchor({ txHex: await witnessed(tx), inputKeys: [], tipSlot: 10, hasSeal: false }).ok).toBe(true);
  });

  it('refuses after the TTL or when already anchored', async () => {
    const tx = await witnessed(claimTxCbor({ requiredSigners: [signerHash], ttl: 100 }));
    expect(canAnchor({ txHex: tx, inputKeys: [], tipSlot: 100, hasSeal: false }).ok).toBe(false);
    expect(canAnchor({ txHex: tx, inputKeys: [], tipSlot: 10, hasSeal: true }).ok).toBe(false);
  });
});

describe('input keys', () => {
  it('also require the fee payer input keys before anchoring and submitting', async () => {
    const tx = await witnessed(claimTxCbor({ requiredSigners: [signerHash] }));
    const feePayer = '12'.repeat(28);
    expect(canAnchor({ txHex: tx, inputKeys: [feePayer], tipSlot: 10, hasSeal: false }).ok).toBe(false);
    expect(
      canSubmit({ txHex: tx, inputKeys: [feePayer], tipSlot: 10, networkMagic: 2, seal: txSeal(2, txIdOf(tx)) }).ok
    ).toBe(false);
    expect(canAnchor({ txHex: tx, inputKeys: [signerHash], tipSlot: 10, hasSeal: false }).ok).toBe(true);
  });
});

describe('canSubmit', () => {
  it('requires the seal of the final transaction ID', async () => {
    const tx = await witnessed(claimTxCbor({ requiredSigners: [signerHash] }));
    const seal = txSeal(2, txIdOf(tx));
    expect(canSubmit({ txHex: tx, inputKeys: [], tipSlot: 10, networkMagic: 2, seal }).ok).toBe(true);
    expect(canSubmit({ txHex: tx, inputKeys: [], tipSlot: 10, networkMagic: 1, seal }).ok).toBe(false);
    expect(canSubmit({ txHex: tx, inputKeys: [], tipSlot: 10, networkMagic: 2 }).ok).toBe(false);
    expect(canSubmit({ txHex: tx, inputKeys: [], tipSlot: 2000, networkMagic: 2, seal }).ok).toBe(false);
  });

  it('refuses when a required signature is missing', () => {
    const tx = claimTxCbor({ requiredSigners: [signerHash] });
    expect(canSubmit({ txHex: tx, inputKeys: [], tipSlot: 10, networkMagic: 2, seal: txSeal(2, txIdOf(tx)) }).ok).toBe(false);
  });
});

describe('validateCosignTx', () => {
  it('accepts a CLAIM_TX that asks for a listed required signer', () => {
    const check = validateCosignTx(claimTxCbor(), [SIGNER_KEY], []);
    expect(check.errors).toEqual([]);
    expect(check.ok).toBe(true);
    expect(check.record?.t).toBe('CLAIM_TX');
  });

  it('refuses keys that are not required signers', () => {
    expect(validateCosignTx(claimTxCbor(), ['00'.repeat(28)], []).ok).toBe(false);
    expect(validateCosignTx(claimTxCbor(), [], []).ok).toBe(false);
  });

  it('refuses when the transaction spends the connected wallet UTxOs', () => {
    const check = validateCosignTx(claimTxCbor(), [SIGNER_KEY], [{ txHash: 'aa'.repeat(32), outputIndex: 0 }]);
    expect(check.ok).toBe(false);
    expect(check.errors.join()).toMatch(/spends UTxOs/);
  });

  it('refuses non-claim metadata and certificates', () => {
    const notClaim = claimTxCbor({ record: new Map<any, any>([['t', 'ATTEST']]) });
    expect(validateCosignTx(notClaim, [SIGNER_KEY], []).ok).toBe(false);
    expect(validateCosignTx(claimTxCbor({ withCert: true }), [SIGNER_KEY], []).ok).toBe(false);
  });
});
