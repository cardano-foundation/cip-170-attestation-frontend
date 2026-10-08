// Veridian wallet as KERI signer: a browser-local KERIA agent pairs with the wallet over OOBIs and asks it
// to anchor a SAD in its KEL via /remotesign/ixn/req. Veridian anchors exactly { d: a.d } and replies with
// /remotesign/ixn/ref carrying the sequence number; we then verify the anchor in the wallet's KEL ourselves.

import {
  Ilks,
  Protocols,
  Saider,
  Serder,
  Serials,
  SignifyClient,
  Tier,
  b,
  randomPasscode,
  ready,
  versify,
} from 'signify-ts';

export const AGENT_IDENTIFIER_NAME = 'tx-attestation-app';
export const REMOTESIGN_REQ_ROUTE = '/remotesign/ixn/req';
export const REMOTESIGN_REF_ROUTES = ['/exn/remotesign/ixn/ref', '/remotesign/ixn/ref'];

const BRAN_KEY = 'keri-veridian-bran';
const WALLET_KEY = 'keri-veridian-wallet';
const REF_TIMEOUT_MS = 180_000;
const POLL_MS = 2_000;
const OP_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------------------------

/** KERI timestamp with 6 fractional digits, e.g. 2026-10-07T09:30:00.123000+00:00 */
export function keriTimestamp(date = new Date()): string {
  return date.toISOString().replace('Z', '000+00:00');
}

/**
 * Remotesign request exn whose `a` is exactly the payload SAD. signify-ts' exchange() prepends
 * `a.i = recipient`, which would change the SAID Veridian checks (`a.d == saidify(a)`) and anchors.
 */
export function buildRemotesignExn(senderAid: string, recipientAid: string, payloadSad: Record<string, any>, dt: string): Serder {
  const [, sad] = Saider.saidify({
    v: versify(Protocols.KERI, undefined, Serials.JSON, 0),
    t: Ilks.exn,
    d: '',
    i: senderAid,
    rp: recipientAid,
    p: '',
    dt,
    r: REMOTESIGN_REQ_ROUTE,
    q: {},
    a: payloadSad,
    e: {},
  });
  return new Serder(sad);
}

export interface RefContext {
  requestSaid: string;
  walletAid: string;
  ourAid: string;
}

/**
 * Sequence number from a remotesign reply, or null if the notification/exn is not the reply to our request.
 * The sender is taken from the fetched exn, never from the notification.
 */
export function matchRef(note: any, exn: any, ctx: RefContext): number | null {
  if (!note?.a || !REMOTESIGN_REF_ROUTES.includes(note.a.r)) return null;
  if (!exn || exn.r !== '/remotesign/ixn/ref') return null;
  if (exn.d !== note.a.d) return null;
  if (exn.p !== ctx.requestSaid || exn.i !== ctx.walletAid || exn.rp !== ctx.ourAid) return null;
  const sn = parseHexSn(exn.a?.sn);
  return sn;
}

/** Why a remotesign reply is not ours (for diagnostics); null when it matches */
export function explainRefMismatch(note: any, exn: any, ctx: RefContext): string | null {
  if (!note?.a || !REMOTESIGN_REF_ROUTES.includes(note.a.r)) return `route ${note?.a?.r}`;
  if (!exn) return 'exchange not found';
  if (exn.r !== '/remotesign/ixn/ref') return `exn route ${exn.r}`;
  if (exn.d !== note.a.d) return 'exn SAID differs from the notification';
  if (exn.p !== ctx.requestSaid) return `reply to another request (p=${exn.p})`;
  if (exn.i !== ctx.walletAid) return `sender ${exn.i} is not the paired wallet`;
  if (exn.rp !== ctx.ourAid) return `recipient ${exn.rp} is not this app`;
  if (parseHexSn(exn.a?.sn) === null) return `invalid sn ${exn.a?.sn}`;
  return null;
}

export const NOTES_PAGE_SIZE = 25;
const MAX_NOTE_PAGES = 40;

/**
 * Whether another page of notifications may exist. KERIA's total comes from the Content-Range header, which
 * browsers hide unless KERIA exposes it (it often does not: total reads 0), so a full page means "keep going".
 */
export function hasMoreNotePages(batchLength: number, collected: number, total: number): boolean {
  if (batchLength < NOTES_PAGE_SIZE) return false;
  return !(total > 0 && collected >= total);
}

