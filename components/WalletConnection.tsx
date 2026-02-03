'use client';

import { useState } from 'react';
import { BrowserWallet } from '@meshsdk/core';
import { CardanoNetwork, getNetworkMagic } from '@/lib/network-config';

interface WalletConnectionProps {
  network: CardanoNetwork;
  onConnect: (wallet: any, address: string, walletName: string) => void;
  onError: (error: string) => void;
}

export default function WalletConnection({ network, onConnect, onError }: WalletConnectionProps) {
  const [loading, setLoading] = useState(false);
  const [availableWallets, setAvailableWallets] = useState<any[]>([]);
  const [showWalletList, setShowWalletList] = useState(false);

  const checkWallets = async () => {
    try {
      const wallets = await BrowserWallet.getInstalledWallets();
      
      if (wallets.length === 0) {
        onError('No Cardano wallet found. Please install a wallet extension like Eternl, Nami, or Flint.');
        return;
      }
      
      setAvailableWallets(wallets);
      setShowWalletList(true);
    } catch (err: any) {
      onError(`Failed to detect wallets: ${err.message}`);
    }
  };

  const connectWallet = async (walletName: string) => {
    try {
      setLoading(true);
      onError('');
      
      const wallet = await BrowserWallet.enable(walletName);
      
      // Get wallet network ID
      const networkId = await wallet.getNetworkId();
      
      // Validate network match (networkId 0 = testnet, 1 = mainnet)
      const isMainnet = network === 'mainnet';
      const walletIsMainnet = networkId === 1;
      
      if (isMainnet !== walletIsMainnet) {
        const walletNetworkName = walletIsMainnet ? 'Mainnet' : 'Testnet';
        const expectedNetworkName = isMainnet ? 'Mainnet' : 'Testnet';
        onError(
          `Network mismatch! Wallet is connected to ${walletNetworkName} but app is set to ${network.toUpperCase()} (${expectedNetworkName}). Please switch your wallet network or change the app network configuration.`
        );
        setLoading(false);
        return;
      }
      
      // Get wallet address
      const usedAddresses = await wallet.getUsedAddresses();
      const changeAddress = await wallet.getChangeAddress();
      const address = usedAddresses?.[0] || changeAddress;
      
      if (!address) {
        onError('Could not get wallet address. Please make sure your wallet is properly set up.');
        setLoading(false);
        return;
      }
      
      onConnect(wallet, address, walletName);
      setShowWalletList(false);
    } catch (err: any) {
      onError(`Failed to connect wallet: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wallet-connection">
      <div className="wallet-card">
        <div className="wallet-icon">🔗</div>
        <h2>Connect Your Wallet</h2>
        <p className="subtitle">
          Connect your Cardano wallet to begin the attestation process
        </p>
        
        <div className="network-warning">
          <strong>⚠️ Network:</strong> Make sure your wallet is connected to <strong>{network.toUpperCase()}</strong>
        </div>

        {!showWalletList ? (
          <button
            onClick={checkWallets}
            disabled={loading}
            className="button button-primary"
          >
            {loading ? 'Connecting...' : 'Connect Wallet'}
          </button>
        ) : (
          <div className="wallet-list">
            <p className="wallet-list-title">Select your wallet:</p>
            {availableWallets.map((wallet) => (
              <button
                key={wallet.name}
                onClick={() => connectWallet(wallet.name)}
                disabled={loading}
                className="wallet-option"
              >
                <img 
                  src={wallet.icon} 
                  alt={wallet.name}
                  className="wallet-icon-small"
                />
                <span>{wallet.name}</span>
              </button>
            ))}
            <button
              onClick={() => setShowWalletList(false)}
              className="button button-secondary"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
