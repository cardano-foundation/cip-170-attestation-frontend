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
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { motion, AnimatePresence } from 'motion/react';

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

  // Copy to clipboard helper
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyToClipboard = async (text: string, field?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (field) {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      }
    } catch {
      // clipboard not available
    }
  };

  return (
    <div className="relative z-10 w-full max-w-[960px] xl:max-w-[1060px] mx-auto px-4 sm:px-6 lg:px-8 py-4 min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        {/* Left: Cardano logo */}
        <div className="flex items-center gap-2">
          <img src="/cardano-logo-white.png" alt="Cardano" className="h-8 w-auto" />
          <a href="https://github.com/cardano-foundation/CIPs/pull/1113" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
            <Badge variant="outline" className="bg-brand-primary/10 text-brand-primary border-brand-primary/20 text-xs font-semibold hover:bg-brand-primary/20 transition-colors">
              CIP-0170
            </Badge>
          </a>
        </div>

        {/* Center: Title */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold gradient-text tracking-tight">
            Transaction Attestation
          </h1>
          <p className="text-sm hidden sm:block gradient-text-brand">
            Attest Cardano transactions with KERI
          </p>
        </div>

        {/* Right: Settings */}
        <div className="flex items-center justify-end">
          <NetworkConfiguration onConfigChange={handleNetworkConfigChange} />
        </div>
      </div>

      {/* Critical Initialization Error */}
      {sodiumError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Alert className="mb-2 bg-brand-error/[0.15] border-brand-error/30">
            <AlertDescription className="text-brand-error text-sm">
              <strong>Critical Error:</strong> {sodiumError}
              <p className="mt-1 text-brand-error/70 text-xs">
                The cryptographic library (libsodium) failed to initialize.
                This usually happens due to browser compatibility issues or WebAssembly loading failures.
              </p>
            </AlertDescription>
          </Alert>
        </motion.div>
      )}

      {/* Status Messages */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, x: [-10, 10, -10, 0] }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <Alert className="mb-2 bg-brand-error/[0.12] border-brand-error/30">
              <AlertDescription className="text-brand-error/90 text-sm">{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}
        {success && !error && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <Alert className="mb-2 bg-brand-success/[0.12] border-brand-success/30">
              <AlertDescription className="text-brand-success/90 text-sm">{success}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Tracker */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <ProgressTracker
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={navigateToStep}
        />
      </motion.div>

      {/* Main Card */}
      <Card className="glass-card rounded-2xl p-4 sm:p-5 mb-2 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* Step 1: Connect Wallet */}
          {currentStep === WorkflowStep.CONNECT_WALLET && (
            <motion.div
              key="wallet"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
              <WalletConnection
                network={network}
                onConnect={handleWalletConnect}
                onError={setError}
              />
            </motion.div>
          )}

          {/* Step 2: Input Transaction Hash */}
          {currentStep === WorkflowStep.INPUT_TX_HASH && (
            <motion.div
              key="tx-input"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
              <TransactionInput
                txHash={txHash}
                onTxHashChange={setTxHash}
                onFetchMetadata={fetchTransactionMetadata}
                loading={loading}
              />
              <StepNavigation onBack={handleBack} />
            </motion.div>
          )}

          {/* Step 3: Input KERI Identifier */}
          {currentStep === WorkflowStep.INPUT_IDENTIFIER && (
            <motion.div
              key="identifier"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
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
            </motion.div>
          )}

          {/* Step 4: Show Metadata and Hash */}
          {currentStep === WorkflowStep.SHOW_METADATA && (
            <motion.div
              key="metadata"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
              <div className="py-3 px-1">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
                    <ChartIcon size={24} className="text-brand-primary" />
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-white text-center mb-1">Transaction Metadata</h2>
                <p className="text-white/60 text-sm text-center mb-4">
                  Review the fetched metadata and its cryptographic hash
                </p>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-white/80 text-sm font-medium">Metadata Content</Label>
                    <div className="relative group">
                      <div className="code-display font-[var(--font-mono)] max-h-[300px] overflow-y-auto rounded-lg">
                        <pre>{JSON.stringify(metadata, null, 2)}</pre>
                      </div>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(metadata, null, 2), 'metadata')}
                        className="absolute top-2 right-2 p-1.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-white/40 hover:text-white hover:bg-white/[0.12] transition-all duration-200 opacity-0 group-hover:opacity-100"
                        title="Copy to clipboard"
                      >
                        {copiedField === 'metadata' ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-success">
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80 text-sm font-medium">Blake2b Hash (CESR format)</Label>
                    <Input
                      type="text"
                      value={metadataHash}
                      readOnly
                      className="h-11 bg-black/40 border-white/[0.10] text-brand-success/80 font-mono text-sm cursor-default"
                    />
                  </div>
                </div>
              </div>

              <StepNavigation
                onBack={handleBack}
                onNext={createInteractionEvent}
                nextLabel="Create KERI Interaction Event"
                nextDisabled={!isSodiumReady}
                loading={loading}
              />
            </motion.div>
          )}

          {/* Step 5: Build Transaction */}
          {currentStep === WorkflowStep.BUILD_TRANSACTION && (
            <motion.div
              key="build"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
              <div className="py-3 px-1">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
                    <BuildIcon size={24} className="text-brand-primary" />
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-white text-center mb-1">Interaction Event Created</h2>
                <p className="text-white/60 text-sm text-center mb-4">
                  Your KERI interaction event has been created successfully
                </p>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-white/80 text-sm font-medium">Identifier</Label>
                    <Input
                      type="text"
                      value={identifier}
                      readOnly
                      className="h-11 bg-black/40 border-white/[0.10] text-white/70 font-mono text-sm cursor-default"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80 text-sm font-medium">Sequence Number</Label>
                    <Input
                      type="text"
                      value={`${sequenceNumber} (hex: ${decimalToHex(sequenceNumber)})`}
                      readOnly
                      className="h-11 bg-black/40 border-white/[0.10] text-white/70 font-mono text-sm cursor-default"
                    />
                  </div>
                </div>
              </div>

              <StepNavigation
                onBack={handleBack}
                onNext={buildTransaction}
                nextLabel="Build CIP-0170 Transaction"
                loading={loading}
              />
            </motion.div>
          )}

          {/* Step 6: Preview Metadata */}
          {currentStep === WorkflowStep.PREVIEW_METADATA && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
              <div className="py-3 px-1">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
                    <EyeIcon size={24} className="text-brand-primary" />
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-white text-center mb-1">Preview Transaction Metadata</h2>
                <p className="text-white/60 text-sm text-center mb-3">
                  Review the complete CIP-0170 compliant metadata before publishing
                </p>

                <div className="mb-4">
                  <p className="text-xs text-white/50 uppercase tracking-wider font-medium mb-2">Transaction includes</p>
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-primary/[0.08] border border-brand-primary/20">
                      <span className="text-brand-primary font-mono text-xs font-semibold">170</span>
                      <span className="text-white/60 text-xs">CIP-0170 attestation</span>
                    </div>
                    {metadata && Object.keys(metadata).map((label) => (
                      <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-secondary/[0.08] border border-brand-secondary/20">
                        <span className="text-brand-secondary font-mono text-xs font-semibold">{label}</span>
                        <span className="text-white/60 text-xs">original</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white/80 text-sm font-medium">Complete Metadata</Label>
                  <div className="relative group">
                    <div className="code-display font-[var(--font-mono)] max-h-[300px] overflow-y-auto rounded-lg">
                      <pre>{JSON.stringify(cip170Metadata, null, 2)}</pre>
                    </div>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(cip170Metadata, null, 2), 'cip170')}
                      className="absolute top-2 right-2 p-1.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-white/40 hover:text-white hover:bg-white/[0.12] transition-all duration-200 opacity-0 group-hover:opacity-100"
                      title="Copy to clipboard"
                    >
                      {copiedField === 'cip170' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-success">
                          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <StepNavigation
                onBack={handleBack}
                onNext={publishTransaction}
                nextLabel="Publish to Blockchain"
                loading={loading}
              />
            </motion.div>
          )}

          {/* Step 7: Completed */}
          {currentStep === WorkflowStep.COMPLETED && (
            <motion.div
              key="completed"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25, opacity: { duration: 0.3 } }}
            >
              <div className="py-3 px-1 text-center">
                {/* Celebration particles */}
                <div className="relative flex justify-center mb-3">
                  <motion.div
                    className="absolute w-32 h-32 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(0,190,122,0.15), transparent 70%)' }}
                    animate={{ scale: [0, 1.5], opacity: [0.8, 0] }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  />
                  <motion.div
                    className="w-16 h-16 rounded-2xl bg-brand-success/15 border border-brand-success/25 flex items-center justify-center"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  >
                    <CheckIcon size={32} className="text-brand-success" />
                  </motion.div>
                </div>

                <motion.h2
                  className="text-2xl font-bold text-brand-success mb-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  Transaction Published!
                </motion.h2>
                <motion.p
                  className="text-white/60 text-sm mb-4 max-w-sm mx-auto"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  Your attestation transaction has been successfully published to the blockchain
                </motion.p>

                <motion.div
                  className="space-y-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <div className="space-y-2 text-left">
                    <Label className="text-white/80 text-sm font-medium">Transaction Hash</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={publishedTxHash}
                        readOnly
                        className="h-11 bg-black/40 border-white/[0.10] text-brand-success/80 font-mono text-xs cursor-default flex-1"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(publishedTxHash)}
                        className="h-11 w-11 shrink-0 bg-white/[0.03] border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.06]"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </Button>
                    </div>
                  </div>

                  <a
                    href={`${explorerUrl}/transaction/${publishedTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full h-11 rounded-lg border border-brand-secondary/30 text-brand-secondary text-sm font-semibold hover:bg-brand-secondary/10 transition-all duration-200 gap-2"
                  >
                    View on Cardano Explorer
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>

                  <Button
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
                    className="w-full gradient-button text-white font-semibold h-11 shadow-[0_4px_20px_rgba(0,132,255,0.25)]"
                  >
                    Start New Attestation
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Wallet Info */}
      {walletConnected && walletAddress && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <WalletInfoDisplay
            walletName={walletName}
            address={walletAddress}
            network={network}
          />
        </motion.div>
      )}

      {/* Footer */}
      <footer className="mt-auto pt-6 mb-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-2 text-white/30 text-xs">
        <span>&copy; {new Date().getFullYear()} KERI Transaction Attestation</span>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-white/60 transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-white/60 transition-colors">Terms of Service</a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
