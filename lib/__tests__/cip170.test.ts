import { beforeAll, describe, expect, it } from 'vitest';
import { ready, Saider } from 'signify-ts';
import {
  attestSadPayload,
  buildAttestSadMetadata,
  buildClaimTxMetadata,
  txSeal,
} from '@/lib/cip170';

const SPEC_TX = '4b1c6f3e3c0a6c5e2f9d7a8b1e0c4d5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3';
const AID = 'EKYLUMmNPZeEs77Zvclf0bSN5IN-mLfLpx2ySb-HDlk4';

beforeAll(async () => {
  await ready();
});

describe('txSeal', () => {
  it('matches the spec test vector on mainnet', () => {
    expect(txSeal(764824073, SPEC_TX).said).toBe('EOm0xWcPpijf-XF1T_cA8LcDm-99_MdNtZhCjPk4xC2_');
  });

  it('matches the spec test vector on preprod', () => {
    expect(txSeal(1, SPEC_TX).said).toBe('EIe4UUF0iPy-cZCdXIO7o7FcJhcYqZh-Gdq_Ya2z-azj');
  });

  it('keeps the spec key order d, t, n, txHash', () => {
    expect(Object.keys(txSeal(2, SPEC_TX).sad)).toEqual(['d', 't', 'n', 'txHash']);
  });

  it('rejects uppercase or short transaction IDs', () => {
    expect(() => txSeal(1, SPEC_TX.toUpperCase())).toThrow();
    expect(() => txSeal(1, SPEC_TX.slice(2))).toThrow();
  });
});

describe('attestSadPayload', () => {
  it('saidifies { i, d, metadataLabel, metadataDigest } in that order', () => {
    const { said, sad } = attestSadPayload(AID, '1447', 'EOpMIJmAaiP4cZgmDkg8rVtl8YU4dDYf_gxrK2sNdfOR');
    expect(Object.keys(sad)).toEqual(['i', 'd', 'metadataLabel', 'metadataDigest']);
    expect(sad.d).toBe(said);
    expect(said).toHaveLength(44);
    expect(new Saider({ qb64: said }).verify(sad)).toBe(true);
  });

  it('rejects a non-decimal label', () => {
    expect(() => attestSadPayload(AID, 'x1', 'E')).toThrow();
  });
});

describe('buildAttestSadMetadata', () => {
  it('marks the SAD variant and keeps original labels except 170', () => {
    const meta = buildAttestSadMetadata(AID, 'Esaid', 26, { '1447': { a: 1 }, '170': { t: 'X' } });
    expect(meta['170']).toEqual({ t: 'ATTEST', i: AID, d: 'Esaid', s: '1a', v: { v: '1.1', s: 'SAD' } });
    expect(meta['1447']).toEqual({ a: 1 });
  });
});

describe('buildClaimTxMetadata', () => {
  it('builds CLAIM_TX without a sequence number', () => {
    const meta = buildClaimTxMetadata(AID, [SPEC_TX]);
    expect(meta['170']).toEqual({ t: 'CLAIM_TX', i: AID, r: [SPEC_TX], v: { v: '1.1' } });
    expect(meta['170']).not.toHaveProperty('s');
  });

  it('normalises and dedupes claimed IDs', () => {
    const meta = buildClaimTxMetadata(AID, [SPEC_TX.toUpperCase(), ` ${SPEC_TX} `]);
    expect(meta['170'].r).toEqual([SPEC_TX]);
  });

  it('rejects an empty or malformed list', () => {
    expect(() => buildClaimTxMetadata(AID, [])).toThrow();
    expect(() => buildClaimTxMetadata(AID, ['abc'])).toThrow();
  });
});

describe('metadatumDigestInTx', () => {
  it('digests the raw metadatum bytes of a label in a built tx', async () => {
    const { metadatumDigestInTx } = await import('@/lib/keri-utils');
    const { claimTxCbor } = await import('./fixtures');
    const { core } = await import('@meshsdk/core');
    const tx = claimTxCbor();
    const bytes = core.Serialization.Transaction.fromCbor(tx as any).auxiliaryData()!.metadata()!.metadata()!.get(170n)!.toCbor();
    const expected = new (await import('signify-ts')).Diger({}, Uint8Array.from(Buffer.from(bytes, 'hex'))).qb64;
    expect(metadatumDigestInTx(tx, '170')).toBe(expected);
    expect(metadatumDigestInTx(tx, '1447')).toBeNull();
  });
});
