# Veridian signer mode + CIP-170 CLAIM_TX — Implementation Plan

## Goal (from the goal gate, user-approved answers)
Add a second KERI signer (Veridian mobile wallet via remotesign, through an auto browser agent) next to the
existing Signify agent, and a second attestation type, `CLAIM_TX` (CIP-170 v1.1), with multi-party witness
collection via copy/paste or a serverless cosign link.

User decisions: (1) Veridian for **both** flows — ATTEST via the SAD payload variant (`v:{v:"1.1",s:"SAD"}`,
knowingly outside the current spec text), CLAIM_TX fully per spec. (2) Auto browser agent (bran in
localStorage, KERIA from env). (3) Serverless link round-trip (tx in `#fragment`, witness returned by link/text).

## Scope / constraints
- Frontend only (Next.js 16, client components). No backend, no new server state.
- Signify + ATTEST path must stay behaviourally identical (same metadata bytes, same steps).
- Spec: `CIP-0170/README.md` @ `docs/cip-170-tx-attestation` (Kammerlo fork). Seal recipe verified against
  both spec test vectors with `Saider.saidify` (mainnet `EOm0xWcP…`, preprod `EIe4UUF0…`).
- Veridian behaviour (vault `keri-flow-complete-reference` §7–8, G9/G10): drops requests whose `a.d ≠ saidify(a)`,
  anchors exactly `{d: a.d}`, replies `/remotesign/ixn/ref` with `a.sn`.
- New deps: `qrcode.react` (agent-OOBI QR for the phone), `vitest` (dev, unit tests). No other deps.

─────────────────────────────────────

## Summary
The wizard gains a **signer choice** on the identifier step (Signify form as today | Veridian pairing card)
and a **flow choice** on the transaction step (Attest metadata | Claim transactions). All KERI anchoring
goes through one `KeriSigner` interface with two implementations, so both flows work with both signers.
CLAIM_TX resolves each claimed tx's required keys from Blockfrost, builds a claim tx with
`required_signers` + TTL + `170 CLAIM_TX`, collects vkey witnesses (connected wallet first, then any
missing linking key via paste or a `/cosign#…` link where the key owner signs with CIP-30), anchors the
transaction seal, checks the final tx id, and submits. Pending claims survive reloads in localStorage so
the return link resumes them.

## Diagram — CLAIM_TX with a remote cosigner and Veridian

```mermaid
sequenceDiagram
  participant U as Initiator (this app)
  participant BF as Blockfrost
  participant W as Connected CIP-30 wallet
  participant C as Cosigner (/cosign page + own CIP-30 wallet)
  participant A as Browser KERI agent (KERIA)
  participant V as Veridian wallet
  U->>BF: /txs/{h}/utxos + /txs/{h}/cbor for each claimed tx
  BF-->>U: required keys (inputs, required_signers, withdrawals, certs)
  U->>U: pick linking key per tx; build claim tx (required_signers, TTL, 170 CLAIM_TX); txId
  U->>W: signTx(partial) → fee-payer (+ owned linking) witnesses
  U->>C: link /cosign#tx=<cbor>&… (or copy CBOR)
  C->>C: show summary, signTx(partial), return #cw=<witnessSet>
  C-->>U: return link / pasted witness set → verify sig over txId + key hash, merge
  U->>A: remotesign req a={d,t:"cardano-tx-attest",n,txHash} (saidified)
  A->>V: /remotesign/ixn/req
  V-->>A: /remotesign/ixn/ref {sn}
  U->>A: re-resolve wallet OOBI, read KEL, find ixn s>floor with seal {d}
  U->>U: assert final txId == anchored txHash, TTL not passed
  U->>BF: submit (or wallet.submitTx)
```

## Change map

