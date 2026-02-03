'use client';

import { useState, useEffect } from 'react';
import { BrowserWallet } from '@meshsdk/core';
import { useWallet } from '@meshsdk/react';
import { SignifyClient, Serder, Authenticater, ready } from 'signify-ts';
import { hashMetadata, buildCIP170Metadata, decimalToHex } from '@/lib/keri-utils';
import { WorkflowStep, TransactionMetadata } from '@/lib/types';
import { getSignifyUrl, getCardanoNetwork, getCardanoExplorerUrl, getBlockfrostUrl } from '@/lib/config';

// Constants
const MIN_ADA_LOVELACE = '1000000'; // 1 ADA minimum for transaction output

export default function Home() {
  // Configuration from environment
  const defaultSignifyUrl = getSignifyUrl();
  const network = getCardanoNetwork();
  const explorerBaseUrl = getCardanoExplorerUrl();
  const blockfrostUrl = getBlockfrostUrl();

  // Wallet state
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletApi, setWalletApi] = useState<any>(null);
  const [walletName, setWalletName] = useState<string>('');

  // Form inputs
  const [txHash, setTxHash] = useState('');
  const [identifierName, setIdentifierName] = useState('');
  const [name, setName] = useState('');
  const [blockfrostApiKey, setBlockfrostApiKey] = useState('');
  const [signifyUrl, setSignifyUrl] = useState(defaultSignifyUrl);

  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(WorkflowStep.CONNECT_WALLET);
  const [metadata, setMetadata] = useState<TransactionMetadata | null>(null);
  const [metadataHash, setMetadataHash] = useState('');
  const [sequenceNumber, setSequenceNumber] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [cip170Metadata, setCip170Metadata] = useState<any>(null);
  const [publishedTxHash, setPublishedTxHash] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Connect wallet
  const connectWallet = async () => {
    try {
      setLoading(true);
      setError('');
      
      const availableWallets = await BrowserWallet.getInstalledWallets();
      
      if (availableWallets.length === 0) {
        throw new Error('No Cardano wallet found. Please install a wallet extension.');
      }

      const wallet = await BrowserWallet.enable(availableWallets[0].name);
      setWalletApi(wallet);
      setWalletName(availableWallets[0].name);
      setWalletConnected(true);
      setCurrentStep(WorkflowStep.INPUT_TX_HASH);
      setSuccess('Wallet connected successfully!');
    } catch (err: any) {
      setError(`Failed to connect wallet: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch transaction metadata from Blockfrost
  const fetchTransactionMetadata = async () => {
    try {
      setLoading(true);
      setError('');
      
      if (!blockfrostApiKey) {
        throw new Error('Please provide Blockfrost API key');
      }

      if (!txHash) {
        throw new Error('Please provide transaction hash');
      }

      // Call Blockfrost API directly using their OpenAPI endpoint
      const response = await fetch(`${blockfrostUrl}/txs/${txHash}/metadata/cbor`, {
        method: 'GET',
        headers: {
          'project_id': blockfrostApiKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Blockfrost API error: ${response.status}`);
      }

      const txMetadata = await response.json();

      if (!txMetadata || txMetadata.length === 0) {
        throw new Error('No metadata found for this transaction');
      }

      // Convert metadata array to object
      const metadataObj: TransactionMetadata = {};
      txMetadata.forEach((item: any) => {
        metadataObj[item.label] = item.cbor_metadata;
      });

      setMetadata(metadataObj);
      setCurrentStep(WorkflowStep.INPUT_IDENTIFIER);
      setSuccess('Transaction metadata fetched successfully!');
    } catch (err: any) {
      setError(`Failed to fetch metadata: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Hash metadata and show to user
  const hashAndShowMetadata = async () => {
    try {
      setLoading(true);
      setError('');

      if (!metadata) {
        throw new Error('No metadata to hash');
      }
      
      const hash = hashMetadata(metadata);
      setMetadataHash(hash);
      setCurrentStep(WorkflowStep.SHOW_METADATA);
      setSuccess('Metadata hashed successfully!');
    } catch (err: any) {
      setError(`Failed to hash metadata: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Create KERI interaction event
  const createInteractionEvent = async () => {
    try {
      setLoading(true);
      setError('');

      if (!identifierName || !name) {
        throw new Error('Please provide identifier name and name');
      }

      // Initialize libsodium (required for signify-ts)
      await ready();

      // Initialize Signify client (third parameter is tier, using default)
      const client = new SignifyClient(signifyUrl, name);
      
      // Connect to Signify
      await client.connect();
      
      // Get or create identifier
      let aid;
      try {
        const identifiers = await client.identifiers().list();
        aid = identifiers.aids.find((a: any) => a.name === identifierName);
        
        if (!aid) {
          throw new Error(`Identifier "${identifierName}" not found. Please create it first using Signify.`);
        }
      } catch (err) {
        throw new Error(`Failed to retrieve identifier: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      setIdentifier(aid.prefix);

      // Create interaction event with the hash
      const interactionResult = await client.identifiers().interact(identifierName, [metadataHash]);
      
      // Get the sequence number from the interaction
      const serder = interactionResult.serder;
      // Serder is the event, we need to parse it to get the sequence number
      const eventData: any = serder;
      const seqNo = parseInt(eventData.s || eventData.sn || '0', 16);
      
      setSequenceNumber(seqNo);
      setCurrentStep(WorkflowStep.BUILD_TRANSACTION);
      setSuccess(`Interaction event created with sequence number: ${seqNo}`);
    } catch (err: any) {
      setError(`Failed to create interaction event: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Build CIP-0170 compliant transaction
  const buildTransaction = async () => {
    try {
      setLoading(true);
      setError('');

      if (!identifier || !metadataHash || sequenceNumber === undefined || !metadata) {
        throw new Error('Missing required data to build transaction');
      }

      const cip170Meta = buildCIP170Metadata(
        identifier,
        metadataHash,
        sequenceNumber,
        metadata
      );

      setCip170Metadata(cip170Meta);
      setCurrentStep(WorkflowStep.PREVIEW_METADATA);
      setSuccess('Transaction metadata built successfully!');
    } catch (err: any) {
      setError(`Failed to build transaction: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Publish transaction to blockchain
  const publishTransaction = async () => {
    try {
      setLoading(true);
      setError('');

      if (!walletApi || !cip170Metadata) {
        throw new Error('Wallet not connected or metadata not ready');
      }

      // Get wallet address
      const usedAddresses = await walletApi.getUsedAddresses();
      const changeAddress = await walletApi.getChangeAddress();
      
      if (!usedAddresses || usedAddresses.length === 0) {
        throw new Error('No addresses found in wallet');
      }

      // Build transaction with metadata (sends to self with minimum ADA)
      const tx = await walletApi.buildTx()
        .changeAddress(changeAddress)
        .txOut(usedAddresses[0], MIN_ADA_LOVELACE)
        .metadataJson(cip170Metadata)
        .complete();

      // Sign transaction
      const signedTx = await walletApi.signTx(tx);

      // Submit transaction
      const txHash = await walletApi.submitTx(signedTx);
      
      setPublishedTxHash(txHash);
      setCurrentStep(WorkflowStep.COMPLETED);
      setSuccess('Transaction published successfully!');
    } catch (err: any) {
      setError(`Failed to publish transaction: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>KERI Cardano Transaction Attestation</h1>
      <p>Attest Cardano transactions with KERI using Signify</p>
      <p className="network-info">
        Network: <strong>{network}</strong>
      </p>

      {/* Status Messages */}
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

        {/* Workflow Steps */}
        <div className="card">
          <div className="steps">
            {Object.values(WorkflowStep).map((step, index) => (
              <div
                key={step}
                className={`step ${Object.values(WorkflowStep).indexOf(currentStep) >= index ? 'active' : ''}`}
              >
                {step.replace(/_/g, ' ').toUpperCase()}
              </div>
            ))}
          </div>

          {/* Step 1: Connect Wallet */}
          {currentStep === WorkflowStep.CONNECT_WALLET && (
            <div>
              <h2>Connect Your Wallet</h2>
              <button
                onClick={connectWallet}
                disabled={loading}
                className="button"
              >
                {loading ? 'Connecting...' : 'Connect Cardano Wallet'}
              </button>
            </div>
          )}

          {/* Step 2: Input Transaction Hash */}
          {currentStep === WorkflowStep.INPUT_TX_HASH && (
            <div>
              <h2>Enter Transaction Details</h2>
              <div>
                <label className="label">Transaction Hash</label>
                <input
                  type="text"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="Enter Cardano transaction hash"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Blockfrost API Key</label>
                <input
                  type="password"
                  value={blockfrostApiKey}
                  onChange={(e) => setBlockfrostApiKey(e.target.value)}
                  placeholder="Enter your Blockfrost API key"
                  className="input"
                />
              </div>
              <button
                onClick={fetchTransactionMetadata}
                disabled={loading || !txHash || !blockfrostApiKey}
                className="button"
              >
                {loading ? 'Fetching...' : 'Fetch Transaction Metadata'}
              </button>
            </div>
          )}

          {/* Step 3: Input KERI Identifier */}
          {currentStep === WorkflowStep.INPUT_IDENTIFIER && (
            <div>
              <h2>KERI Identifier Information</h2>
              <div>
                <label className="label">Identifier Name</label>
                <input
                  type="text"
                  value={identifierName}
                  onChange={(e) => setIdentifierName(e.target.value)}
                  placeholder="Enter identifier name"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Name (for Signify client)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter name for Signify client"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Signify URL (configured: {defaultSignifyUrl})</label>
                <input
                  type="text"
                  value={signifyUrl}
                  onChange={(e) => setSignifyUrl(e.target.value)}
                  placeholder={defaultSignifyUrl}
                  className="input"
                />
              </div>
              <button
                onClick={hashAndShowMetadata}
                disabled={loading || !identifierName || !name}
                className="button"
              >
                {loading ? 'Processing...' : 'Continue'}
              </button>
            </div>
          )}

          {/* Step 4: Show Metadata and Hash */}
          {currentStep === WorkflowStep.SHOW_METADATA && (
            <div>
              <h2>Transaction Metadata</h2>
              <div className="code-block">
                <pre>{JSON.stringify(metadata, null, 2)}</pre>
              </div>
              <div>
                <label className="label">Blake2b Hash (CESR format)</label>
                <input
                  type="text"
                  value={metadataHash}
                  readOnly
                  className="input"
                />
              </div>
              <button
                onClick={createInteractionEvent}
                disabled={loading}
                className="button"
              >
                {loading ? 'Creating...' : 'Create KERI Interaction Event'}
              </button>
            </div>
          )}

          {/* Step 5: Build Transaction */}
          {currentStep === WorkflowStep.BUILD_TRANSACTION && (
            <div>
              <h2>Interaction Event Created</h2>
              <div>
                <label className="label">Identifier</label>
                <input
                  type="text"
                  value={identifier}
                  readOnly
                  className="input"
                />
              </div>
              <div>
                <label className="label">Sequence Number</label>
                <input
                  type="text"
                  value={`${sequenceNumber} (hex: ${decimalToHex(sequenceNumber)})`}
                  readOnly
                  className="input"
                />
              </div>
              <button
                onClick={buildTransaction}
                disabled={loading}
                className="button"
              >
                {loading ? 'Building...' : 'Build CIP-0170 Transaction'}
              </button>
            </div>
          )}

          {/* Step 6: Preview Metadata */}
          {currentStep === WorkflowStep.PREVIEW_METADATA && (
            <div>
              <h2>Preview Transaction Metadata</h2>
              <p style={{ fontSize: '0.875rem', marginBottom: '1rem', color: '#666' }}>
                This transaction will include:
                <br/>• Label 170: CIP-0170 attestation data
                <br/>• Original metadata labels: {metadata && Object.keys(metadata).join(', ')}
              </p>
              <div className="code-block">
                <pre>{JSON.stringify(cip170Metadata, null, 2)}</pre>
              </div>
              <button
                onClick={publishTransaction}
                disabled={loading}
                className="button"
              >
                {loading ? 'Publishing...' : 'Publish to Blockchain'}
              </button>
            </div>
          )}

          {/* Step 7: Completed */}
          {currentStep === WorkflowStep.COMPLETED && (
            <div>
              <h2 style={{color: '#22c55e'}}>Transaction Published!</h2>
              <div>
                <label className="label">Transaction Hash</label>
                <input
                  type="text"
                  value={publishedTxHash}
                  readOnly
                  className="input"
                />
                <a
                  href={`${explorerBaseUrl}/transaction/${publishedTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  View on Cardano Explorer →
                </a>
              </div>
              <button
                onClick={() => {
                  // Reset form
                  setCurrentStep(WorkflowStep.INPUT_TX_HASH);
                  setTxHash('');
                  setMetadata(null);
                  setMetadataHash('');
                  setSequenceNumber(0);
                  setIdentifier('');
                  setCip170Metadata(null);
                  setPublishedTxHash('');
                  setError('');
                  setSuccess('');
                }}
                className="button"
              >
                Start New Attestation
              </button>
            </div>
          )}
      </div>

      {/* Wallet Info */}
      {walletConnected && (
        <div className="wallet-info">
          Connected: <span>{walletName}</span>
        </div>
      )}
    </div>
  );
}
