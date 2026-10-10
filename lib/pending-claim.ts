// Pending CLAIM_TX state (survives reloads) and the cosign link codec.
// Links carry data in the URL fragment, which browsers never send to a server.

import type { CardanoNetwork } from './network-config';
import { WorkflowStep } from './types';
import type { SignerKind } from './types';
import type { RequiredKey } from './required-keys';
import type { RemotesignState } from './veridian';
import { txIdOf } from './claim-tx';


export interface ClaimedTx {
  txHash: string;
  keys: RequiredKey[];
  linkingKey: string;
}

/** What the pending transaction carries in label 170 (only CLAIM_TX today) */
export type SealedTxKind = 'claim';

export interface PendingClaim {
  version: 1;
  /** Absent in older records: those are claims too */
  kind?: SealedTxKind;
  txId: string;
  txHex: string;
  network: CardanoNetwork;
  claimed: ClaimedTx[];
  ttlSlot: number;
  /** Payment keys of the spent wallet inputs; they must witness the tx too */
  inputKeys: string[];
  signerKind: SignerKind;
  aid: string;
  /** Non-secret Signify coordinates; the passcode is never stored */
  signify?: { identifierName: string; url: string };
  seal?: { said: string; sn: number };
  /** In-flight Veridian request, so a reload can accept the wallet's late reply */
  remotesign?: RemotesignState;
}

const STORAGE_KEY = 'keri-pending-claim';
const LINK_VERSION = '1';

export function loadPendingClaim(): PendingClaim | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isPendingClaim(parsed)) return { ...parsed, kind: parsed.kind ?? 'claim' };
    clearPendingClaim(); // unreadable or from an older build: never let it break the page
    return null;
  } catch {
    clearPendingClaim();
    return null;
  }
}

/** Shape check of stored data, including that the stored tx really has the stored ID */
export function isPendingClaim(value: any): value is PendingClaim {
  try {
    return (
      value?.version === 1 &&
      typeof value.txHex === 'string' &&
      typeof value.txId === 'string' &&
      typeof value.ttlSlot === 'number' &&
      typeof value.aid === 'string' &&
      (value.signerKind === 'signify' || value.signerKind === 'veridian') &&
      (value.kind === undefined || value.kind === 'claim') &&
      Array.isArray(value.inputKeys) &&
      Array.isArray(value.claimed) &&
      txIdOf(value.txHex) === value.txId
    );
  } catch {
    return false;
  }
}

export const PENDING_CLAIM_STORAGE_KEY = STORAGE_KEY;

/** The one place that shapes a stored pending tx, so what the page writes always passes isPendingClaim */
export function newPendingTx(args: {
  kind: SealedTxKind;
  txId: string;
  txHex: string;
  network: CardanoNetwork;
  claimed?: ClaimedTx[];
  ttlSlot: number;
  inputKeys: string[];
  signerKind: SignerKind;
  aid: string;
  keriaUrl: string;
  identifierName?: string;
}): PendingClaim {
  return {
    version: 1,
    kind: args.kind,
    txId: args.txId,
    txHex: args.txHex,
    network: args.network,
    claimed: args.claimed ?? [],
    ttlSlot: args.ttlSlot,
    inputKeys: args.inputKeys,
    signerKind: args.signerKind,
    aid: args.aid,
    // the KERIA URL also selects the Veridian agent and pairing on resume
    signify: { identifierName: args.identifierName ?? '', url: args.keriaUrl },
  };
}

/** Where a stored pending claim resumes: the step to show, and which earlier steps count as done */
export function resumeTarget(saved: PendingClaim): { step: WorkflowStep; completed: WorkflowStep[] } {
  return {
    step: saved.seal ? WorkflowStep.CLAIM_ANCHOR : WorkflowStep.CLAIM_SIGN,
    completed: [
      WorkflowStep.CONNECT_WALLET,
      WorkflowStep.INPUT_IDENTIFIER,
      WorkflowStep.INPUT_TX_HASH,
      WorkflowStep.CLAIM_KEYS,
      ...(saved.seal ? [WorkflowStep.CLAIM_SIGN] : []),
    ],
  };
}

export function savePendingClaim(claim: PendingClaim): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(claim));
  } catch {
    // storage unavailable: the claim lives only in memory
  }
}

export function clearPendingClaim(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface CosignRequest {
  network: CardanoNetwork;
  txHex: string;
  keys: string[];
}

const HEX_RE = /^[0-9a-f]+$/;
const NETWORKS: CardanoNetwork[] = ['mainnet', 'preprod', 'preview'];

export function encodeCosignLink(origin: string, req: CosignRequest): string {
  const params = new URLSearchParams({
    v: LINK_VERSION,
    net: req.network,
    tx: req.txHex.toLowerCase(),
    keys: req.keys.join(','),
  });
  return `${origin}/cosign#${params.toString()}`;
}

export function decodeCosignFragment(hash: string): CosignRequest {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('v') !== LINK_VERSION) throw new Error('Unsupported or missing link version');
  const network = params.get('net') as CardanoNetwork;
  if (!NETWORKS.includes(network)) throw new Error('Unknown network in link');
  const txHex = (params.get('tx') ?? '').toLowerCase();
  if (!txHex || !HEX_RE.test(txHex)) throw new Error('Link does not contain a transaction');
  const keys = (params.get('keys') ?? '').split(',').filter(Boolean);
  if (keys.some((k) => !/^[0-9a-f]{56}$/.test(k))) throw new Error('Link contains an invalid key hash');
  if (keys.length === 0) throw new Error('Link names no key to sign with');
  return { network, txHex, keys };
}

/** The return link always points at the origin serving the cosign page, never at a URL taken from the link */
export function encodeReturnLink(origin: string, txId: string, witnessSetHex: string): string {
  const params = new URLSearchParams({ tid: txId, cw: witnessSetHex.toLowerCase() });
  return `${origin.replace(/\/+$/, '')}/#${params.toString()}`;
}

export function decodeReturnFragment(hash: string): { txId: string; witnessSetHex: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const txId = params.get('tid') ?? '';
  const witnessSetHex = (params.get('cw') ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txId) || !witnessSetHex || !HEX_RE.test(witnessSetHex)) return null;
  return { txId, witnessSetHex };
}
