// One interface for anchoring a SAD in a KERI controller's KEL, whichever wallet holds the keys.

import { SignifyClient, ready } from 'signify-ts';
import type { PairedWallet, RemotesignState, VeridianAgent } from './veridian';

export interface AnchorResult {
  sn: number;
}

export interface AnchorOptions {
  resume?: RemotesignState;
  onRequestSent?: (state: RemotesignState) => void;
  onProgress?: (message: string) => void;
}

export interface KeriSigner {
  kind: 'signify' | 'veridian';
  aid: string;
  /** Anchor the seal { d: sad.d } in the controller's KEL; `sad.d` must be the SAID of `sad` */
  anchorSad(sad: Record<string, any>, opts?: AnchorOptions): Promise<AnchorResult>;
}

export function signifySigner(args: { url: string; passcode: string; identifierName: string; aid: string }): KeriSigner {
  return {
    kind: 'signify',
    aid: args.aid,
    async anchorSad(sad) {
      await ready();
      const client = new SignifyClient(args.url, args.passcode);
      await client.connect();
      // The passcode may belong to another agent with an identifier of the same name: never anchor there
      const hab = await client.identifiers().get(args.identifierName);
      if (hab?.prefix !== args.aid) {
        throw new Error(`Identifier "${args.identifierName}" on this agent is ${hab?.prefix ?? 'missing'}, not the claim signer ${args.aid}`);
      }
      const result = await client.identifiers().interact(args.identifierName, { d: sad.d });
      const op = await client.operations().wait(await result.op(), { signal: AbortSignal.timeout(60_000) });
      if ((op as any)?.error) throw new Error(`Interaction event failed: ${JSON.stringify((op as any).error)}`);
      return { sn: parseInt(result.serder.sad.s, 16) };
    },
  };
}

export function veridianSigner(agent: VeridianAgent, wallet: PairedWallet): KeriSigner {
  return {
    kind: 'veridian',
    aid: wallet.aid,
    anchorSad: (sad, opts) => agent.remoteSign(wallet, sad, opts),
  };
}
