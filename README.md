# KERI Cardano Transaction Attestation Frontend

A Next.js application for attesting Cardano transactions with KERI (Key Event Receipt Infrastructure) using Signify.

## Screenshots

### Initial Application Screen
![Application Homepage](https://github.com/user-attachments/assets/72ad7b24-6850-4d6e-9a4d-a7ec02c01d76)

### Wallet Connection with Error Handling
![Wallet Error Handling](https://github.com/user-attachments/assets/dc563ac0-2971-47e5-b802-5e9703913cd8)

## Features

- Connect with Cardano browser wallet (via Mesh.js)
- Configurable network support (mainnet, preprod, preview) via environment variables
- Fetch transaction metadata directly from Blockfrost OpenAPI endpoints (no backend required)
- Hash metadata using Blake2b
- Create KERI interaction events with Signify
- Build CIP-0170 compliant attestation transactions
- Preserve original metadata labels in published transactions
- Publish transactions to the Cardano blockchain
- View transaction on network-appropriate Cardano Explorer
- Fully client-side application - no backend API routes needed

## Configuration

The application can be configured via environment variables. Create a `.env.local` file in the root directory:

```bash
# Network configuration (mainnet, preprod, or preview)
NEXT_PUBLIC_CARDANO_NETWORK=mainnet

# Signify service URL
NEXT_PUBLIC_SIGNIFY_URL=http://localhost:3901
```

**Important:** The Blockfrost API key is entered via the frontend interface for security reasons and should NOT be stored in environment files.

## Prerequisites

- Node.js 18+ installed
- A Cardano wallet browser extension (Nami, Eternl, Flint, etc.)
- Blockfrost API key (get one at https://blockfrost.io)
- Signify service running (default: http://localhost:3901)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Kammerlo/keri-cardano-tx-attestation-frontend.git
cd keri-cardano-tx-attestation-frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables (optional):
```bash
cp .env.example .env.local
# Edit .env.local to set your network and Signify URL
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### Workflow Steps

1. **Connect Wallet**: Connect your Cardano browser wallet
2. **Input Transaction**: Enter a Cardano transaction hash and your Blockfrost API key
3. **KERI Identifier**: Provide identifier name and name for Signify client
4. **View Metadata**: Review the fetched metadata and its Blake2b hash
5. **Create Interaction**: Create a KERI interaction event with the hash
6. **Preview**: Review the CIP-0170 compliant metadata
7. **Publish**: Publish the attestation transaction to Cardano
8. **Complete**: View your transaction on Cardano Explorer

## CIP-0170 Compliance

This application builds transactions according to [CIP-0170](https://github.com/Kammerlo/CIPs/tree/feat/keri-cip/CIP-0170) for KERI-backed metadata attestations.

The attestation metadata structure includes:
- Label `170` with attestation information (type, identifier, digest, sequence number, version)
- **All original transaction metadata labels preserved with their exact data**
- This allows verification that the attested data matches the original transaction metadata

Example metadata structure:
```json
{
  "170": {
    "t": "ATTEST",
    "i": "EKtQ1lymrnrh3qv5S18PBzQ7ukHGFJ7EXkH7B22XEMIL",
    "d": "ELC5L3iBVD77d_MYbYGGCUQgqQBju1o4x1Ud-z2sL-ux",
    "s": "1a",
    "v": { "v": "1.0" }
  },
  "721": { /* original NFT metadata */ },
  "1234": { /* other original metadata */ }
}
```

## Network Configuration

The application supports multiple Cardano networks through environment configuration:

- **mainnet**: Production Cardano network
- **preprod**: Pre-production testnet
- **preview**: Preview testnet

The network setting determines:
- Which Blockfrost API endpoint to use
- Which Cardano Explorer to link to for published transactions

### Signify Service

The application expects a Signify service to be running. You can configure the URL in the application or set it to your Signify instance.

Default: `http://localhost:3901`

### Blockfrost API

You need a Blockfrost API key to fetch transaction metadata. Get one at [https://blockfrost.io](https://blockfrost.io).

## Technologies Used

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Custom CSS** - Styling
- **Mesh.js** - Cardano wallet integration
- **Blockfrost.js** - Cardano blockchain data
- **Signify-ts** - KERI identifier management
- **Blake.js** - Blake2b hashing

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## License

ISC
