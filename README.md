# KERI Cardano Transaction Attestation Frontend

A Next.js application for attesting Cardano transactions with KERI (Key Event Receipt Infrastructure) using Signify.

## Screenshots

### Modern UI Design
![Application Homepage](https://github.com/user-attachments/assets/b5b4023c-36f0-4f96-b5e0-3558fa908c51)

### Network Configuration
![Network Settings](https://github.com/user-attachments/assets/fe662582-470f-4eac-8da6-66071988c03d)

### Network Switching
![Preprod Network](https://github.com/user-attachments/assets/408b8edc-d2d1-49ef-9da0-3c03705dc790)

## Features

### Core Functionality
- Connect with Cardano browser wallet (via Mesh.js)
- Fetch transaction metadata directly from Blockfrost OpenAPI endpoints (no backend required)
- Hash metadata using Blake2b
- Create KERI interaction events with Signify
- Build CIP-0170 compliant attestation transactions
- Preserve original metadata labels in published transactions
- Publish transactions to the Cardano blockchain
- View transaction on network-appropriate Cardano Explorer
- Fully client-side application - no backend API routes needed

### Network Configuration
- 🌐 **Dynamic Network Selection**: Switch between mainnet, preprod, and preview networks
- 🔧 **Custom Blockfrost URLs**: Configure custom Blockfrost API endpoints
- 💾 **Persistent Settings**: Network configuration stored in browser localStorage
- 🔑 **Secure API Key Storage**: Blockfrost API keys stored in secure cookies (30-day expiry)
- ✅ **API Key Validation**: Real-time validation of Blockfrost API keys
- 🎯 **Network Validation**: Automatic wallet network verification

### Enhanced User Experience
- 📊 **Visual Progress Tracker**: See your progress through the attestation workflow
- ⬅️➡️ **Flexible Navigation**: Move backward and forward between steps
- ✓ **Step Completion Indicators**: Checkmarks show completed steps
- 🎨 **Modern UI Design**: Cardano Foundation Reeve-inspired design
- 📱 **Responsive Layout**: Works on desktop and mobile devices
- 🔄 **Loading States**: Clear feedback during operations

### Wallet Features
- 🔗 **Multi-Wallet Support**: Compatible with multiple Cardano wallet extensions
- 🌍 **Network Mismatch Detection**: Warns if wallet network doesn't match app settings
- 📍 **Address Display**: Shows connected wallet address
- 🛡️ **Network Validation**: Ensures wallet is on correct network before proceeding

### Identifier Management
- ⚡ **Real-time Verification**: Identifiers verified at input step, not later
- 🔍 **Signify Integration**: Direct validation with Signify service
- 💬 **Clear Feedback**: Visual indicators for verification status

## Configuration

The application supports both environment variables and runtime configuration:

### Environment Variables (Optional)

Create a `.env.local` file in the root directory:

```bash
# Default network (optional - can be changed in UI)
NEXT_PUBLIC_CARDANO_NETWORK=mainnet

# Signify service URL (optional)
NEXT_PUBLIC_SIGNIFY_URL=http://localhost:3901
```

### Runtime Configuration

All network settings can be configured through the UI:
1. Click the **Network Settings** button in the top-right corner
2. Select your network (mainnet, preprod, or preview)
3. Optionally enable custom Blockfrost URL
4. Enter your Blockfrost API key
5. Click **Validate & Save**

Settings are automatically persisted across browser sessions.

## Prerequisites

- Node.js 18+ installed
- A Cardano wallet browser extension (Eternl, Nami, Flint, Lace, etc.)
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

### Getting Started

1. **Configure Network** (if not using defaults):
   - Click the **Network Settings** button in the top-right
   - Select your desired network
   - Enter your Blockfrost API key
   - Click **Validate & Save**

2. **Follow the Attestation Workflow**:
   - Progress is tracked visually at the top of the page
   - You can navigate backward using the **← Back** button
   - Each completed step shows a checkmark ✓

### Workflow Steps

1. **Connect Wallet**: Connect your Cardano browser wallet
   - Ensures wallet is on the correct network
   - Displays wallet address after connection
2. **Transaction**: Enter a Cardano transaction hash
   - Transaction hash is validated (64 hex characters)
   - Metadata is fetched from Blockfrost
3. **KERI Identifier**: Provide identifier name and client name for Signify
   - Identifier is verified in real-time with Signify
   - Must complete verification before proceeding
4. **View Metadata**: Review the fetched metadata and its Blake2b hash
5. **Create Interaction**: Create a KERI interaction event with the hash
   - Event is created with Signify service
   - Sequence number is retrieved
6. **Preview**: Review the CIP-0170 compliant metadata
   - Shows complete transaction metadata including attestation
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
