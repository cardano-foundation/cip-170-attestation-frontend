# KERI Cardano Transaction Attestation - Workflow Guide

## Overview

This application enables users to create CIP-0170 compliant attestations for Cardano transactions using KERI (Key Event Receipt Infrastructure) identifiers through the Signify service.

The application is configurable via environment variables to support different Cardano networks (mainnet, preprod, preview) and custom Signify service URLs.

## Configuration

Before using the application, configure your environment by creating a `.env.local` file:

```bash
# Network: mainnet, preprod, or preview
NEXT_PUBLIC_CARDANO_NETWORK=mainnet

# Signify service URL
NEXT_PUBLIC_SIGNIFY_URL=http://localhost:3901
```

The application will automatically:
- Use the appropriate Blockfrost API endpoint for the configured network
- Link to the correct Cardano Explorer for the network
- Pre-fill the Signify URL with the configured value

## Complete Workflow

### Step 1: Connect Cardano Wallet

The user connects their Cardano browser wallet (Nami, Eternl, Flint, etc.) using the Mesh.js library.

**Required:**
- A Cardano wallet browser extension installed
- The wallet should be unlocked and ready

### Step 2: Input Transaction Hash

The user provides:
- **Transaction Hash**: A Cardano transaction hash to attest
- **Blockfrost API Key**: Your Blockfrost project ID for fetching transaction data

The application fetches the transaction metadata from the Cardano blockchain via Blockfrost API.

### Step 3: Input KERI Identifier Information

The user provides:
- **Identifier Name**: The name of the KERI identifier (AID) to use for attestation
- **Name**: The client name for the Signify connection
- **Signify URL**: (Optional) The URL of the Signify service (defaults to http://localhost:3901)

**Note**: The identifier must already exist in your Signify service. Create it beforehand using Signify CLI or API.

### Step 4: View Metadata and Hash

The application displays:
- The original transaction metadata fetched from Blockfrost
- The Blake2b hash of the metadata in CESR format (with 'E' prefix)

This hash will be anchored in the KERI identifier's Key Event Log (KEL).

### Step 5: Create KERI Interaction Event

The application:
1. Connects to the Signify service
2. Retrieves the specified KERI identifier
3. Creates an interaction event that anchors the metadata hash
4. Returns the sequence number of the new event

The hash is now cryptographically bound to the identifier through the KEL.

### Step 6: Build CIP-0170 Transaction

The application constructs transaction metadata according to CIP-0170 specification:

```json
{
  "170": {
    "t": "ATTEST",
    "i": "<KERI_identifier>",
    "d": "<metadata_hash>",
    "s": "<sequence_number_hex>",
    "v": {
      "v": "1.0"
    }
  },
  "721": "<original_metadata_from_label_721>",
  "1234": "<original_metadata_from_label_1234>"
}
```

Where:
- **t**: Transaction type (ATTEST for attestations)
- **i**: KERI identifier (AID) in CESR format
- **d**: Digest/hash of the metadata in CESR format
- **s**: Sequence number from the KERI interaction event (hex encoded)
- **v**: Version information
- **Original labels preserved**: All original metadata labels (e.g., 721, 1234) are preserved with their exact data, allowing anyone to verify the attested data matches the source

**Important**: The original metadata is NOT modified or moved to a different label. It remains at its original labels (e.g., 721 for NFTs, 1234 for custom data) so that the attestation clearly shows what data was signed.

### Step 7: Preview Metadata

The user can review the complete transaction metadata before publishing to ensure everything is correct.

### Step 8: Publish Transaction

The application:
1. Builds a Cardano transaction with the metadata
2. Signs it using the connected wallet
3. Submits it to the Cardano blockchain
4. Returns the transaction hash

### Step 9: Completion

The user receives:
- The transaction hash of the published attestation
- A link to view the transaction on Cardano Explorer

## CIP-0170 Compliance

This application creates attestation transactions that comply with CIP-0170 for KERI-backed metadata attestations. The attestation is valid if:

1. The digest value matches the Blake2b hash of the metadata
2. The digest can be found anchored in the KEL of the controller at the specified sequence number
3. The identifier has valid signing authority (established via AUTH_BEGIN and not revoked via AUTH_END)

## Verification

To verify an attestation created by this application:

1. **Fetch the transaction** from Cardano blockchain
2. **Extract metadata** from label 170 and the data label (e.g., 1447)
3. **Hash the data** using Blake2b to get the digest
4. **Query the KEL** for the identifier at the specified sequence number
5. **Verify the seal** in the KEL matches the digest
6. **Check signing authority** by validating any AUTH_BEGIN/AUTH_END transactions

## Technical Details

### Blake2b Hashing

The application uses Blake2b-256 to hash metadata and encodes the result in CESR format:
- Hash the JSON string representation of the metadata
- Use 32 bytes (256 bits) output
- Convert to base64url
- Prefix with 'E' for CESR 256-bit digest identifier

### Sequence Number Encoding

The KERI sequence number is encoded as a hexadecimal string for the CIP-0170 metadata.

### Metadata Label

By default, the original metadata is added to label `1447`. This can be customized based on your use case.

## Security Considerations

1. **API Keys**: Never commit Blockfrost API keys to version control
2. **Wallet Security**: The application uses the wallet's signing capabilities - never share private keys
3. **Signify Connection**: Ensure your Signify service is properly secured
4. **Transaction Fees**: The application creates a transaction that sends to the user's own address; minimal fees apply

## Troubleshooting

### "No Cardano wallet found"
- Install a Cardano wallet extension (Nami, Eternl, Flint, etc.)
- Ensure the wallet is unlocked

### "Identifier not found"
- Create the identifier in Signify first using:
  ```bash
  kli init --name <name> --salt <salt>
  kli incept --name <name> --alias <identifier-name>
  ```

### "Failed to fetch metadata"
- Verify the transaction hash is correct
- Ensure the transaction has metadata
- Check your Blockfrost API key is valid and has sufficient quota

### "Failed to connect to Signify"
- Verify Signify service is running (default: http://localhost:3901)
- Check the Signify URL is correct
- Ensure network connectivity

## Examples

### Creating an Attestation for a Transaction

1. Transaction Hash: `a1b2c3d4e5f6...` (Cardano transaction with metadata)
2. Identifier Name: `my-attestor` (created in Signify)
3. Name: `attestation-client`

Result: A new transaction on Cardano with CIP-0170 compliant metadata linking the original transaction to your KERI identifier.

## Resources

- [CIP-0170 Specification](https://github.com/Kammerlo/CIPs/tree/feat/keri-cip/CIP-0170)
- [KERI Specification](https://trustoverip.github.io/kswg-keri-specification/)
- [Signify Documentation](https://github.com/WebOfTrust/signify-ts)
- [Blockfrost API](https://docs.blockfrost.io/)
- [Mesh.js Documentation](https://meshjs.dev/)
