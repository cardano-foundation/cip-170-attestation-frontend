'use client';

import { useState, useEffect, useCallback } from 'react';
import { SignifyClient, ready } from 'signify-ts';
import { hashMetadata, buildCIP170Metadata, decimalToHex, metadatumDigestInTx } from '@/lib/keri-utils';
import { WorkflowStep, TransactionMetadata, AttestationFlow, SignerKind } from '@/lib/types';
import { getSignifyBootUrl, getSignifyUrl } from '@/lib/config';
import {
  CardanoNetwork,
  getCurrentNetworkConfig,
  getNetworkMagic,
} from '@/lib/network-config';
import { buildClaimTxMetadata, txSeal, veridianAttestPlan } from '@/lib/cip170';
import {
  CLAIM_TTL_SLOTS,
  buildSealedTx,
  claimTxBodyInfo,
  fetchTipSlot,
  addVerifiedVkeyWitnesses,
  spendableUtxos,
  submitTx,
  txIdOf,
  verifyWitnessSet,
  witnessedKeyHashes,
} from '@/lib/claim-tx';
import { Gate, canAnchor, canSubmit } from '@/lib/claim-gates';
import {
  ClaimedTx,
  PENDING_CLAIM_STORAGE_KEY,
  PendingClaim,
  clearPendingClaim,
  decodeReturnFragment,
  encodeCosignLink,
  loadPendingClaim,
  newPendingTx,
  resumeTarget,
  savePendingClaim,
} from '@/lib/pending-claim';
import { RequiredKey, WalletKeys, fetchRequiredKeys, walletKeyHashes, walletOwnsKey } from '@/lib/required-keys';
import { PairedWallet, RemotesignError, RemotesignState, VeridianAgent, loadPairedWallet } from '@/lib/veridian';
import { KeriSigner, signifySigner, veridianSigner } from '@/lib/signer';
import { getPreviousStep, isStepCompleted } from '@/lib/workflow-state';
import NetworkConfiguration from '@/components/NetworkConfiguration';
import WalletConnection from '@/components/WalletConnection';
import TransactionInput from '@/components/TransactionInput';
import IdentifierInput from '@/components/IdentifierInput';
import ProgressTracker, { ATTEST_STEPS, CLAIM_STEPS } from '@/components/ProgressTracker';
import SegmentedChoice from '@/components/SegmentedChoice';
import ResetButton from '@/components/ResetButton';
import VeridianPairing from '@/components/VeridianPairing';
import ClaimTxInput from '@/components/claim/ClaimTxInput';
import ClaimKeys from '@/components/claim/ClaimKeys';
import ClaimSign from '@/components/claim/ClaimSign';
import ClaimAnchor from '@/components/claim/ClaimAnchor';
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
  const [warning, setWarning] = useState('');

  // Signer and flow choice
  const [signerKind, setSignerKind] = useState<SignerKind>('signify');
  const [flow, setFlow] = useState<AttestationFlow>('attest');
  const [veridianAgent, setVeridianAgent] = useState<VeridianAgent | null>(null);
  const [pairedWallet, setPairedWallet] = useState<PairedWallet | null>(null);

  // CLAIM_TX state
  const [claimInput, setClaimInput] = useState('');
  const [claimed, setClaimed] = useState<ClaimedTx[]>([]);
  const [claimWarnings, setClaimWarnings] = useState<Record<string, string[]>>({});
  const [walletKeys, setWalletKeys] = useState<WalletKeys | null>(null);
  const [pending, setPendingState] = useState<PendingClaim | null>(null);
  const [tipSlot, setTipSlot] = useState<number | null>(null);
  const [tipError, setTipError] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claimPasscode, setClaimPasscode] = useState('');
  const [anchorProgress, setAnchorProgress] = useState('');
  // Veridian ATTEST: the metadata seal anchored in the wallet's KEL (CIP-170 v1.1)
  const [anchoredSeal, setAnchoredSeal] = useState('');
  // in-flight Veridian request for the ATTEST anchor: a retry after the wallet replied only re-checks the KEL
  const [attestRequest, setAttestRequest] = useState<RemotesignState | undefined>(undefined);

  /** Update the pending claim and persist it, so a reload or a return link can resume */
  const updatePending = useCallback((fn: (prev: PendingClaim | null) => PendingClaim | null) => {
    setPendingState((prev) => {
      const next = fn(prev);
      if (next) savePendingClaim(next);
      else clearPendingClaim();
      return next;
    });
  }, []);

  /**
   * Add verified witnesses onto the *current* copy of the same claim, so concurrent updates (another tab, a wallet
   * popup that resolves after a discard) never roll back signatures or leak into a different claim.
   */
  const applyVerifiedWitnesses = useCallback(
    (verified: { txId: string; witnesses: any[] }, baseTxHex: string): string[] => {
      // reported from the base copy: the updater may run later than this call returns
      const before = witnessedKeyHashes(baseTxHex);
      const added = Array.from(new Set(verified.witnesses.map((w) => w.keyHash).filter((k) => !before.has(k))));
      updatePending((prev) => {
        if (!prev || prev.txId !== verified.txId) return prev;
        try {
          return { ...prev, txHex: addVerifiedVkeyWitnesses(prev.txHex, verified).txHex };
        } catch {
          return prev;
        }
      });
      return added;
    },
    [updatePending]
  );

  // Another tab (typically the one the cosigner's return link opened) may have updated the claim
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PENDING_CLAIM_STORAGE_KEY) return;
      const next = loadPendingClaim();
      setPendingState(next);
      if (next) setFlow('claim');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Load identifier from session storage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('keri_identifier');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.identifierName) setIdentifierName(data.identifierName);
        if (data.name) setName(data.name);
        if (data.signifyUrl) setSignifyUrl(data.signifyUrl);
        if (data.identifier) setIdentifier(data.identifier);
      } catch {
        // Ignore invalid session data
      }
    }
  }, []);

  // Resume a pending claim (after a reload or when the cosigner's return link is opened)
  useEffect(() => {
    const saved = loadPendingClaim();
    const returned = decodeReturnFragment(window.location.hash);
    if (returned) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    if (!saved) {
      if (returned) setError('These signatures belong to a transaction that was started in another browser.');
      return;
    }
    const currentNetwork = getCurrentNetworkConfig().network;
    if (saved.network !== currentNetwork) {
      setError(
        `A pending transaction exists for ${saved.network.toUpperCase()}. Switch the network in settings and reload to resume it.`
      );
      return;
    }

    const target = resumeTarget(saved);
    setFlow('claim');
    setSignerKind(saved.signerKind);
    setIdentifier(saved.aid);
    if (saved.signify) {
      if (saved.signify.identifierName) setIdentifierName(saved.signify.identifierName);
      setSignifyUrl(saved.signify.url);
    }
    setClaimed(saved.claimed);
    setClaimInput(saved.claimed.map((c) => c.txHash).join('\n'));
    setPendingState(saved);
    setCompletedSteps(new Set(target.completed));
    setCurrentStep(target.step);

    if (returned) {
      const required = new Set(claimTxBodyInfo(saved.txHex).requiredSigners);
      verifyWitnessSet(saved.txHex, returned.witnessSetHex, { allowedKeyHashes: required, expectedTxId: returned.txId })
        .then((verified) => {
          const added = applyVerifiedWitnesses(verified, saved.txHex);
          setSuccess(added.length ? `Added ${added.length} signature(s) from the key owner.` : 'These signatures were already added.');
        })
        .catch((err) => setError(`Could not add the returned signatures: ${err.message}`));
    } else {
      setSuccess('Resumed your pending claim.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    walletKeyHashes(wallet).then(setWalletKeys).catch(() => setWalletKeys(null));

    // A resumed claim keeps its place; connecting only adds the wallet
    if (pending) {
      setCurrentStep(pending.seal ? WorkflowStep.CLAIM_ANCHOR : WorkflowStep.CLAIM_SIGN);
      setSuccess('Wallet connected.');
      return;
    }

    // If identifier data is already loaded from session, skip the identifier step
    if (identifier && identifierName) {
      markStepCompleted(WorkflowStep.INPUT_IDENTIFIER);
      setCurrentStep(WorkflowStep.INPUT_TX_HASH);
      setSuccess('Wallet connected! Using previously saved identifier.');
    } else {
      setCurrentStep(WorkflowStep.INPUT_IDENTIFIER);
      setSuccess('Wallet connected successfully!');
    }
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
      setAnchoredSeal(''); // an earlier anchor belongs to other metadata
      setAttestRequest(undefined);
      markStepCompleted(WorkflowStep.INPUT_TX_HASH);

      // Hash the metadata inline using the local variable (state update is async)
      if (!isSodiumReady) {
        await ready();
        setIsSodiumReady(true);
      }
      const hash = hashMetadata(cborMetadataObj);
      setMetadataHash(hash);
      markStepCompleted(WorkflowStep.SHOW_METADATA);
      setCurrentStep(WorkflowStep.SHOW_METADATA);
      setSuccess('Transaction metadata fetched and hashed successfully!');
    } catch (err: any) {
      setError(`Failed to fetch metadata: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle identifier verification
  const handleIdentifierVerified = async (identifierPrefix: string) => {
    setIdentifier(identifierPrefix);

    // Persist identifier to session storage for future runs
    sessionStorage.setItem('keri_identifier', JSON.stringify({
      identifierName,
      name,
      signifyUrl,
      identifier: identifierPrefix,
    }));

    // Mark identifier completed and clear all downstream steps
    // (so re-verification from a later step resets the attestation flow)
    setCompletedSteps(new Set([WorkflowStep.CONNECT_WALLET, WorkflowStep.INPUT_IDENTIFIER]));

    // Brief delay so the user can see the "Verified" badge before advancing
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setCurrentStep(WorkflowStep.INPUT_TX_HASH);
    setSuccess('Identifier verified! Now enter the transaction hash.');
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

  // ATTEST with Veridian (CIP-170 v1.1): Veridian can only anchor SAIDs, so it anchors the metadata seal
  // SAID({d, t:"cardano-metadata-attest", l, digest}); the record keeps d = digest and carries v "1.1".
  const createVeridianAttestation = async () => {
    try {
      setLoading(true);
      setError('');
      if (!veridianAgent || !pairedWallet) throw new Error('Pair your Veridian wallet first');
      const { seal } = veridianAttestPlan(cborMetadata, metadataHash);
      const result = await veridianAgent.remoteSign(pairedWallet, seal.sad, {
        resume: attestRequest,
        onRequestSent: setAttestRequest,
        onProgress: setSuccess,
      });
      setAttestRequest(undefined);
      setAnchoredSeal(seal.said);
      setSequenceNumber(result.sn);
      markStepCompleted(WorkflowStep.BUILD_TRANSACTION);
      setCurrentStep(WorkflowStep.BUILD_TRANSACTION);
      setSuccess(`Veridian anchored the metadata seal in event #${result.sn}`);
    } catch (err: any) {
      // once the wallet replied, keep the request so a retry re-checks instead of asking for a second approval
      if (!(err instanceof RemotesignError && err.replied)) setAttestRequest(undefined);
      setSuccess('');
      setError(`Veridian signing failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Create KERI interaction event
  const createInteractionEvent = async () => {
    if (signerKind === 'veridian') {
      await createVeridianAttestation();
      return;
    }
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
      const interactionResult = await client.identifiers().interact(identifierName, metadataHash);
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

      if (signerKind === 'veridian' && !anchoredSeal) throw new Error('The metadata seal is not anchored yet');
      // a metadata-seal anchor requires v 1.1 (CIP-170); a raw-digest anchor keeps 1.0
      const cip170Meta = buildCIP170Metadata(identifier, metadataHash, sequenceNumber, metadata, anchoredSeal ? '1.1' : '1.0');

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

      // Get UTxOs from wallet (never spend one carrying a reference script)
      const walletUtxos = await walletApi.getUtxos();

      if (!walletUtxos || walletUtxos.length === 0) {
        throw new Error('No UTxOs available in wallet');
      }
      const utxos = spendableUtxos(walletUtxos);

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

      // The anchored digest covers the source tx's bytes; warn if the copy re-encoded them differently
      const attestedLabel = Object.keys(cborMetadata ?? {})[0];
      if (attestedLabel) {
        try {
          const onChainDigest = metadatumDigestInTx(unsignedTxHex, attestedLabel);
          if (onChainDigest !== metadataHash) {
            setWarning(
              `Label ${attestedLabel} is re-encoded in the new transaction: its bytes digest to ${onChainDigest ?? 'nothing'}, not the anchored ${metadataHash}. Verifiers digesting the new transaction's bytes will not match.`
            );
          }
        } catch {
          // check only
        }
      }

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

  // ---------------------------------------------------------------------------------------------
  // Signer choice
  // ---------------------------------------------------------------------------------------------

  const changeSignerKind = (kind: SignerKind) => {
    if (kind === signerKind) return;
    setSignerKind(kind);
    setAnchoredSeal('');
    setAttestRequest(undefined);
    setIdentifier('');
    setCompletedSteps((prev) => new Set([...prev].filter((s) => s === WorkflowStep.CONNECT_WALLET)));
  };

  const handleVeridianPaired = async (agent: VeridianAgent, wallet: PairedWallet) => {
    setVeridianAgent(agent);
    setPairedWallet(wallet);
    setIdentifier(wallet.aid);
    setCompletedSteps(new Set([WorkflowStep.CONNECT_WALLET, WorkflowStep.INPUT_IDENTIFIER]));
    setSuccess('Veridian wallet paired.');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setCurrentStep(WorkflowStep.INPUT_TX_HASH);
  };

  // ---------------------------------------------------------------------------------------------
  // CLAIM_TX flow
  // ---------------------------------------------------------------------------------------------

  // The claim's network is fixed when it is built; settings changes must not alter its seal
  const networkMagic = getNetworkMagic(pending?.network ?? network);
  const claimNetworkMismatch = !!pending && pending.network !== network;

  const resolveClaimKeys = async (hashes: string[]) => {
    try {
      setLoading(true);
      setError('');
      if (!blockfrostApiKey) throw new Error('Please configure Blockfrost API key in network settings');
      const warnings: Record<string, string[]> = {};
      const results: ClaimedTx[] = [];
      for (const txHash of hashes) {
        const { keys, warnings: w } = await fetchRequiredKeys(blockfrostUrl, blockfrostApiKey, txHash);
        if (w.length) warnings[txHash] = w;
        const previous = claimed.find((c) => c.txHash === txHash)?.linkingKey;
        results.push({ txHash, keys, linkingKey: previous && keys.some((k) => k.keyHash === previous) ? previous : defaultLinkingKey(keys) });
      }
      setClaimed(results);
      setClaimWarnings(warnings);
      markStepCompleted(WorkflowStep.INPUT_TX_HASH);
      setCurrentStep(WorkflowStep.CLAIM_KEYS);
      setSuccess('Required keys resolved. Pick a linking key for each transaction.');
    } catch (err: any) {
      setError(`Failed to resolve required keys: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /** Prefer a key the connected wallet holds, and payment keys over stake keys */
  const defaultLinkingKey = (keys: RequiredKey[]): string => {
    const isPayment = (k: RequiredKey) => k.roles.some((r) => r === 'input' || r === 'collateral' || r === 'required_signer');
    const ranked = [...keys].sort(
      (a, b) =>
        Number(walletOwnsKey(walletKeys, b.keyHash)) - Number(walletOwnsKey(walletKeys, a.keyHash)) ||
        Number(isPayment(b)) - Number(isPayment(a))
    );
    return ranked[0]?.keyHash ?? '';
  };

  let claimPreview: unknown = null;
  try {
    claimPreview = identifier && claimed.length ? buildClaimTxMetadata(identifier, claimed.map((c) => c.txHash)) : null;
  } catch (err: any) {
    claimPreview = { error: err.message };
  }

  const buildClaim = async () => {
    try {
      setLoading(true);
      setError('');
      if (pending) throw new Error('Discard the pending claim before building a new one');
      if (!walletApi) throw new Error('Connect your wallet first; it pays the fee');
      if (claimed.some((c) => !c.linkingKey)) throw new Error('Pick a linking key for every transaction');
      const tip = await fetchTipSlot(blockfrostUrl, blockfrostApiKey);
      const ttlSlot = tip + CLAIM_TTL_SLOTS;
      const metadata = buildClaimTxMetadata(identifier, claimed.map((c) => c.txHash));
      const { txHex, txId, inputKeys } = await buildSealedTx({
        walletApi,
        blockfrostApiKey,
        metadata,
        requiredSigners: claimed.map((c) => c.linkingKey),
        ttlSlot,
      });
      setTipSlot(tip);
      updatePending(() =>
        newPendingTx({
          kind: 'claim',
          txId,
          txHex,
          network,
          claimed,
          ttlSlot,
          inputKeys,
          signerKind,
          aid: identifier,
          keriaUrl: signifyUrl,
          identifierName: signerKind === 'signify' ? identifierName : '',
        })
      );
      markStepCompleted(WorkflowStep.CLAIM_KEYS);
      setCurrentStep(WorkflowStep.CLAIM_SIGN);
      setSuccess(`Claim transaction built: ${txId.slice(0, 16)}…`);
    } catch (err: any) {
      setError(`Failed to build the claim transaction: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshTip = useCallback(async () => {
    try {
      setTipSlot(await fetchTipSlot(blockfrostUrl, blockfrostApiKey));
      setTipError('');
    } catch (err: any) {
      setTipError(err.message || String(err));
    }
  }, [blockfrostUrl, blockfrostApiKey]);

  const onClaimStep = currentStep === WorkflowStep.CLAIM_SIGN || currentStep === WorkflowStep.CLAIM_ANCHOR;
  const hasPending = !!pending;
  useEffect(() => {
    // another tab submitted or discarded the claim
    if (onClaimStep && !hasPending) setCurrentStep(WorkflowStep.CLAIM_KEYS);
  }, [onClaimStep, hasPending]);
  useEffect(() => {
    if (!hasPending || !blockfrostUrl || !onClaimStep) return;
    refreshTip();
    const timer = setInterval(refreshTip, 30_000);
    return () => clearInterval(timer);
  }, [onClaimStep, hasPending, blockfrostUrl, refreshTip]);

  const signClaimWithWallet = async () => {
    if (!pending || !walletApi) return;
    try {
      setClaimBusy(true);
      setError('');
      const witnessSet = await walletApi.signTx(pending.txHex, true, false);
      if (!witnessSet || witnessSet === pending.txHex) throw new Error('The wallet returned no signatures');
      // only keys the tx needs: an extra witness would outgrow the fee estimate
      const needed = new Set([...claimTxBodyInfo(pending.txHex).requiredSigners, ...pending.inputKeys]);
      const verified = await verifyWitnessSet(pending.txHex, witnessSet, { allowedKeyHashes: needed, expectedTxId: pending.txId });
      const added = applyVerifiedWitnesses(verified, pending.txHex);
      setSuccess(added.length ? `Your wallet added ${added.length} signature(s).` : 'Your wallet had already signed.');
    } catch (err: any) {
      setError(`Signing failed: ${err.message}`);
    } finally {
      setClaimBusy(false);
    }
  };

  const addClaimSignatures = async (input: string): Promise<boolean> => {
    if (!pending) return false;
    try {
      setClaimBusy(true);
      setError('');
      const hashIndex = input.indexOf('#');
      const fromLink = hashIndex >= 0 ? decodeReturnFragment(input.slice(hashIndex)) : null;
      if (hashIndex >= 0 && !fromLink) throw new Error('This link does not contain signatures');
      const witnessSetHex = fromLink ? fromLink.witnessSetHex : input.toLowerCase();
      const required = new Set(claimTxBodyInfo(pending.txHex).requiredSigners);
      const verified = await verifyWitnessSet(pending.txHex, witnessSetHex, {
        allowedKeyHashes: required,
        expectedTxId: fromLink?.txId ?? pending.txId,
      });
      const added = applyVerifiedWitnesses(verified, pending.txHex);
      setSuccess(added.length ? `Added ${added.length} signature(s).` : 'These signatures were already added.');
      return true;
    } catch (err: any) {
      setError(`Could not add the signatures: ${err.message}`);
      return false;
    } finally {
      setClaimBusy(false);
    }
  };

  const cosignLink = (() => {
    if (!pending || typeof window === 'undefined') return '';
    try {
      // keys that still need a signature and that the connected wallet cannot provide
      const signed = witnessedKeyHashes(pending.txHex);
      const keys = claimTxBodyInfo(pending.txHex).requiredSigners.filter(
        (k) => !signed.has(k) && !walletOwnsKey(walletKeys, k)
      );
      return encodeCosignLink(window.location.origin, { network: pending.network, txHex: pending.txHex, keys });
    } catch {
      return '';
    }
  })();

  const gate = (check: () => Gate): Gate => {
    if (!pending) return { ok: false };
    if (claimNetworkMismatch) {
      return { ok: false, reason: `This claim was built for ${pending.network.toUpperCase()}; switch the network back in settings.` };
    }
    if (tipSlot === null) {
      return { ok: false, reason: tipError ? `Could not read the chain tip: ${tipError}` : 'Reading the chain tip…' };
    }
    try {
      return check();
    } catch (err: any) {
      return { ok: false, reason: `The pending claim cannot be read: ${err.message}` };
    }
  };
  const anchorGate = gate(() =>
    canAnchor({ txHex: pending!.txHex, inputKeys: pending!.inputKeys, tipSlot: tipSlot!, hasSeal: !!pending!.seal })
  );
  const submitGate = gate(() =>
    canSubmit({ txHex: pending!.txHex, inputKeys: pending!.inputKeys, tipSlot: tipSlot!, networkMagic, seal: pending!.seal })
  );

  const claimSigner = async (claim: PendingClaim): Promise<KeriSigner> => {
    if (claim.signerKind === 'veridian') {
      // the claim must be anchored through the agent (and pairing) on the KERIA it was built with
      const keriaUrl = claim.signify?.url ?? signifyUrl;
      const reuse = veridianAgent?.keriaUrl === keriaUrl;
      const agent = reuse ? veridianAgent! : await VeridianAgent.start(keriaUrl, getSignifyBootUrl(keriaUrl));
      const wallet = (reuse ? pairedWallet : null) ?? loadPairedWallet(keriaUrl);
      if (!wallet || wallet.aid !== claim.aid) throw new Error('Pair the Veridian wallet of identifier ' + claim.aid);
      setVeridianAgent(agent);
      setPairedWallet(wallet);
      return veridianSigner(agent, wallet);
    }
    const passcode = name || claimPasscode;
    if (!passcode) throw new Error('Enter your Signify passcode');
    return signifySigner({
      url: claim.signify?.url ?? signifyUrl,
      passcode,
      identifierName: claim.signify?.identifierName ?? identifierName,
      aid: claim.aid,
    });
  };

  const anchorClaim = async () => {
    if (!pending || anchoring) return;
    try {
      setAnchoring(true);
      setError('');
      if (claimNetworkMismatch) throw new Error(`This claim was built for ${pending.network}; switch the network back`);
      const tip = await fetchTipSlot(blockfrostUrl, blockfrostApiKey);
      setTipSlot(tip);
      const gate = canAnchor({ txHex: pending.txHex, inputKeys: pending.inputKeys, tipSlot: tip, hasSeal: !!pending.seal });
      if (!gate.ok) throw new Error(gate.reason);
      const seal = txSeal(networkMagic, txIdOf(pending.txHex));
      const signer = await claimSigner(pending);
      const result = await signer.anchorSad(seal.sad, {
        resume: pending.remotesign,
        onRequestSent: (state) => updatePending((prev) => (prev ? { ...prev, remotesign: state } : prev)),
        onProgress: setAnchorProgress,
      });
      updatePending((prev) => (prev ? { ...prev, seal: { said: seal.said, sn: result.sn }, remotesign: undefined } : prev));
      markStepCompleted(WorkflowStep.CLAIM_SIGN);
      setSuccess(`Transaction seal anchored in event #${result.sn}. You can now publish the transaction.`);
    } catch (err: any) {
      // Once the wallet has replied, a retry only re-checks its KEL. Otherwise a fresh click sends a new
      // request, and a late approval of the old one is ignored.
      if (!(err instanceof RemotesignError && err.replied)) {
        updatePending((prev) => (prev ? { ...prev, remotesign: undefined } : prev));
      }
      setError(`Anchoring failed: ${err.message}`);
    } finally {
      setAnchoring(false);
      setAnchorProgress('');
    }
  };

  const submitClaim = async () => {
    if (!pending || submitting) return;
    try {
      setSubmitting(true);
      setError('');
      if (claimNetworkMismatch) throw new Error(`This claim was built for ${pending.network}; switch the network back`);
      const tip = await fetchTipSlot(blockfrostUrl, blockfrostApiKey);
      setTipSlot(tip);
      const gate = canSubmit({ txHex: pending.txHex, inputKeys: pending.inputKeys, tipSlot: tip, networkMagic, seal: pending.seal });
      if (!gate.ok) throw new Error(gate.reason);
      const submitted = await submitTx(pending.txHex, {
        walletApi: walletConnected ? walletApi : undefined,
        blockfrostUrl,
        blockfrostApiKey,
      });
      if (submitted && submitted !== pending.txId) {
        setWarning(`The node reported transaction ${submitted}, expected ${pending.txId}.`);
      }
      setPublishedTxHash(pending.txId);
      updatePending(() => null);
      markStepCompleted(WorkflowStep.CLAIM_ANCHOR);
      markStepCompleted(WorkflowStep.COMPLETED);
      setCurrentStep(WorkflowStep.COMPLETED);
      setSuccess('Claim transaction published successfully!');
    } catch (err: any) {
      setError(`Failed to publish the transaction: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const discardClaim = () => {
    const back = WorkflowStep.CLAIM_KEYS;
    updatePending(() => null);
    const undone = new Set([back, WorkflowStep.CLAIM_SIGN]);
    setCompletedSteps((prev) => new Set([...prev].filter((s) => !undone.has(s))));
    setCurrentStep(back);
    setSuccess('Pending transaction discarded.');
  };

  // Start over: forget everything about the current run. The Veridian agent passcode and wallet pairing are this
  // browser's identity, not part of a run, so they stay (no need to rescan the app QR code).
  const resetAll = () => {
    updatePending(() => null);
    try {
      sessionStorage.removeItem('keri_identifier');
    } catch {
      // ignore
    }
    setWalletConnected(false);
    setWalletApi(null);
    setWalletName('');
    setWalletAddress('');
    setWalletKeys(null);
    setTxHash('');
    setIdentifierName('');
    setName('');
    setSignifyUrl(defaultSignifyUrl);
    setMetadata(null);
    setCborMetadata(null);
    setMetadataHash('');
    setSequenceNumber(0);
    setIdentifier('');
    setCip170Metadata(null);
    setPublishedTxHash('');
    setSignerKind('signify');
    setFlow('attest');
    setVeridianAgent(null);
    setPairedWallet(null);
    setClaimInput('');
    setClaimed([]);
    setClaimWarnings({});
    setTipSlot(null);
    setTipError('');
    setClaimPasscode('');
    setAnchorProgress('');
    setAnchoredSeal('');
    setAttestRequest(undefined);
    setError('');
    setWarning('');
    setCompletedSteps(new Set());
    setCurrentStep(WorkflowStep.CONNECT_WALLET);
    setSuccess('Started over.');
  };

  // Handle going back
  const sealedFlowSteps = flow === 'claim' ? CLAIM_STEPS : null;
  const handleBack = () => {
    const order = sealedFlowSteps?.map((s) => s.step) ?? [];
    if (order.includes(currentStep)) {
      const previous = order[order.indexOf(currentStep) - 1];
      if (previous) navigateToStep(previous);
      return;
    }
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

  const signerSelector = (
    <SegmentedChoice<SignerKind>
      label="Signer"
      value={signerKind}
      onChange={changeSignerKind}
      disabled={!!pending}
      options={[
        { value: 'signify', title: 'Signify agent', description: 'Your identifier on a KERIA agent, unlocked with its passcode.' },
        { value: 'veridian', title: 'Veridian wallet', description: 'Approve every anchor on your phone.', badge: 'mobile' },
      ]}
    />
  );

  const flowSelector = (
    <SegmentedChoice<AttestationFlow>
      label="Attestation type"
      value={flow}
      disabled={!!pending}
      onChange={(next) => {
        setFlow(next);
        setError('');
      }}
      options={[
        {
          value: 'attest',
          title: 'Attest metadata',
          description:
            signerKind === 'veridian'
              ? 'Sign the metadata of an existing transaction (ATTEST, anchored as a metadata seal).'
              : 'Sign the metadata of an existing transaction (ATTEST).',
          badge: signerKind === 'veridian' ? 'v1.1' : undefined,
        },
        {
          value: 'claim',
          title: 'Claim transactions',
          description: 'Prove your identifier and a key that signed them acted together (CLAIM_TX).',
          badge: 'v1.1',
        },
      ]}
    />
  );

  return (
    <div className="relative z-10 w-full max-w-[960px] xl:max-w-[1060px] mx-auto px-4 sm:px-6 lg:px-8 py-4 min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        {/* Left: Cardano logo */}
        <div className="flex items-center gap-2">
          <img src="/cardano-logo-white.png" alt="Cardano" className="h-8 w-auto" />
          <a href="https://cips.cardano.org/cip/CIP-0170" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
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
        <div className="flex items-center justify-end gap-2">
          <ResetButton
            onReset={resetAll}
            disabled={loading || anchoring || submitting || claimBusy}
            warning={pending ? 'A built transaction and its signatures will be discarded' : undefined}
          />
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
        {warning && !error && (
          <motion.div
            key="warning"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <Alert className="mb-2 bg-brand-warning/[0.10] border-brand-warning/30">
              <AlertDescription className="text-brand-warning/90 text-sm break-all">{warning}</AlertDescription>
            </Alert>
          </motion.div>
        )}
        {success && !error && !warning && (
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
          steps={sealedFlowSteps ?? ATTEST_STEPS}
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

          {/* Step 3: Input Transaction Hash */}
          {currentStep === WorkflowStep.INPUT_TX_HASH && (
            <motion.div
              key="tx-input"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
              {flow === 'attest' ? (
                <TransactionInput
                  txHash={txHash}
                  onTxHashChange={setTxHash}
                  onFetchMetadata={fetchTransactionMetadata}
                  loading={loading}
                  flowSelector={flowSelector}
                />
              ) : (
                <ClaimTxInput
                  value={claimInput}
                  onChange={setClaimInput}
                  onResolve={resolveClaimKeys}
                  loading={loading}
                  flowSelector={flowSelector}
                />
              )}
              <StepNavigation onBack={handleBack} />
            </motion.div>
          )}

          {/* Step 2: Input KERI Identifier */}
          {currentStep === WorkflowStep.INPUT_IDENTIFIER && (
            <motion.div
              key="identifier"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
              {signerKind === 'veridian' ? (
                <VeridianPairing
                  keriaUrl={signifyUrl}
                  isSodiumReady={isSodiumReady}
                  onPaired={handleVeridianPaired}
                  onError={setError}
                  modeSelector={signerSelector}
                />
              ) : (
              <IdentifierInput
                modeSelector={signerSelector}
                identifierName={identifierName}
                onIdentifierNameChange={setIdentifierName}
                name={name}
                onNameChange={setName}
                signifyUrl={signifyUrl}
                onSignifyUrlChange={setSignifyUrl}
                onIdentifierVerified={handleIdentifierVerified}
                onError={setError}
                isSodiumReady={isSodiumReady}
                preVerifiedIdentifier={identifier || undefined}
              />
              )}
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
                    <Label className="text-white/80 text-sm font-medium">Blake3-256 Digest (CESR format)</Label>
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
                nextLabel={signerKind === 'veridian' ? 'Request Signature in Veridian' : 'Create KERI Interaction Event'}
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

                  {signerKind === 'veridian' && anchoredSeal && (
                    <div className="space-y-2">
                      <Label className="text-white/80 text-sm font-medium">Anchored metadata seal</Label>
                      <Input
                        type="text"
                        value={anchoredSeal}
                        readOnly
                        className="h-11 bg-black/40 border-white/[0.10] text-brand-success/80 font-mono text-sm cursor-default"
                      />
                      <p className="text-white/40 text-xs">
                        Veridian anchors SAIDs only, so its KEL holds the metadata seal of the digest instead of the digest
                        itself. The record keeps d = digest with v 1.1; verifiers recompute the seal (CIP-170 v1.1).
                      </p>
                    </div>
                  )}

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

          {/* Claim: linking keys */}
          {currentStep === WorkflowStep.CLAIM_KEYS && (
            <motion.div
              key="claim-keys"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
              <ClaimKeys
                claimed={claimed}
                warnings={claimWarnings}
                walletKeys={walletKeys}
                onSelect={(hash, key) =>
                  setClaimed((prev) => prev.map((c) => (c.txHash === hash ? { ...c, linkingKey: key } : c)))
                }
                metadataPreview={claimPreview}
              />
              {pending && (
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 bg-brand-warning/[0.10] border border-brand-warning/25 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-brand-warning/90 flex-1">
                    A claim transaction ({pending.txId.slice(0, 12)}…) is already built. Changing keys means discarding it,
                    including collected signatures{pending.seal ? ' and its anchored seal' : ''}; links you sent stop working.
                  </p>
                  <button
                    type="button"
                    onClick={discardClaim}
                    className="text-xs text-brand-error/80 hover:text-brand-error shrink-0"
                  >
                    Discard it
                  </button>
                </div>
              )}
              <StepNavigation
                onBack={handleBack}
                onNext={pending ? () => navigateToStep(pending.seal ? WorkflowStep.CLAIM_ANCHOR : WorkflowStep.CLAIM_SIGN) : buildClaim}
                nextLabel={pending ? 'Continue with Pending Claim' : 'Build Claim Transaction'}
                nextDisabled={!pending && (!walletApi || claimed.length === 0 || claimed.some((c) => !c.linkingKey))}
                loading={loading}
              />
            </motion.div>
          )}

          {/* Claim: signatures */}
          {currentStep === WorkflowStep.CLAIM_SIGN && pending && (
            <motion.div
              key="claim-sign"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
              <ClaimSign
                pending={pending}
                walletKeys={walletKeys}
                walletConnected={walletConnected}
                tipSlot={tipSlot}
                cosignLink={cosignLink}
                busy={claimBusy}
                onSignWithWallet={signClaimWithWallet}
                onAddSignatures={addClaimSignatures}
              />
              <button
                type="button"
                onClick={discardClaim}
                className="mt-2 text-xs text-white/40 hover:text-brand-error/80 transition-colors"
              >
                Discard this transaction
              </button>
              <StepNavigation
                onBack={handleBack}
                onNext={() => navigateToStep(WorkflowStep.CLAIM_ANCHOR)}
                nextLabel="Continue to Seal"
                nextDisabled={!anchorGate.ok && !pending.seal}
              />
            </motion.div>
          )}

          {/* Claim: anchor seal and submit */}
          {currentStep === WorkflowStep.CLAIM_ANCHOR && pending && (
            <motion.div
              key="claim-anchor"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.2 } }}
            >
              <ClaimAnchor
                pending={pending}
                sealSaid={txSeal(networkMagic, pending.txId).said}
                anchorGate={anchorGate}
                submitGate={submitGate}
                anchoring={anchoring}
                progress={anchorProgress}
                submitting={submitting}
                onAnchor={anchorClaim}
                onSubmit={submitClaim}
                onResetRequest={
                  pending.remotesign && !anchoring
                    ? () => updatePending((prev) => (prev ? { ...prev, remotesign: undefined } : prev))
                    : undefined
                }
                needPasscode={pending.signerKind === 'signify' && !name}
                passcode={claimPasscode}
                onPasscodeChange={setClaimPasscode}
              />
              <StepNavigation onBack={anchoring || submitting ? undefined : handleBack} />
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
                  {flow === 'claim' ? 'Claim Published!' : 'Transaction Published!'}
                </motion.h2>
                <motion.p
                  className="text-white/60 text-sm mb-4 max-w-sm mx-auto"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  {flow === 'claim'
                    ? 'Your CLAIM_TX transaction is on its way to the blockchain. Verifiers find the seal in your KEL.'
                    : 'Your attestation transaction has been successfully published to the blockchain'}
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
                      // Reset transaction-specific state
                      setTxHash('');
                      setMetadata(null);
                      setCborMetadata(null);
                      setMetadataHash('');
                      setSequenceNumber(0);
                      setCip170Metadata(null);
                      setAnchoredSeal('');
                      setAttestRequest(undefined);
                      setPublishedTxHash('');
                      setClaimInput('');
                      setClaimed([]);
                      setClaimWarnings({});
                      setError('');
                      setSuccess('');
                      setWarning('');

                      // If identifier is stored in session, skip the identifier step
                      if (identifier && (identifierName || signerKind === 'veridian')) {
                        setCurrentStep(WorkflowStep.INPUT_TX_HASH);
                        setCompletedSteps(new Set([WorkflowStep.CONNECT_WALLET, WorkflowStep.INPUT_IDENTIFIER]));
                      } else {
                        setCurrentStep(WorkflowStep.INPUT_IDENTIFIER);
                        setCompletedSteps(new Set([WorkflowStep.CONNECT_WALLET]));
                        setIdentifierName('');
                        setName('');
                        setIdentifier('');
                      }
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
          <a href="https://github.com/cardano-foundation/cip-170-attestation-frontend" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
