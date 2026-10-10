# KERI Cardano Transaction Attestation Frontend

A dedicated frontend interface for attesting Cardano transactions using KERI (Key Event Receipt Infrastructure).

## Purpose

This tool allows users to create immutable proofs of existence for transaction metadata by anchoring them into a KERI event log. It bridges the gap between the Cardano blockchain and KERI's self-certifying identifiers.

## How it Works

1.  **Connect**: Link your Cardano wallet (via Mesh.js).
2.  **Fetch**: Retrieve metadata from an existing Cardano transaction via Blockfrost.
3.  **Attest**: Generate a KERI interaction event anchored to that metadata's hash using a KERI agent (Signify).
4.  **Publish**: Submit a new "attestation transaction" back to Cardano containing the KERI event data (CIP-0170 compliant).

## Application Workflow

The application guides the user through the following specific steps:

1.  **Connect Wallet**: Authenticate using a CIP-30 compatible Cardano wallet (e.g., Nami, Eternl).
2.  **Select Transaction**: Input the hash of a past transaction. The app uses Blockfrost to validate it and fetch the associated metadata (e.g., NFT data or invoices).
3.  **Verify Identifier**: Enter your KERI Identifier (AID) alias. The app verifies specific credentials against your running Signify agent.
4.  **Compute Digest**: The application strips the metadata structure down to its value and computes a cryptographic hash (Blake2b-256).
5.  **Create Interaction Event**: The app instructs your Signify agent to sign a new KERI "Interaction Event" (`ixn`) that anchors the computed hash.
6.  **Build Attestation**: A new Cardano transaction is constructed containing:
    *   The `170` label with the KERI proof (AID, Event Digest, Sequence Number).
    *   A copy of the original metadata labels to ensure independent verification.
7.  **Sign & Submit**: The user signs the transaction with their local wallet, publishing the proof to the blockchain.

## Signers and Attestation Types

**Signer** (identifier step):
*   **Signify agent**: your identifier on a KERIA agent, unlocked with its passcode (original flow).
*   **Veridian wallet**: the app boots its own browser KERI agent on the KERIA of the Signify URL field (boot URL from
    `NEXT_PUBLIC_SIGNIFY_BOOT_URL`, passcode kept in `localStorage`). Scan the app OOBI in Veridian, paste the
    wallet OOBI back, and approve each anchoring request on the phone (`/remotesign/ixn/req`).

**Attestation type** (transaction step):
*   **Attest metadata** (`ATTEST`). With Signify the digest of the metadata is anchored in the KEL (`v: {v:"1.0"}`).
    Veridian can only anchor the SAID of a JSON object, so it anchors the CIP-170 v1.1 **metadata seal**
    `SAID({ d, t: "cardano-metadata-attest", l: <label>, digest })` instead; the record keeps `d` = digest and carries
    `v: {v:"1.1"}`, and verifiers recompute the seal. (The remote-sign request does not yet carry the metadatum bytes the
    spec asks for; see the plan in `docs/plans/2026-10-08-veridian-attest-metadata-seal.md`.)
*   **Claim transactions** (`CLAIM_TX`, CIP-170 v1.1). The app resolves the required keys of each claimed transaction,
    builds a claim with those linking keys as `required_signers` and a ~24 h TTL, collects signatures, anchors the
    transaction seal `SAID({ d, t: "cardano-tx-attest", n, txHash })` and submits. If a linking key is held by someone
    else, send them the cosign link (`/cosign#…`): they sign with their CIP-30 wallet and send back a return link.
    The pending claim is kept in `localStorage` until it is submitted or discarded.

Run the unit tests with `npm test`.

## CIP-0170 Standard

This application implements [CIP-0170](https://github.com/Kammerlo/CIPs/tree/feat/keri-cip/CIP-0170), a proposed standard for KERI-backed metadata attestations.

### Process
1.  **Extraction**: The system reads the raw CBOR metadata from a target transaction.
2.  **Anchoring**: A Blake2b-256 hash is calculated from the metadata value. This hash is embedded into a KERI interaction event (signed by the identifier's keys).
3.  **Attestation**: The resulting KERI event digest is included in a new transaction under label `170`.

### Transaction Structure
The validation logic relies on the transaction containing **both** the attestation proof (label `170`) and the **original metadata** (e.g., label `721`).

```json
{
  "170": {
    "t": "ATTEST",   // Type
    "i": "E...",     // KERI Identifier (AID)
    "d": "E...",     // Digest of the KERI event
    "s": "0",        // Sequence number (hex)
    "v": { "v": "1.0" }
  },
  "721": { 
     // The exact original metadata is preserved here
     // allowing verifiers to re-hash and match against the proof.
  }
}
```

## Tech Stack

*   Next.js 16 (React)
*   Mesh SDK & Blockfrost (Cardano Client-side)
*   Signify-TS (KERI)
*   Libsodium & Blake2b (Crypto)

## Setup

1.  **Prerequisites**:
    *   Node.js 18+
    *   [Signify](https://github.com/WebOfTrust/signify-ts) service running (default: `http://localhost:3901`)
    *   Cardano Wallet Extension
    *   Blockfrost API Key

2.  **Install & Run**:
    ```bash
    git clone https://github.com/Kammerlo/keri-cardano-tx-attestation-frontend.git
    cd keri-cardano-tx-attestation-frontend
    npm install
    npm run dev
    ```

3.  **Configure**:
    *   Open [http://localhost:3000](http://localhost:3000)
    *   Click "Network Settings" to enter your Blockfrost API Key and select network.
