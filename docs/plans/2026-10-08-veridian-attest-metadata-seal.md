# Veridian ATTEST via metadata seal (CIP-170 v1.1) — Implementation Plan

## Goal
With Veridian as signer, "Attest metadata" produces a conformant `ATTEST`: record `{t:"ATTEST", i, d:<digest>, s, v:{v:"1.1"}}`
plus the copied application labels (same as the Signify flow), where the KEL event at `s` anchors the **metadata seal**
`SAID({d:"", t:"cardano-metadata-attest", l:<attested label>, digest:<d>})` (CIP-170 fork, staged text, approved by
spec review). Signify ATTEST stays byte-identical (v "1.0", raw digest). CLAIM_TX unchanged.

## Design
- `lib/cip170.ts`: `metadataSeal(label, digest)` → `{said, sad}` via `Saider.saidify` with key order `d,t,l,digest`, `l` a JSON
  integer; refuse labels that are not decimal integers or exceed `Number.MAX_SAFE_INTEGER` (JS JSON cannot serialise them
  exactly; spec requires exact uint64 serialisation).
- `lib/keri-utils.ts` `buildCIP170Metadata(..., version = '1.0')`: optional version, Signify call unchanged.
- `app/page.tsx`: Metadata step with Veridian → `createVeridianAttestation`: attested label = the label `hashMetadata`
  digested (first CBOR label), seal = `metadataSeal(label, metadataHash)`, `veridianAgent.remoteSign(wallet, seal.sad)`
  (existing floor/ref/KEL check, which verifies the KEL holds `{d: seal}` after the floor), then BUILD_TRANSACTION with
  `sequenceNumber`; `buildTransaction` passes version `'1.1'` for Veridian. Flow selector re-enables "Attest metadata" for
  Veridian; signer change no longer forces the claim flow. Build step shows the anchored metadata seal.
- Remote-sign request stays the bare seal object (as for claims). The spec's requester-side MUST (include label and
  metadatum bytes) is not met yet: payload must be exactly the seal; carrying bytes in exn `e` is untested with
  KERIA/Veridian → separate step.

## Acceptance criteria
- [ ] `metadataSeal(1447, "EOpMIJ…")` = `ELaRZ34Ynl9ohjeUXQmkl9ypwEGozin-L8P43gA-IDX7` (spec test vector); key order d,t,l,digest;
      unsafe/invalid labels rejected (test `cip170.test.ts`).
- [ ] `buildCIP170Metadata` default v "1.0" unchanged; `'1.1'` when passed (test).
- [ ] Veridian attest: request payload = seal object; KEL check finds `{d: seal}`; record v "1.1", `d` = digest, `s` = event.
- [ ] Signify attest path unchanged; CLAIM_TX unchanged.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run build` pass.

## Two decisions most likely to be wrong
1. Attested label = first CBOR label (what `hashMetadata` already digests); multi-label sources attest only that label.
2. Request without metadatum bytes (requester-side MUST unmet), to keep Veridian acceptance proven.

## Assumed / Unsure / Skipped
**Assumed** Veridian anchors the seal object like the tx seal (same SAD check). **Unsure** label > 2^53 support (refused).
**Skipped** bytes in exn `e`; indexer change; multi-label ATTEST.

## Review round 1 — changes
- B1 `metadataSeal` refuses label 170; `veridianAttestPlan(cborMetadata, digest)` refuses when label 170 would be the
  attested label (first key = what `hashMetadata` digests), before anything is sent to the phone. Signify v1.0 path keeps
  its existing behaviour (known issue, unchanged by constraint).
- B2 `veridianAttestPlan` is the single pure decision (label + seal), used by the page; tests: numeric key order (674 before
  1447), spec vector, label-170 and empty refusals, `buildCIP170Metadata` default 1.0 / explicit 1.1.
- Notes adopted: record version derived from the anchor (`anchoredSeal ? '1.1' : '1.0'`), retry after a matched wallet
  reply resumes the persisted request (no second approval), "Blake3-256 Digest" label, anchored seal reset on new fetch,
  signer change and reset. Next button for Veridian reads "Request Signature in Veridian" and does not need Signify fields.