export function parseHexSn(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]+$/.test(value)) return null;
  return parseInt(value, 16);
}

/**
 * Find the interaction event that anchors `{ d: said }` strictly after the floor. When the wallet reported a
 * sequence number, only that event counts; an older event sealing the same content must never satisfy a request.
 */
export function findAnchor(
  events: any[],
  said: string,
  floor: number,
  reportedSn?: number | null
): { sn: number; eventSaid: string } | null {
  for (const event of events) {
    const ked = event?.ked ?? event;
    if (!ked || ked.t !== 'ixn') continue;
    const sn = parseHexSn(ked.s);
    if (sn === null || sn <= floor) continue;
    if (reportedSn !== undefined && reportedSn !== null && sn !== reportedSn) continue;
    const seals: any[] = Array.isArray(ked.a) ? ked.a : [];
    if (seals.some((seal) => seal && seal.d === said)) return { sn, eventSaid: ked.d };
  }
  return null;
}

export function aidFromOobi(oobi: string): string | null {
  const match = /\/oobi\/([A-Za-z0-9_-]{44})(?:\/|$|\?)/.exec(oobi.trim());
  return match ? match[1] : null;
}

/** Witness threshold for a pool size (vault reference §3) */
export function witnessThreshold(count: number): number {
  if (count >= 10) return 7;
  if (count >= 9) return 6;
  if (count >= 7) return 5;
  if (count >= 6) return 4;
  return count;
}

export function witnessIdsFromIurls(iurls: string[]): string[] {
  const ids = iurls.map((url) => /\/oobi\/([A-Za-z0-9_-]{44})/.exec(url)?.[1]).filter((id): id is string => !!id);
  return Array.from(new Set(ids));
}

