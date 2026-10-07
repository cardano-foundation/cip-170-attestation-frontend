import { beforeAll, describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import { core } from '@meshsdk/core';
import {
  checkResolvedInputs,
  checkReturnedWitnessSet,
  matchOutputAddress,
  validateCosignTx,
} from '@/lib/claim-gates';
import { keyHashOfVkey, txIdOf } from '@/lib/claim-tx';
import { skipItem } from '@/lib/cbor-shape';
import { baseAddress, claimTxCbor, scriptAddress, SIGNER_KEY, STAKE_KEY } from './fixtures';

const { Cardano, Serialization } = core;
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');

let kp: any;
let other: any;
let kpHash: string;
beforeAll(async () => {
  await sodium.ready;
  kp = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(9));
  other = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(10));
  kpHash = keyHashOfVkey(toHex(kp.publicKey));
});

/** Insert an extra field into the body map of a tx (raw bytes) to emulate unknown or duplicate keys */
function withExtraBodyField(txHex: string, keyHex: string, valueHex: string): string {
  const bytes = Buffer.from(txHex, 'hex');
  // tx = 0x84, body map header right after
  const header = bytes[1];
  if (header < 0xa0 || header > 0xb7) throw new Error('fixture expects a small definite body map');
  const bodyEnd = skipItem(Uint8Array.from(bytes), 1);
  const patched = Buffer.concat([
    bytes.subarray(0, 1),
    Buffer.from([header + 1]),
    bytes.subarray(2, bodyEnd),
    Buffer.from(keyHex + valueHex, 'hex'),
    bytes.subarray(bodyEnd),
  ]);
  return patched.toString('hex');
}

function witnessSet(entries: [Uint8Array, Uint8Array][], txId: string): string {
  const set = new Serialization.TransactionWitnessSet();
  set.setVkeys(
    Serialization.CborSet.fromCore(
      entries.map(([pub, priv]) => [toHex(pub), toHex(sodium.crypto_sign_detached(Buffer.from(txId, 'hex'), priv))] as any),
      Serialization.VkeyWitness.fromCore
    )
  );
  return set.toCbor();
}

describe('body allow-list', () => {
  it('accepts the genuine claim shape', () => {
    expect(validateCosignTx(claimTxCbor(), [SIGNER_KEY], [], 'preprod').errors).toEqual([]);
  });

  it('refuses a body with a script data hash (Plutus)', () => {
    const tx = withExtraBodyField(claimTxCbor(), '0b', '5820' + '00'.repeat(32));
    const check = validateCosignTx(tx, [SIGNER_KEY], []);
    expect(check.ok).toBe(false);
    expect(check.errors.join()).toMatch(/fields a claim never needs \(11\)/);
  });

  it('refuses unknown and duplicate body keys', () => {
    expect(validateCosignTx(withExtraBodyField(claimTxCbor(), '1863', '00'), [SIGNER_KEY], []).ok).toBe(false);
    const dup = validateCosignTx(withExtraBodyField(claimTxCbor(), '02', '1a000f4240'), [SIGNER_KEY], []);
    expect(dup.ok).toBe(false);
    expect(dup.errors.join()).toMatch(/duplicate/);
  });

  it('refuses output addresses of another network', () => {
    expect(validateCosignTx(claimTxCbor(), [SIGNER_KEY], [], 'mainnet').ok).toBe(false);
  });
});

describe('resolved inputs', () => {
  const ref = { txHash: 'aa'.repeat(32), outputIndex: 0 };
  const payKey = (k: string) => Cardano.EnterpriseAddress.fromCredentials(0, { type: 0, hash: k as any }).toAddress().toBech32();

  it('refuses script-locked inputs (native script with the visitor key)', () => {
    expect(checkResolvedInputs([{ ...ref, address: scriptAddress }], [kpHash], new Set())[0]).toMatch(/script/);
  });

  it('refuses an input at a requested key, even with a foreign stake credential', () => {
    const addr = Cardano.BaseAddress.fromCredentials(0, { type: 0, hash: kpHash as any }, { type: 0, hash: STAKE_KEY as any })
      .toAddress()
      .toBech32();
    expect(checkResolvedInputs([{ ...ref, address: addr }], [kpHash], new Set())[0]).toMatch(/your key/);
  });

  it('refuses an input at a key the wallet holds', () => {
    const k = '3c'.repeat(28);
    expect(checkResolvedInputs([{ ...ref, address: payKey(k) }], [kpHash], new Set([k]))[0]).toMatch(/your key/);
  });

  it('refuses Byron inputs', () => {
    const byron = 'Ae2tdPwUPEZFRbyhz3cpfC2CumGzNkFBN2L42rcUc2yjQpEkxDbkPodpMAi';
    expect(checkResolvedInputs([{ ...ref, address: byron }], [kpHash], new Set())[0]).toMatch(/Byron/);
  });

  it('accepts the initiator key-locked inputs', () => {
    expect(checkResolvedInputs([{ ...ref, address: baseAddress }], [kpHash], new Set())).toEqual([]);
  });

  it('matches outputs by output_index, exactly once, never collateral', () => {
    const outputs = [
      { output_index: 1, address: 'second' },
      { output_index: 0, address: 'first' },
      { output_index: 2, address: 'coll', collateral: true },
    ];
    expect(matchOutputAddress(outputs, { txHash: 'aa'.repeat(32), outputIndex: 0 })).toBe('first');
    expect(() => matchOutputAddress(outputs, { txHash: 'aa'.repeat(32), outputIndex: 2 })).toThrow();
    expect(() => matchOutputAddress(outputs, { txHash: 'aa'.repeat(32), outputIndex: 5 })).toThrow();
    expect(() => matchOutputAddress([...outputs, { output_index: 0, address: 'dup' }], { txHash: 'aa'.repeat(32), outputIndex: 0 })).toThrow();
  });
});

describe('returned witness set', () => {
  it('accepts only requested-key signatures over this tx', async () => {
    const tx = claimTxCbor({ requiredSigners: [kpHash] });
    const id = txIdOf(tx);
    expect(await checkReturnedWitnessSet(witnessSet([[kp.publicKey, kp.privateKey]], id), id, [kpHash])).toEqual([]);
  });

  it('refuses an extra key the claim does not ask for', async () => {
    const id = txIdOf(claimTxCbor({ requiredSigners: [kpHash] }));
    const set = witnessSet([[kp.publicKey, kp.privateKey], [other.publicKey, other.privateKey]], id);
    expect((await checkReturnedWitnessSet(set, id, [kpHash])).join()).toMatch(/also signed/);
  });

  it('refuses bootstrap witnesses and other witness types', async () => {
    const id = txIdOf(claimTxCbor({ requiredSigners: [kpHash] }));
    const vkeysOnly = Buffer.from(witnessSet([[kp.publicKey, kp.privateKey]], id), 'hex');
    // add key 2 (bootstrap witnesses) with an empty array: map(1) -> map(2)
    expect(vkeysOnly[0]).toBe(0xa1);
    const patched = Buffer.concat([Buffer.from([0xa2]), vkeysOnly.subarray(1), Buffer.from('0280', 'hex')]).toString('hex');
    expect((await checkReturnedWitnessSet(patched, id, [kpHash])).join()).toMatch(/fields a claim never needs \(2\)/);
  });
});
