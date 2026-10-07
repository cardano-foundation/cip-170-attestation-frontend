import { beforeAll, describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import { core } from '@meshsdk/core';
import {
  addVerifiedVkeyWitnesses,
  inputKeysOf,
  keyHashOfVkey,
  mergeVkeyWitnesses,
  txIdOf,
  verifyWitnessSet,
  witnessedKeyHashes,
} from '@/lib/claim-tx';
import { baseAddress, claimTxCbor, PAY_KEY, sampleTxCbor } from './fixtures';

const { Serialization } = core;

const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function witnessSetHex(entries: { vkey: string; signature: string }[]): string {
  const set = new Serialization.TransactionWitnessSet();
  set.setVkeys(
    Serialization.CborSet.fromCore(
      entries.map((e) => [e.vkey, e.signature] as any),
      Serialization.VkeyWitness.fromCore
    )
  );
  return set.toCbor();
}

function sign(txId: string, kp: { publicKey: Uint8Array; privateKey: Uint8Array }) {
  return {
    vkey: toHex(kp.publicKey),
    signature: toHex(sodium.crypto_sign_detached(Buffer.from(txId, 'hex'), kp.privateKey)),
  };
}

let alice: any;
let bob: any;
beforeAll(async () => {
  await sodium.ready;
  alice = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(1));
  bob = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(2));
});

describe('mergeVkeyWitnesses', () => {
  it('rejects witnesses returned for another transaction ID', async () => {
    const tx = sampleTxCbor();
    const id = txIdOf(tx);
    await expect(
      mergeVkeyWitnesses(tx, witnessSetHex([sign(id, alice)]), { expectedTxId: 'ee'.repeat(32) })
    ).rejects.toThrow(/different transaction/);
  });

  it('adds a valid witness without changing the transaction ID', async () => {
    const tx = sampleTxCbor();
    const id = txIdOf(tx);
    const aliceHash = keyHashOfVkey(toHex(alice.publicKey));
    const { txHex, added } = await mergeVkeyWitnesses(tx, witnessSetHex([sign(id, alice)]), {
      allowedKeyHashes: new Set([aliceHash]),
      expectedTxId: id,
    });
    expect(added).toEqual([aliceHash]);
    expect(txIdOf(txHex)).toBe(id);
    expect(witnessedKeyHashes(txHex)).toEqual(new Set([aliceHash]));
  });

  it('merges a second party and drops duplicates', async () => {
    const tx = sampleTxCbor();
    const id = txIdOf(tx);
    const first = await mergeVkeyWitnesses(tx, witnessSetHex([sign(id, alice)]));
    const second = await mergeVkeyWitnesses(first.txHex, witnessSetHex([sign(id, alice), sign(id, bob)]));
    expect(second.added).toEqual([keyHashOfVkey(toHex(bob.publicKey))]);
    expect(witnessedKeyHashes(second.txHex).size).toBe(2);
    expect(txIdOf(second.txHex)).toBe(id);
  });

  it('rejects a signature over a different transaction', async () => {
    const tx = sampleTxCbor();
    await expect(mergeVkeyWitnesses(tx, witnessSetHex([sign('ff'.repeat(32), alice)]))).rejects.toThrow(
      /does not sign/
    );
  });

  it('rejects a key that is not expected', async () => {
    const tx = sampleTxCbor();
    const id = txIdOf(tx);
    await expect(
      mergeVkeyWitnesses(tx, witnessSetHex([sign(id, bob)]), { allowedKeyHashes: new Set(['00'.repeat(28)]) })
    ).rejects.toThrow(/not expected/);
  });
});

describe('inputKeysOf', () => {
  it('maps spent inputs to wallet payment keys', () => {
    const utxos = [{ input: { txHash: 'aa'.repeat(32), outputIndex: 0 }, output: { address: baseAddress } }];
    expect(inputKeysOf(sampleTxCbor(), utxos)).toEqual([PAY_KEY]);
  });

  it('fails when an input is not a known wallet UTxO', () => {
    expect(() => inputKeysOf(sampleTxCbor(), [])).toThrow(/Cannot determine/);
  });
});

describe('verified witnesses', () => {
  it('apply to a newer copy of the same tx but never to another tx', async () => {
    const tx = sampleTxCbor();
    const id = txIdOf(tx);
    const verified = await verifyWitnessSet(tx, witnessSetHex([sign(id, alice)]));
    // a newer copy that already holds bob's signature keeps it
    const newer = (await mergeVkeyWitnesses(tx, witnessSetHex([sign(id, bob)]))).txHex;
    const result = addVerifiedVkeyWitnesses(newer, verified);
    expect(witnessedKeyHashes(result.txHex).size).toBe(2);
    expect(() => addVerifiedVkeyWitnesses(claimTxCbor(), verified)).toThrow(/different transaction/);
  });
});

describe('spendableUtxos', () => {
  it('skips UTxOs that carry a reference script', async () => {
    const { spendableUtxos } = await import('@/lib/claim-tx');
    const plain = { input: { txHash: 'aa'.repeat(32), outputIndex: 0 }, output: { address: baseAddress } };
    const withScript = { input: { txHash: 'bb'.repeat(32), outputIndex: 0 }, output: { address: baseAddress, scriptRef: '8200581c' } };
    expect(spendableUtxos([withScript, plain] as any)).toEqual([plain]);
    expect(() => spendableUtxos([withScript] as any)).toThrow(/reference script/);
  });
});
