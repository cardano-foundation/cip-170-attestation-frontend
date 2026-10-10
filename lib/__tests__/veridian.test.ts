import { beforeAll, describe, expect, it } from 'vitest';
import { ready, Saider } from 'signify-ts';
import {
  aidFromOobi,
  buildRemotesignExn,
  findAnchor,
  matchRef,
  witnessIdsFromIurls,
  witnessThreshold,
} from '@/lib/veridian';
import { txSeal } from '@/lib/cip170';

const OUR = 'EAgentAidAgentAidAgentAidAgentAidAgentAidAg1';
const WALLET = 'EWalletAidWalletAidWalletAidWalletAidWalletA';
const TX = '4b1c6f3e3c0a6c5e2f9d7a8b1e0c4d5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3';

beforeAll(async () => {
  await ready();
});

describe('buildRemotesignExn', () => {
  it('sends the transaction seal object unchanged as `a`', () => {
    const seal = txSeal(764824073, TX);
    const exn = buildRemotesignExn(OUR, WALLET, seal.sad, '2026-10-07T09:00:00.000000+00:00');
    expect(exn.sad.a).toEqual(seal.sad);
    expect(Object.keys(exn.sad.a)).toEqual(['d', 't', 'n', 'txHash']);
    expect(exn.sad.a.d).toBe('EOm0xWcPpijf-XF1T_cA8LcDm-99_MdNtZhCjPk4xC2_');
    // what Veridian checks before anchoring
    expect(Saider.saidify({ ...exn.sad.a, d: '' })[1].d).toBe(exn.sad.a.d);
  });

  it('has a valid envelope SAID, route and parties', () => {
    const payload = txSeal(1, TX);
    const exn = buildRemotesignExn(OUR, WALLET, payload.sad, '2026-10-07T09:00:00.000000+00:00');
    expect(exn.sad).toMatchObject({ t: 'exn', i: OUR, rp: WALLET, r: '/remotesign/ixn/req', p: '' });
    expect(new Saider({ qb64: exn.sad.d }).verify(exn.sad)).toBe(true);
    // never the `i` signify's exchange() would inject
    expect(exn.sad.a).not.toHaveProperty('i');
  });
});

describe('matchRef', () => {
  const ctx = { requestSaid: 'Ereq', walletAid: WALLET, ourAid: OUR };
  const note = { i: 'n1', a: { r: '/exn/remotesign/ixn/ref', d: 'Eref' } };
  const exn = { r: '/remotesign/ixn/ref', d: 'Eref', p: 'Ereq', i: WALLET, rp: OUR, a: { sn: '1a' } };

  it('returns the hex sequence number of our reply', () => {
    expect(matchRef(note, exn, ctx)).toBe(26);
    expect(matchRef({ ...note, a: { ...note.a, r: '/remotesign/ixn/ref' } }, exn, ctx)).toBe(26);
  });

  it('ignores replies to other requests, from other senders or with a mismatched SAID', () => {
    expect(matchRef(note, { ...exn, p: 'Eother' }, ctx)).toBeNull();
    expect(matchRef(note, { ...exn, i: OUR }, ctx)).toBeNull();
    expect(matchRef(note, { ...exn, rp: WALLET }, ctx)).toBeNull();
    expect(matchRef(note, { ...exn, d: 'Eforged' }, ctx)).toBeNull();
    expect(matchRef({ ...note, a: { ...note.a, r: '/ipex/grant' } }, exn, ctx)).toBeNull();
    expect(matchRef(note, { ...exn, a: { sn: 'zz' } }, ctx)).toBeNull();
  });
});

describe('findAnchor', () => {
  const events = [
    { ked: { t: 'icp', s: '0', d: 'E0', a: [] } },
    { ked: { t: 'ixn', s: '3', d: 'E3', a: [{ d: 'Eseal' }] } },
    { ked: { t: 'ixn', s: '5', d: 'E5', a: [{ d: 'Eseal' }] } },
  ];

  it('finds the anchoring event after the floor', () => {
    expect(findAnchor(events, 'Eseal', 3, 5)).toEqual({ sn: 5, eventSaid: 'E5' });
    expect(findAnchor(events, 'Eseal', 3)).toEqual({ sn: 5, eventSaid: 'E5' });
  });

  it('never accepts an event at or before the floor', () => {
    expect(findAnchor(events, 'Eseal', 5)).toBeNull();
    expect(findAnchor(events, 'Eseal', 2, 3)).toEqual({ sn: 3, eventSaid: 'E3' });
    expect(findAnchor(events, 'Eseal', 3, 3)).toBeNull();
  });

  it('requires the reported event to carry the seal', () => {
    expect(findAnchor(events, 'Eother', 0)).toBeNull();
    expect(findAnchor(events, 'Eseal', 0, 4)).toBeNull();
  });
});

describe('helpers', () => {
  it('parses the AID from an agent OOBI', () => {
    expect(aidFromOobi(`https://keria.example/oobi/${WALLET}/agent/EAgentEidAgentEidAgentEidAgentEidAgentEidAg`)).toBe(WALLET);
    expect(aidFromOobi('https://example.com/nothing')).toBeNull();
  });

  it('derives witness ids and thresholds', () => {
    const w = 'BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha';
    expect(witnessIdsFromIurls([`http://w:5642/oobi/${w}/controller`, `http://w:5642/oobi/${w}/controller`])).toEqual([w]);
    expect([3, 6, 7, 9, 10].map(witnessThreshold)).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('notification paging', () => {
  it('keeps paging on a full page when KERIA hides the total (Content-Range not exposed)', async () => {
    const { hasMoreNotePages } = await import('@/lib/veridian');
    expect(hasMoreNotePages(25, 25, 0)).toBe(true);
    expect(hasMoreNotePages(25, 50, 0)).toBe(true);
    expect(hasMoreNotePages(7, 32, 0)).toBe(false);
  });

  it('stops once the reported total is reached', async () => {
    const { hasMoreNotePages } = await import('@/lib/veridian');
    expect(hasMoreNotePages(25, 25, 25)).toBe(false);
    expect(hasMoreNotePages(25, 25, 40)).toBe(true);
  });
});

describe('explainRefMismatch', () => {
  it('names why a reply is not ours', async () => {
    const { explainRefMismatch } = await import('@/lib/veridian');
    const ctx = { requestSaid: 'Ereq', walletAid: WALLET, ourAid: OUR };
    const note = { a: { r: '/exn/remotesign/ixn/ref', d: 'Eref' } };
    const exn = { r: '/remotesign/ixn/ref', d: 'Eref', p: 'Ereq', i: WALLET, rp: OUR, a: { sn: '2' } };
    expect(explainRefMismatch(note, exn, ctx)).toBeNull();
    expect(explainRefMismatch(note, { ...exn, p: 'Eold' }, ctx)).toMatch(/another request/);
    expect(explainRefMismatch(note, null, ctx)).toMatch(/not found/);
  });
});