/** `replied` = the wallet already approved; retrying should re-check, not send a new request */
export class RemotesignError extends Error {
  constructor(
    message: string,
    readonly replied: boolean
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------
// Browser agent
// ---------------------------------------------------------------------------------------------

export interface PairedWallet {
  aid: string;
  oobi: string;
}

/** Persisted state of a running remote-sign request, so a reload can still accept the wallet's late reply */
export interface RemotesignState {
  requestSaid: string;
  said: string;
  floor: number;
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the pairing lasts for this page only
  }
}

/** Pairings belong to the app agent on one KERIA: another KERIA means another app AID the wallet never saw */
function walletKey(keriaUrl: string): string {
  return `${WALLET_KEY}:${keriaUrl.replace(/\/+$/, '')}`;
}

export function loadPairedWallet(keriaUrl: string): PairedWallet | null {
  const raw = storageGet(walletKey(keriaUrl));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.aid === 'string' && typeof parsed?.oobi === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function forgetPairedWallet(keriaUrl: string) {
  try {
    localStorage.removeItem(walletKey(keriaUrl));
  } catch {
    // ignore
  }
}

async function waitOp(client: SignifyClient, op: any, stage: string): Promise<any> {
  const done = await client.operations().wait(op, { signal: AbortSignal.timeout(OP_TIMEOUT_MS) });
  if (done?.error) throw new Error(`${stage} failed: ${JSON.stringify(done.error)}`);
  return done;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class VeridianAgent {
  private constructor(
    readonly client: SignifyClient,
    readonly aid: string,
    readonly oobi: string,
    readonly keriaUrl: string
  ) {}

  /** Connect (booting on first use) to the KERIA agent of this browser and make sure our witnessed AID exists */
  static async start(url: string, bootUrl: string): Promise<VeridianAgent> {
    await ready();
    // one passcode per KERIA: an agent lives on exactly one KERIA
    const branKey = `${BRAN_KEY}:${url.replace(/\/+$/, '')}`;
    let bran = storageGet(branKey);
    if (!bran) {
      bran = randomPasscode();
      storageSet(branKey, bran);
    }

    const client = new SignifyClient(url, bran, Tier.low, bootUrl);
    try {
      await client.connect();
    } catch {
      const res = await client.boot();
      if (!res.ok) throw new Error(`Could not boot a KERIA agent at ${bootUrl} (${res.status})`);
      await client.connect();
    }

    let hab: any;
    try {
      hab = await client.identifiers().get(AGENT_IDENTIFIER_NAME);
    } catch {
      const config: any = await client.config().get();
      const wits = witnessIdsFromIurls(config?.iurls ?? []);
      const result = await client.identifiers().create(AGENT_IDENTIFIER_NAME, {
        toad: witnessThreshold(wits.length),
        wits,
      });
      await waitOp(client, await result.op(), 'Creating the app identifier');
      hab = await client.identifiers().get(AGENT_IDENTIFIER_NAME);
    }

    let oobis = await client.oobis().get(AGENT_IDENTIFIER_NAME, 'agent');
    if (!oobis?.oobis?.length) {
      const role = await client.identifiers().addEndRole(AGENT_IDENTIFIER_NAME, 'agent', client.agent!.pre);
      await waitOp(client, await role.op(), 'Adding the agent end role');
      oobis = await client.oobis().get(AGENT_IDENTIFIER_NAME, 'agent');
    }
    const oobi = oobis?.oobis?.[0];
    if (!oobi) throw new Error('The KERIA agent returned no OOBI');
    console.info('[veridian] app agent ready', {
      aid: hab.prefix,
      witnesses: hab?.state?.b ?? [],
      witnessThreshold: hab?.state?.bt,
      oobi,
    });
    return new VeridianAgent(client, hab.prefix, oobi, url);
  }

  /** Resolve the wallet's OOBI and remember the pairing */
  async pairWallet(walletOobi: string): Promise<PairedWallet> {
    const aid = aidFromOobi(walletOobi);
    if (!aid) throw new Error('This does not look like a KERI OOBI (expected …/oobi/<AID>/…)');
    await this.resolve(walletOobi, aid);
    const wallet = { aid, oobi: walletOobi.trim() };
    storageSet(walletKey(this.keriaUrl), JSON.stringify(wallet));
    return wallet;
  }

  private async resolve(oobi: string, alias: string) {
    const op = await this.client.oobis().resolve(oobi, alias);
    await waitOp(this.client, op, 'Resolving the wallet OOBI');
  }

  private async kelFloor(walletAid: string): Promise<number> {
    const op = await this.client.keyStates().query(walletAid);
    await waitOp(this.client, op, 'Querying the wallet key state');
    const states = await this.client.keyStates().get(walletAid);
    const sn = parseHexSn((Array.isArray(states) ? states[0] : states)?.s);
    if (sn === null) throw new Error('Could not read the wallet key state (no KEL floor)');
    return sn;
  }

  private async listAllNotes(): Promise<any[]> {
    const notes: any[] = [];
    for (let page = 0; page < MAX_NOTE_PAGES; page++) {
      const start = page * NOTES_PAGE_SIZE;
      const result = await this.client.notifications().list(start, start + NOTES_PAGE_SIZE - 1);
      const batch: any[] = Array.isArray(result?.notes) ? result.notes : [];
      notes.push(...batch);
      if (!hasMoreNotePages(batch.length, notes.length, Number(result?.total) || 0)) break;
    }
    return notes;
  }

  private async unreadRefIds(): Promise<Set<string>> {
    const notes = await this.listAllNotes();
    return new Set(notes.filter((n) => !n.r && REMOTESIGN_REF_ROUTES.includes(n.a?.r)).map((n) => n.i));
  }

  private async waitForRef(
    wallet: PairedWallet,
    requestSaid: string,
    exclude: Set<string>,
    signal?: AbortSignal,
    onProgress?: (message: string) => void
  ): Promise<{ sn: number; noteId: string }> {
    const deadline = Date.now() + REF_TIMEOUT_MS;
    const ctx = { requestSaid, walletAid: wallet.aid, ourAid: this.aid };
    const reported = new Set<string>();
    let polls = 0;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const notes = await this.listAllNotes();
      polls++;
      for (const note of notes) {
        if (!exclude.has(note.i) && !reported.has(`seen:${note.i}`)) {
          reported.add(`seen:${note.i}`);
          console.info('[veridian] notification', { id: note.i, route: note.a?.r, said: note.a?.d, read: note.r, dt: note.dt });
        }
      }
      const refs = notes.filter((n) => REMOTESIGN_REF_ROUTES.includes(n.a?.r));
      onProgress?.(
        `Waiting for the wallet's reply… (${notes.length} notification(s) in this app's agent, ${refs.length} remotesign repl${refs.length === 1 ? 'y' : 'ies'}, check ${polls})`
      );
      for (const note of refs) {
        if (note.r || exclude.has(note.i)) continue;
        let exn: any = null;
        try {
          exn = (await this.client.exchanges().get(note.a.d))?.exn;
        } catch (err: any) {
          exn = null;
          if (!reported.has(note.i)) console.info('[veridian] could not fetch reply exchange', note.a.d, err?.message);
        }
        const sn = matchRef(note, exn, ctx);
        if (sn !== null) return { sn, noteId: note.i };
        // not ours: leave it untouched, another wait may own it
        if (!reported.has(note.i)) {
          reported.add(note.i);
          console.info('[veridian] ignoring remotesign reply', note.i, explainRefMismatch(note, exn, ctx));
        }
      }
      await sleep(POLL_MS);
    }
    throw new Error(
      `No reply from the wallet reached this app's KERI agent within 3 minutes (${polls} checks). If Veridian shows the request as signed, its reply was not delivered to ${this.aid.slice(0, 12)}…; check that the app agent has witnesses and that Veridian resolved the app OOBI.`
    );
  }

  private async verifyAnchor(
    wallet: PairedWallet,
    said: string,
    floor: number,
    sn: number,
    onProgress?: (message: string) => void
  ) {
    let lastError = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      onProgress?.(`The wallet signed event #${sn}. Reading its key event log to verify (attempt ${attempt + 1}/5)…`);
      try {
        // a contact resolved earlier is stale: refresh the wallet KEL before reading it
        await this.resolve(wallet.oobi, wallet.aid);
        const query = await this.client.keyStates().query(wallet.aid, sn.toString(16));
        await waitOp(this.client, query, 'Refreshing the wallet KEL');
        const events = await this.client.keyEvents().get(wallet.aid);
        const anchor = findAnchor(Array.isArray(events) ? events : [], said, floor, sn);
        if (anchor) return anchor;
      } catch (err: any) {
        lastError = err?.message ?? String(err);
        console.info('[veridian] KEL check failed', lastError);
      }
      await sleep(POLL_MS);
    }
    throw new RemotesignError(
      `The wallet replied, but no event after #${floor} in its KEL anchors ${said}${lastError ? ` (${lastError})` : ''}. Retry to check again.`,
      true
    );
  }

  /**
   * Ask the wallet to anchor `payloadSad` (`d` must be its SAID). With `resume`, no new request is sent and a
   * late reply to the persisted request is accepted, still checked against the persisted floor and the KEL.
   */
  async remoteSign(
    wallet: PairedWallet,
    payloadSad: Record<string, any>,
    opts: {
      resume?: RemotesignState;
      onRequestSent?: (state: RemotesignState) => void;
      onProgress?: (message: string) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<{ sn: number; eventSaid: string }> {
    const said = payloadSad.d;
    if (!new Saider({ qb64: said }).verify(payloadSad)) {
      throw new Error('Payload d is not the SAID of the payload; Veridian would drop the request');
    }

    let state = opts.resume && opts.resume.said === said ? opts.resume : undefined;
    let exclude = new Set<string>();
    if (!state) {
      const floor = await this.kelFloor(wallet.aid);
      exclude = await this.unreadRefIds();
      const hab = await this.client.identifiers().get(AGENT_IDENTIFIER_NAME);
      const exn = buildRemotesignExn(this.aid, wallet.aid, payloadSad, keriTimestamp());
      const sigs = await this.client.manager!.get(hab).sign(b(exn.raw));
      state = { requestSaid: exn.sad.d, said, floor };
      opts.onRequestSent?.(state);
      await this.client.exchanges().sendFromEvents(AGENT_IDENTIFIER_NAME, 'remotesign', exn, sigs, '', [wallet.aid]);
      console.info('[veridian] request sent', { requestSaid: state.requestSaid, anchoredSaid: said, floor: state.floor, from: this.aid, to: wallet.aid });
    }

    opts.onProgress?.('Request sent. Approve it in Veridian on your phone…');
    const { sn, noteId } = await this.waitForRef(wallet, state.requestSaid, exclude, opts.signal, opts.onProgress);
    console.info('[veridian] reply matched', { sn, noteId });
    const anchor = await this.verifyAnchor(wallet, said, state.floor, sn, opts.onProgress);
    try {
      await this.client.notifications().mark(noteId);
      await this.client.notifications().delete(noteId);
    } catch {
      // cleanup only
    }
    return anchor;
  }
}
