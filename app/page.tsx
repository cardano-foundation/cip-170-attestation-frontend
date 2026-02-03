'use client';

import { useState, useEffect } from 'react';
import { SignifyClient, ready } from 'signify-ts';
import { hashMetadata, buildCIP170Metadata, decimalToHex } from '@/lib/keri-utils';
import { WorkflowStep, TransactionMetadata } from '@/lib/types';
import { getSignifyUrl } from '@/lib/config';
import { 
  CardanoNetwork, 
  getCurrentNetworkConfig, 
  getBlockfrostApiKey,
  saveBlockfrostApiKey 
} from '@/lib/network-config';
import { getPreviousStep, isStepCompleted } from '@/lib/workflow-state';
import NetworkConfiguration from '@/components/NetworkConfiguration';
import WalletConnection from '@/components/WalletConnection';
import TransactionInput from '@/components/TransactionInput';
import IdentifierInput from '@/components/IdentifierInput';
import ProgressTracker from '@/components/ProgressTracker';
import WalletInfoDisplay from '@/components/WalletInfoDisplay';
import StepNavigation from '@/components/StepNavigation';
import { ChartIcon, BuildIcon, EyeIcon, CheckIcon } from '@/components/icons';
import { MeshTxBuilder } from '@meshsdk/core';
import { BlockfrostProvider } from '@meshsdk/core';
import sodium from 'libsodium-wrappers-sumo';

// Constants
const MIN_ADA_LOVELACE = '1000000'; // 1 ADA minimum for transaction output