```
lib/
  cip170.ts                    +120  new: txSeal, attestSadPayload, build ATTEST/ATTEST-SAD/CLAIM_TX metadata
  keri-utils.ts                ~5    keep hashMetadata; buildCIP170Metadata untouched (re-exported)
  signer.ts                    +80   new: KeriSigner interface + SignifySigner (interact)
  veridian.ts                  +230  new: browser agent bootstrap, pairing, remotesign req/ref, KEL check
  required-keys.ts             +130  new: required keys of a tx from Blockfrost utxos + body CBOR
  claim-tx.ts                  +170  new: build claim tx, witness extract/verify/merge, submit, TTL
  pending-claim.ts             +70   new: localStorage persistence + link (fragment) encode/decode
  types.ts                     ~25   flow + signer enums, new claim steps
  config.ts                    +15   Veridian KERIA url/boot url env
  network-config.ts            ~0    (reuse getNetworkMagic)
  __tests__/*.test.ts          +200  seal vectors, SAD payload, metadata shapes, required keys, witness merge, link codec
components/
  SignerModeSelect.tsx         +70   two-option segmented card (Signify | Veridian)
  VeridianPairing.tsx          +190  agent OOBI (QR + copy), wallet OOBI paste, status
  FlowSelect.tsx               +50   Attest metadata | Claim transactions
  ClaimTxInput.tsx             +110  list of tx hashes → required keys, linking-key picker, ownership badge
  ClaimSign.tsx                +200  tx id, witness checklist, copy CBOR, paste witness, cosign link
  ProgressTracker.tsx          ~20   steps passed in as a prop (flow-dependent)
  WalletConnection.tsx         ~5    optional title/subtitle props (reused on /cosign)
app/
  page.tsx                     ~250  wire signer/flow, Veridian anchoring in ATTEST, claim steps, resume
  cosign/page.tsx              +220  new: cosigner page (connect, summary, sign, return link)
package.json                   ~4    qrcode.react, vitest, "test" script
.env.example                   +4    NEXT_PUBLIC_SIGNIFY_BOOT_URL, NEXT_PUBLIC_BLOCKFROST_PROJECT_ID (Veridian agent reuses the Signify KERIA)
.gitignore                     +1    "app/Staging credential" (contains secrets)
```
No ⚠ items: no schema, auth, public API or module boundary. Funds-adjacent: the claim tx spends the
initiator's UTxOs (fee + 1 ADA self-output) — same pattern as today's publish.

## Risk table

| # | Change | Risk | Why | Review this |
|---|---|---|---|---|
| 1 | `claim-tx.ts` witness verify + merge, txId-before/after check | High | Wrong merge ⇒ invalid tx or body change ⇒ seal for a tx that never lands | Read line-by-line |
| 2 | `veridian.ts` remotesign correlation + KEL seal check | High | Accepting a stale/foreign ref or an old event = false attestation | Read line-by-line |
| 3 | `cip170.ts` seal + SAD payload key order | High | Any byte drift ⇒ verifiers can't recompute | Read; tests pin vectors |
| 4 | `required-keys.ts` | Med | Missing a key type only limits choice; wrong hash ⇒ claim unverifiable | Read |
| 5 | Cosign link / pending-claim persistence | Med | Fragment never sent to server; must reject mismatched txId | Read |
| 6 | `page.tsx` wiring | Med | Must not alter Signify+ATTEST bytes | Diff the ATTEST path carefully |
| 7 | UI components | Low | Visual only, reuse existing classes | Skim |
| 8 | Tests, env, deps | Low | — | Skim |

## Acceptance criteria
- [ ] A1 Identifier step offers Signify | Veridian; Signify path unchanged (manual: same metadata JSON as before for same inputs).
- [ ] A2 Veridian: agent boots once per browser (bran persisted), agent OOBI shown as QR + copy, wallet OOBI pasted & resolved, wallet AID shown, session remembered.
- [ ] A3 Remotesign: KEL floor taken, request saidified, ref matched on `r` (both forms), `exn.d==note.a.d`, `p`,`i`,`rp`, pre-send snapshot excluded (except a late ref whose `p` equals the persisted requestSaid, still checked against the persisted floor + KEL), KEL re-resolved, ixn `s>floor` contains `{d}` (unit-tested matcher).
- [ ] A4 ATTEST+Veridian emits `{t:"ATTEST",i,d:SAID(P),s,v:{v:"1.1",s:"SAD"}}`, P key order `i,d,metadataLabel,metadataDigest` (test).
- [ ] A5 Claim flow: ≥1 tx hash, required keys listed per tx with role + "in connected wallet" badge, one linking key per tx required.
- [ ] A6 Claim tx: `required_signers`, `invalidHereafter = tip+86400`, `170 = {t:"CLAIM_TX",i,r,v:{v:"1.1"}}` (no `s`); txId shown.
- [ ] A7 `txSeal` matches both spec vectors (test `cip170.test.ts`).
- [ ] A8 Missing witnesses: copy CBOR / paste witness and `/cosign#…` link; returned witnesses verified (Ed25519 over the ID recomputed from the pending tx, `tid` must match, key ∈ required_signers, deduped, ID unchanged) before merge; `/cosign` refuses per B3 `validateCosignTx` (tests).
- [ ] A9 Submit button enabled only when all required key hashes witnessed AND seal anchored AND `resolveTxHash(final) == anchored txHash` AND tip < TTL.
- [ ] A9b Pure `canAnchor` / `canSubmit` gate the anchor and submit buttons (test `claim-gates.test.ts`).
- [ ] A10 `npm test`, `npx tsc --noEmit`, `npm run build` pass.

