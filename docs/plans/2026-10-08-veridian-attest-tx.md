# Veridian "Attest metadata" via ATTEST_TX — Implementation Plan

> **Superseded 2026-10-08 (user decision):** `ATTEST_TX` attests the transaction it sits in at creation time, so using it
> to attest metadata of an existing transaction misuses its meaning. Attesting existing metadata is `ATTEST`'s job, which
> needs a raw-digest seal Veridian cannot anchor. Veridian is now claim-only (`CLAIM_TX`); the ATTEST_TX path was removed.
> The `buildSealedTx`, `newPendingTx` and `resumeTarget` refactors from this plan were kept for the claim flow.

## Goal (user-approved)
When Veridian is the signer, "Attest metadata" publishes a new tx that carries the copied application labels plus
`170 = { t: "ATTEST_TX", i: <wallet AID>, v: { v: "1.1" } }`, and Veridian anchors that tx's transaction seal. The SAD
variant (`v.s = "SAD"`, rejected by the updated CIP-170 CDDL, commit c0e677d) is removed. Signify `ATTEST` and `CLAIM_TX`
are unchanged. Single signer only (user chose "not now" for multi-signer).

Why it is conformant: Veridian can only anchor SAIDs; the transaction seal `SAID({d,t:"cardano-tx-attest",n,txHash})` is
one. Spec: an `ATTEST_TX` binds the signer to all metadata in that tx; with label authority a separate `ATTEST` is not
needed. Side benefit: no digest-of-copied-bytes mismatch, because the seal covers the new tx's own ID.

## Scope / constraints
- Reuse the CLAIM_TX machinery (pending tx persistence, build → wallet signature → anchor seal → final-ID check → submit,
  `canAnchor`/`canSubmit` gates, Veridian remotesign, resume after reload).
- No cosign for ATTEST_TX (no `required_signers`); only the fee inputs need witnesses.
- Stored v1 pending claims without a `kind` are read as `kind: "claim"`.

## Review round 1 — changes
- B1 Back, discard and the cross-tab effect follow `ATTEST_TX_STEPS` (back/discard → `SHOW_METADATA`, or `INPUT_TX_HASH`
  when the fetched metadata is gone after a reload); claim flow unchanged.
- B2 `buildVeridianAttestTx` refuses while a pending tx exists; the Metadata step's Next continues the pending attest_tx;
  signer and flow selectors are disabled while any pending tx exists.
- B3 `newPendingTx(...)` in `lib/pending-claim.ts` is the single record factory (kind, `claimed: []`, `signify.url` =
  KERIA URL used for pairing, signerKind); test asserts its output passes `isPendingClaim`.
- B4 `buildSealedTx` takes an optional offline `builder`; tests call it with a stub wallet and assert label 170
  ATTEST_TX, copied labels, no body key 14, TTL, non-empty `inputKeys`; plus a claim case with required_signers.
- B5 `resumeTarget(saved)` (pure) decides flow, step and completed steps; tested for attest_tx, sealed claim and legacy
  records without `kind`.
- Non-blocking adopted: ATTEST_TX refuses source metadata with nothing but label 170; completion/error copy by kind;
  acceptance grep narrowed to `SAD variant|s: 'SAD'|attestSadPayload|buildAttestSadMetadata|payloadSaid`.
- Manual check (not automatable here): reload before signing, after signing, with a Veridian request in flight; discard.

─────────────────────────────────────

## Summary
`PendingClaim` gains `kind: 'claim' | 'attest_tx'`. `buildClaimTx` becomes `buildSealedTx`, taking a full metadata map
(label → value) instead of only label 170. New `buildAttestTxMetadata(aid, originalMetadata)` in `lib/cip170.ts`. In the
attest flow with Veridian, the Metadata step's button builds the ATTEST_TX tx and moves to the existing Signatures and Seal
steps (tracker shows Connect → Identifier → Transaction → Metadata → Signatures → Seal → Complete). The SAD code paths
(`attestSadPayload`, `buildAttestSadMetadata`, `createVeridianAttestation`, `payloadSaid`, SAD badges and copy) are deleted.

## Change map
```
lib/cip170.ts              ~-35 +20  remove SAD builders; add buildAttestTxMetadata
lib/claim-tx.ts            ~15       buildClaimTx → buildSealedTx(metadata map)
lib/pending-claim.ts       ~10       kind field (+ default for old records)
app/page.tsx               ~120      Veridian attest → build ATTEST_TX + reuse sign/seal steps; remove SAD paths;
                                     resume picks flow/steps by kind; completion copy by kind
components/ProgressTracker ~10       ATTEST_TX_STEPS list
components/claim/ClaimAnchor, ClaimSign ~10  wording that is not claim-specific
lib/__tests__/*            tests for buildAttestTxMetadata, buildSealedTx shape (Mesh offline), kind default;
                           SAD tests removed with the feature (user decision), veridian exn test payload → tx seal
README.md, plan docs       wording
```
No ⚠ items (no schema/auth/public API/boundary); funds-adjacent as before (spends own fee UTxOs).

## Risk table
| # | Change | Risk | Why | Review this |
|---|---|---|---|---|
| 1 | Attest+Veridian path in page.tsx | Med | Must anchor only after fee witnesses, submit only with matching seal | Read |
| 2 | buildSealedTx multi-label metadata | Med | Copied labels must land in the tx; 170 must be ATTEST_TX | Read; test |
| 3 | kind default on stored claims | Low | Old pending claims must still resume as claims | Skim; test |
| 4 | SAD removal | Low | Dead code removal; Signify ATTEST untouched | Diff check |

## Acceptance criteria
- [ ] `buildAttestTxMetadata` → `{170:{t:"ATTEST_TX",i,v:{v:"1.1"}}}` + original labels except 170 (test `cip170.test.ts`).
- [ ] A Mesh-built ATTEST_TX tx carries label 170 and the copied labels (test `mesh-claim-shape.test.ts`).
- [ ] Veridian attest: Metadata step → "Build ATTEST_TX transaction" → Signatures → Seal → Complete; anchor gated by
      `canAnchor` (fee inputs witnessed), submit gated by `canSubmit` (seal matches final ID, TTL).
- [ ] Reload during the Veridian attest flow resumes at Signatures/Seal in the attest flow.
- [ ] `grep -rE "SAD variant|s: 'SAD'|attestSadPayload|buildAttestSadMetadata|payloadSaid" app lib components` is empty.
- [ ] Signify ATTEST and CLAIM_TX code paths unchanged in behaviour.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run build` pass.

## Two decisions most likely to be wrong
1. Reusing `PendingClaim` (with `kind`) instead of a separate pending-attest store: less code, but the name now covers both.
2. Copied labels still come from Blockfrost JSON (as the Signify ATTEST path does): fine for ATTEST_TX, whose seal covers
   the new tx's bytes, but the copied metadata may differ byte-wise from the source tx.

## Assumed / Unsure / Skipped
**Assumed** — Veridian anchors the tx seal for ATTEST_TX exactly as it does for CLAIM_TX (same object shape).
**Unsure** — Mesh `metadataValue` re-encodes Blockfrost JSON (strings vs bytes); same behaviour as today's ATTEST publish.
**Skipped** — multi-signer ATTEST_TX, ATTEST_TX for Signify, Veridian raw-digest mode, tx body in remotesign request.