export default function Home() {
  // Network configuration
  const [network, setNetwork] = useState<CardanoNetwork>('mainnet');
  const [blockfrostUrl, setBlockfrostUrl] = useState('');
  const [blockfrostApiKey, setBlockfrostApiKey] = useState('');
  const [explorerUrl, setExplorerUrl] = useState('');
  
  const defaultSignifyUrl = getSignifyUrl();

  // Initialize network config from localStorage/cookies
  useEffect(() => {
    const config = getCurrentNetworkConfig();
    setNetwork(config.network);
    setBlockfrostUrl(config.blockfrostUrl);
    setBlockfrostApiKey(config.blockfrostApiKey);
    setExplorerUrl(config.explorerUrl);
  }, []);

  // Wallet state
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletApi, setWalletApi] = useState<any>(null);
  const [walletName, setWalletName] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<string>('');

  // Libsodium state
  const [isSodiumReady, setIsSodiumReady] = useState(false);
  const [sodiumError, setSodiumError] = useState('');

  useEffect(() => {
    const initSodium = async () => {
      try {
        await sodium.ready;
        await ready(); // Helper from signify-ts might also do things, but we ensure wrapper is ready first
        console.log('Libsodium initialized');
        setIsSodiumReady(true);
        setSodiumError('');
      } catch (err: any) {
        console.error('Libsodium initialization failed:', err);
        setSodiumError(`Libsodium failed to load: ${err.message || err}. Try refreshing the page.`);
      }
    };
    initSodium();
  }, []);

  // Form inputs
  const [txHash, setTxHash] = useState('');
  const [identifierName, setIdentifierName] = useState('');
  const [name, setName] = useState('');
  const [signifyUrl, setSignifyUrl] = useState(defaultSignifyUrl);

  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(WorkflowStep.CONNECT_WALLET);
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());
  const [metadata, setMetadata] = useState<TransactionMetadata | null>(null);
  const [cborMetadata, setCborMetadata] = useState<TransactionMetadata | null>(null);
  const [metadataHash, setMetadataHash] = useState('');
  const [sequenceNumber, setSequenceNumber] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [cip170Metadata, setCip170Metadata] = useState<any>(null);
  const [publishedTxHash, setPublishedTxHash] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Mark step as completed
  const markStepCompleted = (step: WorkflowStep) => {
    setCompletedSteps(prev => new Set(prev).add(step));
  };

  // Navigate to step
  const navigateToStep = (step: WorkflowStep) => {
    setCurrentStep(step);
    setError('');
    setSuccess('');
  };

  // Handle network configuration change
  const handleNetworkConfigChange = (config: {
    network: CardanoNetwork;
    blockfrostUrl: string;
    blockfrostApiKey: string;
    explorerUrl: string;
  }) => {
    setNetwork(config.network);
    setBlockfrostUrl(config.blockfrostUrl);
    setBlockfrostApiKey(config.blockfrostApiKey);
    setExplorerUrl(config.explorerUrl);
    setSuccess('Network configuration updated successfully!');
  };

  // Connect wallet handler
  const handleWalletConnect = (wallet: any, address: string, name: string) => {
    setWalletApi(wallet);
    setWalletAddress(address);
    setWalletName(name);
    setWalletConnected(true);
    markStepCompleted(WorkflowStep.CONNECT_WALLET);
    setCurrentStep(WorkflowStep.INPUT_TX_HASH);
    setSuccess('Wallet connected successfully!');
  };

  // Fetch transaction metadata from Blockfrost
  const fetchTransactionMetadata = async () => {
    try {
      setLoading(true);
      setError('');
      
      if (!blockfrostApiKey) {
        throw new Error('Please configure Blockfrost API key in network settings');
      }

      if (!txHash) {
        throw new Error('Please provide transaction hash');
      }

      // Fetch JSON metadata for display and transaction building
      const jsonResponse = await fetch(`${blockfrostUrl}/txs/${txHash}/metadata`, {
        method: 'GET',
        headers: {
          'project_id': blockfrostApiKey,
        },
      });

      if (!jsonResponse.ok) {
        const errorData = await jsonResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `Blockfrost API error: ${jsonResponse.status}`);
      }

      const jsonMetadata = await jsonResponse.json();

      if (!jsonMetadata || jsonMetadata.length === 0) {
        throw new Error('No metadata found for this transaction');
      }

      // Fetch CBOR metadata for hash calculation
      const cborResponse = await fetch(`${blockfrostUrl}/txs/${txHash}/metadata/cbor`, {
        method: 'GET',
        headers: {
          'project_id': blockfrostApiKey,
        },
      });

      if (!cborResponse.ok) {
        const errorData = await cborResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `Blockfrost API error (CBOR): ${cborResponse.status}`);
      }

      const cborMetadataArray = await cborResponse.json();

      if (!cborMetadataArray || cborMetadataArray.length === 0) {
        throw new Error('No CBOR metadata found for this transaction');
      }

      // Convert JSON metadata array to object
      const jsonMetadataObj: TransactionMetadata = {};
      jsonMetadata.forEach((item: any) => {
        jsonMetadataObj[item.label] = item.json_metadata;
      });

      // Convert CBOR metadata array to object
      const cborMetadataObj: TransactionMetadata = {};
      cborMetadataArray.forEach((item: any) => {
        cborMetadataObj[item.label] = item.cbor_metadata;
      });

      setMetadata(jsonMetadataObj);
      setCborMetadata(cborMetadataObj);
      markStepCompleted(WorkflowStep.INPUT_TX_HASH);
      setCurrentStep(WorkflowStep.INPUT_IDENTIFIER);
      setSuccess('Transaction metadata fetched successfully!');
    } catch (err: any) {
      setError(`Failed to fetch metadata: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle identifier verification
  const handleIdentifierVerified = async (identifierPrefix: string) => {
    setIdentifier(identifierPrefix);
    markStepCompleted(WorkflowStep.INPUT_IDENTIFIER);
    // Automatically hash metadata and proceed
    await hashAndShowMetadata();
  };

  // Hash metadata and show to user
  const hashAndShowMetadata = async () => {
    try {
      setLoading(true);
      setError('');

      if (!cborMetadata) {
        throw new Error('No CBOR metadata to hash');
      }

      // Initialize libsodium (required for Diger in hashMetadata)
      if (!isSodiumReady) {
        await ready();
        setIsSodiumReady(true);
      }
      
      // Use CBOR metadata for hashing
      const hash = hashMetadata(cborMetadata);
      setMetadataHash(hash);
      markStepCompleted(WorkflowStep.SHOW_METADATA);
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

      if (!identifierName || !name || !identifier) {
        throw new Error('Identifier information incomplete or not verified');
      }

      // Initialize libsodium (required for signify-ts)
      if (!isSodiumReady) {
        await ready();
        setIsSodiumReady(true);
      }

      // Initialize Signify client
      const client = new SignifyClient(signifyUrl, name);
      
      // Connect to Signify
      await client.connect();

      // Create interaction event with the hash
      const interactionResult = await client.identifiers().interact(identifierName, [metadataHash]);
      console.log('Interaction event created:', interactionResult);
      
      // Get the sequence number from the interaction
      const serder = interactionResult.serder;
      const sad = serder.sad;
      const seqNo = parseInt(sad.s, 16);
      
      setSequenceNumber(seqNo);
      markStepCompleted(WorkflowStep.BUILD_TRANSACTION);
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
      markStepCompleted(WorkflowStep.PREVIEW_METADATA);
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

      if (!blockfrostApiKey) {
        throw new Error('Blockfrost API key not configured');
      }

      // Get wallet address and UTxOs
      const usedAddresses = await walletApi.getUsedAddresses();
      const changeAddress = await walletApi.getChangeAddress();
      
      if (!usedAddresses || usedAddresses.length === 0) {
        throw new Error('No addresses found in wallet');
      }

      // Get UTxOs from wallet
      const utxos = await walletApi.getUtxos();
      
      if (!utxos || utxos.length === 0) {
        throw new Error('No UTxOs available in wallet');
      }

      // Initialize Blockfrost provider
      const blockfrostProvider = new BlockfrostProvider(blockfrostApiKey);

      // Build transaction with MeshTxBuilder
      const meshTxBuilder = new MeshTxBuilder({
        fetcher: blockfrostProvider,
        submitter: blockfrostProvider,
        evaluator: blockfrostProvider,
      });

      // Build transaction: send to self with minimum ADA and add metadata
      const unsignedTx = await meshTxBuilder
        .txOut(usedAddresses[0], [
          {
            unit: 'lovelace',
            quantity: MIN_ADA_LOVELACE,
          },
        ])
        .changeAddress(changeAddress)
        .metadataValue(170, cip170Metadata['170'])
        .selectUtxosFrom(utxos)
        .complete();

      // Add all other metadata labels (besides 170 which we already added)
      const txBuilder = new MeshTxBuilder({
        fetcher: blockfrostProvider,
        submitter: blockfrostProvider,
        evaluator: blockfrostProvider,
      });

      // Start building transaction
      let txBuilderChain = txBuilder
        .txOut(usedAddresses[0], [
          {
            unit: 'lovelace',
            quantity: MIN_ADA_LOVELACE,
          },
        ])
        .changeAddress(changeAddress);

      // Add all metadata labels
      Object.keys(cip170Metadata).forEach((label) => {
        txBuilderChain = txBuilderChain.metadataValue(Number(label), cip170Metadata[label]);
      });

      // Complete the transaction
      const unsignedTxHex = await txBuilderChain
        .selectUtxosFrom(utxos)
        .complete();

      // Sign transaction with wallet
      const signedTxHex = await walletApi.signTx(unsignedTxHex, true);

      // Submit transaction
      const txHash = await walletApi.submitTx(signedTxHex);
      
      setPublishedTxHash(txHash);
      markStepCompleted(WorkflowStep.COMPLETED);
      setCurrentStep(WorkflowStep.COMPLETED);
      setSuccess('Transaction published successfully!');
    } catch (err: any) {
      setError(`Failed to publish transaction: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle going back
  const handleBack = () => {
    const previousStep = getPreviousStep(currentStep);
    if (previousStep) {
      navigateToStep(previousStep);
    }
  };

  return (
    <div className="container">
      <h1>KERI Cardano Transaction Attestation</h1>
      <p>Attest Cardano transactions with KERI using Signify</p>

      {/* Network Configuration */}
      <NetworkConfiguration onConfigChange={handleNetworkConfigChange} />

      {/* Critical Initialization Error */}
      {sodiumError && (
        <div className="error" style={{border: '2px solid red', padding: '1rem', marginBottom: '1rem'}}>
          <strong>Critical Error:</strong> {sodiumError}
          <div style={{marginTop: '0.5rem', fontSize: '0.9em'}}>
            The cryptographic library (libsodium) failed to initialize. 
            This usually happens due to browser compatibility issues or WebAssembly loading failures.
          </div>
        </div>
      )}

      {/* Status Messages */}
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Progress Tracker */}
      {walletConnected && (
        <ProgressTracker
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={navigateToStep}
        />
      )}

      <div className="card">
        {/* Step 1: Connect Wallet */}
        {currentStep === WorkflowStep.CONNECT_WALLET && (
          <WalletConnection
            network={network}
            onConnect={handleWalletConnect}
            onError={setError}
          />
        )}

        {/* Step 2: Input Transaction Hash */}
        {currentStep === WorkflowStep.INPUT_TX_HASH && (
          <>
            <TransactionInput
              txHash={txHash}
              onTxHashChange={setTxHash}
              onFetchMetadata={fetchTransactionMetadata}
              loading={loading}
            />
            <StepNavigation onBack={handleBack} />
          </>
        )}

        {/* Step 3: Input KERI Identifier */}
        {currentStep === WorkflowStep.INPUT_IDENTIFIER && (
          <>
            <IdentifierInput
              identifierName={identifierName}
              onIdentifierNameChange={setIdentifierName}
              name={name}
              onNameChange={setName}
              signifyUrl={signifyUrl}
              onSignifyUrlChange={setSignifyUrl}
              onIdentifierVerified={handleIdentifierVerified}
              onError={setError}
              isSodiumReady={isSodiumReady}
            />
            <StepNavigation onBack={handleBack} />
          </>
        )}

        {/* Step 4: Show Metadata and Hash */}
        {currentStep === WorkflowStep.SHOW_METADATA && (
          <div>
            <div className="step-card">
              <div className="step-icon">
                <ChartIcon size={48} />
              </div>
              <h2>Transaction Metadata</h2>
              <p className="subtitle">
                Review the fetched metadata and its cryptographic hash
              </p>
              
              <div className="form-group">
                <label className="label">Metadata Content</label>
                <div className="code-block">
                  <pre>{JSON.stringify(metadata, null, 2)}</pre>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Blake2b Hash (CESR format)</label>
                <input
                  type="text"
                  value={metadataHash}
                  readOnly
                  className="input"
                />
              </div>
            </div>
            
            <StepNavigation
              onBack={handleBack}
              onNext={createInteractionEvent}
              nextLabel="Create KERI Interaction Event"
              nextDisabled={!isSodiumReady}
              loading={loading}
            />
          </div>
        )}

        {/* Step 5: Build Transaction */}
        {currentStep === WorkflowStep.BUILD_TRANSACTION && (
          <div>
            <div className="step-card">
              <div className="step-icon">
                <BuildIcon size={48} />
              </div>
              <h2>Interaction Event Created</h2>
              <p className="subtitle">
                Your KERI interaction event has been created successfully
              </p>
              
              <div className="form-group">
                <label className="label">Identifier</label>
                <input
                  type="text"
                  value={identifier}
                  readOnly
                  className="input"
                />
              </div>

              <div className="form-group">
                <label className="label">Sequence Number</label>
                <input
                  type="text"
                  value={`${sequenceNumber} (hex: ${decimalToHex(sequenceNumber)})`}
                  readOnly
                  className="input"
                />
              </div>
            </div>
            
            <StepNavigation
              onBack={handleBack}
              onNext={buildTransaction}
              nextLabel="Build CIP-0170 Transaction"
              loading={loading}
            />
          </div>
        )}

        {/* Step 6: Preview Metadata */}
        {currentStep === WorkflowStep.PREVIEW_METADATA && (
          <div>
            <div className="step-card">
              <div className="step-icon">
                <EyeIcon size={48} />
              </div>
              <h2>Preview Transaction Metadata</h2>
              <p className="subtitle">
                Review the complete CIP-0170 compliant metadata before publishing
              </p>
              
              <div style={{ fontSize: '0.95rem', marginBottom: '1.5rem', color: '#666', textAlign: 'left' }}>
                This transaction will include:
                <br/>• <strong>Label 170:</strong> CIP-0170 attestation data
                <br/>• <strong>Original metadata labels:</strong> {metadata && Object.keys(metadata).join(', ')}
              </div>

              <div className="form-group">
                <label className="label">Complete Metadata</label>
                <div className="code-block">
                  <pre>{JSON.stringify(cip170Metadata, null, 2)}</pre>
                </div>
              </div>
            </div>
            
            <StepNavigation
              onBack={handleBack}
              onNext={publishTransaction}
              nextLabel="Publish to Blockchain"
              loading={loading}
            />
          </div>
        )}

        {/* Step 7: Completed */}
        {currentStep === WorkflowStep.COMPLETED && (
          <div>
            <div className="step-card">
              <div className="step-icon">
                <CheckIcon size={48} />
              </div>
              <h2 style={{color: 'var(--success-color)', textAlign: 'center'}}>
                Transaction Published!
              </h2>
              <p className="subtitle">
                Your attestation transaction has been successfully published to the blockchain
              </p>
              
              <div className="form-group">
                <label className="label">Transaction Hash</label>
                <input
                  type="text"
                  value={publishedTxHash}
                  readOnly
                  className="input"
                />
              </div>

              <a
                href={`${explorerUrl}/transaction/${publishedTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="button button-secondary"
                style={{ marginBottom: '1rem', display: 'block', textDecoration: 'none' }}
              >
                View on Cardano Explorer →
              </a>

              <button
                onClick={() => {
                  // Reset form
                  setCurrentStep(WorkflowStep.INPUT_TX_HASH);
                  setCompletedSteps(new Set([WorkflowStep.CONNECT_WALLET]));
                  setTxHash('');
                  setMetadata(null);
                  setCborMetadata(null);
                  setMetadataHash('');
                  setSequenceNumber(0);
                  setIdentifier('');
                  setIdentifierName('');
                  setName('');
                  setCip170Metadata(null);
                  setPublishedTxHash('');
                  setError('');
                  setSuccess('');
                }}
                className="button button-primary"
              >
                Start New Attestation
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Wallet Info */}
      {walletConnected && walletAddress && (
        <WalletInfoDisplay
          walletName={walletName}
          address={walletAddress}
          network={network}
        />
      )}
    </div>
  );
}
