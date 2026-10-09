import { beforeAll, describe, expect, it } from 'vitest';
import { ready } from 'signify-ts';
import { buildClaimTxMetadata, txSeal } from '@/lib/cip170';

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

describe('metadataSeal', () => {
  it('matches the CIP-170 metadata seal test vector', async () => {
    const { metadataSeal } = await import('@/lib/cip170');
    const seal = metadataSeal(1447, 'EOpMIJmAaiP4cZgmDkg8rVtl8YU4dDYf_gxrK2sNdfOR');
    expect(seal.said).toBe('ELaRZ34Ynl9ohjeUXQmkl9ypwEGozin-L8P43gA-IDX7');
    expect(Object.keys(seal.sad)).toEqual(['d', 't', 'l', 'digest']);
    expect(seal.sad.l).toBe(1447);
    expect(metadataSeal('1447', 'EOpMIJmAaiP4cZgmDkg8rVtl8YU4dDYf_gxrK2sNdfOR').said).toBe(seal.said);
  });

  it('refuses labels it cannot serialise exactly', async () => {
    const { metadataSeal } = await import('@/lib/cip170');
    expect(() => metadataSeal('18446744073709551615', 'E')).toThrow(/too large/);
    expect(() => metadataSeal('01', 'E')).toThrow();
    expect(() => metadataSeal('x', 'E')).toThrow();
  });
});

describe('buildCIP170Metadata version', () => {
  it('keeps v 1.0 by default and uses 1.1 when asked', async () => {
    const { buildCIP170Metadata } = await import('@/lib/keri-utils');
    expect(buildCIP170Metadata(AID, 'Ed', 26, { '1447': 1 })['170']).toEqual({ t: 'ATTEST', i: AID, d: 'Ed', s: '1a', v: { v: '1.0' } });
    expect(buildCIP170Metadata(AID, 'Ed', 26, { '1447': 1 }, '1.1')['170'].v).toEqual({ v: '1.1' });
  });
});

describe('veridianAttestPlan', () => {
  const DIGEST = 'EOpMIJmAaiP4cZgmDkg8rVtl8YU4dDYf_gxrK2sNdfOR';

  it('attests the first label in numeric key order, as hashMetadata digests it', async () => {
    const { veridianAttestPlan, metadataSeal } = await import('@/lib/cip170');
    const cbor = { '1447': 'a1', '674': 'a2' };
    const plan = veridianAttestPlan(cbor, DIGEST);
    expect(plan.label).toBe('674');
    expect(plan.seal.said).toBe(metadataSeal(674, DIGEST).said);
  });

  it('matches the spec vector for label 1447', async () => {
    const { veridianAttestPlan } = await import('@/lib/cip170');
    expect(veridianAttestPlan({ '1447': 'x' }, DIGEST).seal.said).toBe('ELaRZ34Ynl9ohjeUXQmkl9ypwEGozin-L8P43gA-IDX7');
  });

  it('refuses when label 170 would be the attested label, or nothing is there', async () => {
    const { veridianAttestPlan, metadataSeal } = await import('@/lib/cip170');
    expect(() => veridianAttestPlan({ '170': 'x', '1447': 'y' }, DIGEST)).toThrow(/label 170/);
    expect(() => veridianAttestPlan({}, DIGEST)).toThrow();
    expect(() => veridianAttestPlan(null, DIGEST)).toThrow();
    expect(() => metadataSeal(170, DIGEST)).toThrow(/170/);
  });
});

describe('attestRecordAnchor', () => {
  const anchor = { said: 'Eseal', aid: 'Ewallet', digest: 'Edigest', sn: 7 };
  const base = { identifier: 'Ewallet', digest: 'Edigest', sequenceNumber: 3 };

  it('keeps Signify at v1.0 with its own sequence number, even if a Veridian anchor is lying around', async () => {
    const { attestRecordAnchor } = await import('@/lib/cip170');
    expect(attestRecordAnchor({ ...base, signerKind: 'signify', veridianAnchor: anchor })).toEqual({ version: '1.0', sn: 3 });
  });

  it('uses v1.1 and the anchor sn only for the wallet and digest the anchor was made for', async () => {
    const { attestRecordAnchor } = await import('@/lib/cip170');
    expect(attestRecordAnchor({ ...base, signerKind: 'veridian', veridianAnchor: anchor })).toEqual({ version: '1.1', sn: 7 });
    expect(() => attestRecordAnchor({ ...base, identifier: 'Eother', signerKind: 'veridian', veridianAnchor: anchor })).toThrow(/another identifier/);
    expect(() => attestRecordAnchor({ ...base, digest: 'Enew', signerKind: 'veridian', veridianAnchor: anchor })).toThrow(/other metadata/);
    expect(() => attestRecordAnchor({ ...base, signerKind: 'veridian', veridianAnchor: null })).toThrow(/not anchored/);
  });
});
