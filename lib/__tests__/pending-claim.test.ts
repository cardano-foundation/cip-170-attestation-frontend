import { describe, expect, it } from 'vitest';
import {
  decodeCosignFragment,
  decodeReturnFragment,
  encodeCosignLink,
  encodeReturnLink,
} from '@/lib/pending-claim';

const KEY = 'ab'.repeat(28);

describe('cosign link', () => {
  it('round-trips through the fragment', () => {
    const link = encodeCosignLink('https://app.example', {
      network: 'preview',
      txHex: '84A400',
      keys: [KEY],
    });
    expect(link.startsWith('https://app.example/cosign#')).toBe(true);
    const decoded = decodeCosignFragment(new URL(link).hash);
    expect(decoded).toEqual({ network: 'preview', txHex: '84a400', keys: [KEY] });
  });

  it('rejects tampered content', () => {
    expect(() => decodeCosignFragment(`#v=1&net=mainnet&tx=zz&keys=${KEY}`)).toThrow();
    expect(() => decodeCosignFragment(`#v=1&net=foo&tx=84&keys=${KEY}`)).toThrow();
    expect(() => decodeCosignFragment('#v=1&net=mainnet&tx=84&keys=abc')).toThrow();
    expect(() => decodeCosignFragment('#v=1&net=mainnet&tx=84')).toThrow(/no key/);
    expect(() => decodeCosignFragment(`#net=mainnet&tx=84&keys=${KEY}`)).toThrow();
  });
});

describe('return link', () => {
  it('round-trips the witness set and tx id', () => {
    const tid = 'cd'.repeat(32);
    const link = encodeReturnLink('https://app.example/', tid, 'A10081');
    expect(link).toBe(`https://app.example/#tid=${tid}&cw=a10081`);
    expect(decodeReturnFragment(new URL(link).hash)).toEqual({ txId: tid, witnessSetHex: 'a10081' });
  });

  it('ignores unrelated fragments', () => {
    expect(decodeReturnFragment('#foo=bar')).toBeNull();
    expect(decodeReturnFragment('')).toBeNull();
  });
});

describe('isPendingClaim', () => {
  it('accepts a well-formed claim whose tx has the stored ID', async () => {
    const { isPendingClaim } = await import('@/lib/pending-claim');
    const { claimTxCbor } = await import('./fixtures');
    const { txIdOf } = await import('@/lib/claim-tx');
    const txHex = claimTxCbor();
    const claim = {
      version: 1,
      txId: txIdOf(txHex),
      txHex,
      network: 'preview',
      claimed: [],
      ttlSlot: 1000,
      inputKeys: [],
      signerKind: 'signify',
      aid: 'Eaid',
    };
    expect(isPendingClaim(claim)).toBe(true);
    expect(isPendingClaim({ ...claim, inputKeys: undefined })).toBe(false);
    expect(isPendingClaim({ ...claim, txId: 'ff'.repeat(32) })).toBe(false);
    expect(isPendingClaim({ ...claim, txHex: 'zz' })).toBe(false);
  });
});

describe('pending kind', () => {
  it('reads records without a kind as claims and rejects other kinds', async () => {
    const { isPendingClaim } = await import('@/lib/pending-claim');
    const { claimTxCbor } = await import('./fixtures');
    const { txIdOf } = await import('@/lib/claim-tx');
    const txHex = claimTxCbor();
    const base = { version: 1, txId: txIdOf(txHex), txHex, network: 'preview', claimed: [], ttlSlot: 1, inputKeys: [], signerKind: 'veridian', aid: 'E' };
    expect(isPendingClaim(base)).toBe(true);
    expect(isPendingClaim({ ...base, kind: 'claim' })).toBe(true);
    expect(isPendingClaim({ ...base, kind: 'attest_tx' })).toBe(false);
  });
});

describe('newPendingTx and resumeTarget', () => {
  it('writes records that pass the load check and resume at the right step', async () => {
    const { isPendingClaim, newPendingTx, resumeTarget } = await import('@/lib/pending-claim');
    const { WorkflowStep } = await import('@/lib/types');
    const { claimTxCbor } = await import('./fixtures');
    const { txIdOf } = await import('@/lib/claim-tx');
    const txHex = claimTxCbor();
    const common = { txId: txIdOf(txHex), txHex, network: 'preprod' as const, ttlSlot: 9, inputKeys: ['ab'], aid: 'E', keriaUrl: 'https://keria' };

    const claim = newPendingTx({ ...common, kind: 'claim', signerKind: 'signify', identifierName: 'me' });
    expect(isPendingClaim(claim)).toBe(true);
    const sealed = { ...claim, seal: { said: 'Es', sn: 3 } };
    expect(resumeTarget(sealed).step).toBe(WorkflowStep.CLAIM_ANCHOR);
    expect(resumeTarget(sealed).completed).toContain(WorkflowStep.CLAIM_KEYS);

    expect(resumeTarget(claim).step).toBe(WorkflowStep.CLAIM_SIGN);
    expect(resumeTarget(claim).completed).not.toContain(WorkflowStep.CLAIM_SIGN);
  });
});
