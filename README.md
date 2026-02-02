# KERI Cardano Transaction Attestation Frontend

A Next.js application for attesting Cardano transactions with KERI (Key Event Receipt Infrastructure) using Signify.

## Features

- Connect with Cardano browser wallet (via Mesh.js)
- Fetch transaction metadata from Blockfrost
- Hash metadata using Blake2b
- Create KERI interaction events with Signify
- Build CIP-0170 compliant attestation transactions
- Publish transactions to the Cardano blockchain
- View transaction on Cardano Explorer

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

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

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
- Label `170` with attestation information (type, identifier, digest, sequence number)
- Original transaction metadata on the specified label
- Version information for compatibility

## Configuration

### Signify Service

The application expects a Signify service to be running. You can configure the URL in the application or set it to your Signify instance.

Default: `http://localhost:3901`

### Blockfrost API

You need a Blockfrost API key to fetch transaction metadata. Get one at [https://blockfrost.io](https://blockfrost.io).

## Technologies Used

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
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