Verification: `npm test && npx tsc --noEmit && npm run build`.

## Design detail

**KeriSigner** — `{ kind: 'signify'|'veridian'; aid: string; anchorSad(sad): Promise<{sn:number}>; anchorDigest?(digest): Promise<{sn:number}> }`.
Signify: `anchorDigest` = today's `identifiers().interact(name, digest)` (unchanged bytes); `anchorSad` = `interact(name, {d: sad.d})`.
Veridian: only `anchorSad` (remotesign). ATTEST picks `anchorDigest` if present else SAD variant.

**Veridian agent** — `SignifyClient(url, bran, Tier.low, bootUrl)`; connect, on failure boot+connect. Identifier
`tx-attestation-app` created witnessed from `Config.get().iurls` (toad table from vault §3) if absent; `agent` end role
added if absent; OOBI = `oobis().get(name,'agent').oobis[0]`. Wallet OOBI resolve → AID parsed from `/oobi/<AID>/`
and confirmed via `contacts`/`keyStates`. Remotesign: floor = `keyStates().query` → wait → `get()[0].s`; snapshot
unread notes on both ref routes; hand-built exn via `buildRemotesignExn` (see B1) +
`sendFromEvents(name,'remotesign',…)`; poll `notifications().list(start,start+24)` every 2 s ≤ 180 s; match fetched exn;
re-resolve wallet OOBI; `keyEvents().get(aid)` find `t=ixn`, `s===sn`, `s>floor`, `a` contains `{d}`; retry KEL read 5×2 s;
mark+delete the matched note.

**Required keys** — inputs: `/txs/{h}/utxos` → `inputs[].address` → `deserializeAddress().pubKeyHash` (skip script/byron);
body: `/txs/{h}/cbor` → `requiredSigners`, withdrawals (key reward accounts), certificates per the B2 allow-list;
collateral inputs with role `collateral`, reference inputs excluded. If `/cbor` is unavailable (custom Blockfrost-compatible API), continue with input keys + warning.
Wallet ownership: payment key hashes of used/unused/change addresses, stake key hashes of reward addresses.

**Claim tx** — MeshTxBuilder: self-output 1 ADA, `requiredSignerHash(k)` per distinct key, `invalidHereafter(tip.slot+86400)`
(tip from `/blocks/latest`), `metadataValue(170, …)`, change, `selectUtxosFrom(wallet utxos)`. txId = `resolveTxHash`.
Connected wallet `signTx(tx, true)`. Witness set extraction/merge via `cst.deserializeTx`/`addVKeyWitnessSetToTransaction`;
verification via libsodium `crypto_sign_verify_detached(sig, txIdBytes, vkey)` and blake2b-224(vkey).
Order: build → witnesses (spec SHOULD before anchoring) → anchor seal → final txId check → submit.

**Cosign link** — `${origin}/cosign#v=1&net=<network>&tx=<unsignedCborHex>&keys=<k1,k2>` (no `ret`, see B3).
Cosign page decodes tx, shows txId, outputs, fee, TTL, label-170 record, required signers, which keys it expects; connects
CIP-30 wallet (network check), `signTx(tx,true)`, extracts witness set, shows it as copyable text + return link
`${window.location.origin}/#cw=<witnessSetHex>&tid=<txId>`; Sign enabled only if `validateCosignTx` passes (B3). Initiator on load: if `#cw` present and a pending claim with `tid` exists → verify,
merge, persist, clear hash, jump to the sign step. Fragment is never sent to any server.

**Pending claim (localStorage `keri-pending-claim`)** — `{txId, txHex (with merged witnesses), network, claimed:[{txHash,key}],
requiredKeys, ttlSlot, signerKind, aid, seal?:{said,sn}}`. Cleared on submit or explicit discard.

## Review round 1 — changes (spec-reviewer: CHANGES REQUIRED → addressed)

**B1 Remotesign exn is hand-built.** signify-ts `exchange()` injects `a.i = recipient` (`exchanging.js:124`), which would
break `saidify(a) == a.d` for the tx seal. New pure `buildRemotesignExn(sender, recipient, payloadSad, dt)` builds
`{v,t:'exn',d,i,rp,p:'',dt,r:'/remotesign/ixn/req',q:{},a:payloadSad,e:{}}`, saidifies it, returns a `Serder`; signed with
`client.manager.get(hab).sign(b(exn.raw))`, sent via `sendFromEvents(name,'remotesign',exn,sigs,'',[wallet])`.
Used for both flows (the ATTEST-SAD payload already leads with `i` = wallet AID, so its bytes equal what signify would send).
Test: `exn.sad.a` deep-equals the seal object (keys `d,t,n,txHash`, no `i`) and `a.d === txSeal(n,txHash).said`; exn `d` verifies.
Unsure: KERIA/Veridian accept an exn without `a.i` (manual check, Task 6).

**B2 Required keys per spec.** Reference inputs excluded. Collateral input keys included with role `collateral`.
Certificates via explicit allow-list on the core cert `__typename`: stake key for StakeDeregistration, StakeDelegation,
Registration/Unregistration (Conway, with deposit), VoteDelegation, StakeVoteDelegation, StakeRegistrationDelegation,
VoteRegistrationDelegation, StakeVoteRegistrationDelegation; pool operator + owners for PoolRegistration, operator for
PoolRetirement; cold key for AuthorizeCommitteeHot/ResignCommitteeCold; DRep key for Register/Unregister/UpdateDelegateRepresentative.
Legacy StakeRegistration (type 0) excluded. Fixture adds a reference input, a collateral input and a type-0 cert.

**B3 /cosign is restricted.** Pure `validateCosignTx(txHex, expectedKeys, walletUtxoRefs)` refuses unless: aux data label 170
is a well-formed `CLAIM_TX` (t, i, non-empty r of 64-hex, v.v ≥ 1.1), body has no mint, certificates, withdrawals,
votes or proposals, `expectedKeys ⊆ required_signers`, TTL set; txId recomputed locally and shown. The connected wallet's
UTxO refs (`getUtxos`) are compared to the tx inputs (incl. collateral) → refuse if any input is the cosigner's
(a CIP-30 wallet would also sign those spends). Network checked against the wallet. `ret` parameter dropped: return link is
always `window.location.origin`. Unit-tested.

**B4 Merge safety.** `mergeVkeyWitnesses` dedupes by vkey, verifies every signature against the ID recomputed from
`pending.txHex` (the fragment `tid` must equal it, else rejected), asserts the ID is unchanged after merge. Cosigner witnesses
are restricted to the claim tx's `required_signers`. Tests: duplicate, valid sig over other txId, key not in required_signers,
ID unchanged.

**Optional items adopted.** Pure `canAnchor` (all required_signers witnessed, TTL not passed, no seal yet) and `canSubmit`
(all required_signers witnessed, seal anchored for `txIdOf(txHex)`, TTL not passed) with tests; anchor button gated by
`canAnchor` and disabled while a wait is running; remotesign `requestSaid` + floor persisted in the pending claim and a
late ref for that SAID is accepted after reload; `matchRef` checks `r` (both forms), `exn.d == note.a.d`, `p`, `i`, `rp`;
`s`/`a.sn` parsed as hex ints; Signify `anchorSad` waits on the `interact` operation; UI hint when the linking key is a stake
key ("some wallets don't sign stake keys for required_signers"); resume checks `pending.network` == current network and asks
for the Signify passcode again if lost; ATTEST builds re-extract the label's metadatum bytes from the built tx and show a
warning if their digest ≠ the anchored `metadataDigest`/`d` (pre-existing JSON re-encoding issue, now surfaced, not fixed).
`deserializeAddress` not used; key hashes come from `Cardano.Address.getProps()`.

## Review round 2 — code review findings (implemented)

**Cosign funds invariant (code-review B1, confirmed SUFFICIENT by complexity-specialist):** a vkey witness signs only the body
hash, so the body must make it impossible for that witness to unlock anything of the visitor's:
- R1 body = allow-list of CBOR keys {0,1,2,3,7,8,14,15}, duplicates refused, checked with a raw CBOR walk (`lib/cbor-shape.ts`)
  *before* the SDK parse (the SDK parser misreads unknown keys). No script data hash ⇒ no Plutus can run. Received witness
  set: vkeys only. Aux data: metadata only.
- R4 every input resolved via the app-configured API (never the link), matched by `output_index`, exactly one non-collateral
  match, fail closed; refuse script-credential, Byron, or payment key ∈ requested keys ∪ wallet payment keys.
- R5 refuse input refs in `getUtxos()` ∪ `getCollateral()`. R6 after signing: only key-0 vkey witnesses, each from a requested
  key and valid over the recomputed txId, else discard and show no return link. R7 output network = link network.
- Verified a Mesh-built claim tx uses body keys {0,1,2,3,7,14} and passes (test `mesh-claim-shape.test.ts`).

**Should-fix:** S1 Signify signer refuses when the agent's identifier prefix ≠ claim AID. S2 seal magic from `pending.network`,
anchor/submit blocked on network mismatch. S3 stored claim shape-checked (incl. `txIdOf(txHex) === txId`), cleared if invalid.
S4 witnesses verified async then added synchronously onto the current copy, guarded by txId; `storage` listener syncs tabs.
S5 a built claim is never silently replaced (continue or discard). O1 own-wallet witnesses limited to needed keys. O2 a matched
remotesign reply keeps its state so a retry only re-checks the KEL. O3 tip polling every 30 s with visible error.
Deviation kept: gates also require the fee-payer input keys (`inputKeys`).

─────────────────────────────────────

### Task 1 — CIP-170 builders are spec-exact (test: `lib/__tests__/cip170.test.ts`)
- `txSeal(n, txHash)` returns both spec vectors; rejects non-64-lowercase-hex.
- `attestSadPayload(i, label, digest)` saidified with key order `i,d,metadataLabel,metadataDigest`, label as decimal string; `Saider.verify` true.
- `buildClaimTxMetadata(i, r)` → `{t,i,r,v:{v:"1.1"}}` with no `s`, `r` non-empty, deduped, lowercase.
- `buildAttestSadMetadata(i, said, sn, original)` → `v:{v:"1.1",s:"SAD"}` + original labels (same filtering as today).

### Task 2 — Required keys resolve from Blockfrost data (test: `required-keys.test.ts` with fixture utxos JSON + constructed tx CBOR)
### Task 3 — Witness verify/merge accepts only valid signatures for expected keys (test: `claim-tx.test.ts` using a libsodium keypair)
### Task 4 — Link codec + pending claim round-trip (test: `pending-claim.test.ts`)
### Task 5 — Remotesign ref matcher + KEL seal finder are strict (test: `veridian.test.ts` on pure functions `matchRef`, `findAnchor`)
### Task 6 — Veridian agent + pairing UI works (manual against KERIA; build passes)
### Task 7 — Signer/flow choice wired; Signify+ATTEST unchanged (diff review; build)
### Task 8 — Claim flow UI end-to-end incl. /cosign page (build; manual on preview)
### Task 9 — Verify gate: `npm test && npx tsc --noEmit && npm run build`

─────────────────────────────────────

## Two decisions most likely to be wrong
1. **Remotesign request carries no tx body/aux data.** Spec step 4 says it MUST. Veridian anchors `{d: a.d}` with
   `a.d = saidify(a)`, so extra fields in `a` would change the seal; signify-ts embeds take serders only. We send the
   bare seal object; Veridian shows `t`,`n`,`txHash`. Flagged in UI copy and report.
2. **TTL = tip + 86400 slots.** Assumes 1 s slots (true on mainnet/preprod/preview post-Shelley) and that a day is
   enough for async cosigning; too long widens the replay window the spec wants closed.

## Assumed / Unsure / Skipped
**Assumed** — Blockfrost endpoint `/txs/{h}/cbor` and `/blocks/latest` exist on configured API; Mesh `BrowserWallet.signTx(tx,true)`
returns the tx with merged witnesses; Veridian accepts remotesign from a fresh browser AID it has resolved by OOBI.
**Unsure** — (1) existing Signify ATTEST anchors the raw digest string, not `{d: digest}` (pre-existing; left as is);
(2) Veridian pairing may also require the wallet to resolve our OOBI first (we show the QR for that); (3) `hashMetadata`
only digests the first label (pre-existing).
**Skipped** — ATTEST_TX, AUTH_BEGIN/END, verifier, QR scanning, native-script/voter/proposal keys, backend relay.
