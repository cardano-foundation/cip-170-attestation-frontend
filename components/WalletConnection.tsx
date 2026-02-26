'use client';

import { useState } from 'react';
import { WalletIcon, WarningIcon } from '@/components/icons';
import { BrowserWallet } from '@meshsdk/core';
import { CardanoNetwork, getNetworkMagic } from '@/lib/network-config';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';

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
    <div className="text-center py-3 px-2">
      {/* Breathing wallet icon */}
      <motion.div
        className="flex justify-center mb-3"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="w-16 h-16 rounded-2xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
          <WalletIcon size={32} className="text-brand-primary" />
        </div>
      </motion.div>

      <h2 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h2>
      <p className="text-white/60 text-sm mb-4 max-w-sm mx-auto">
        Connect your Cardano wallet to begin the attestation process
      </p>

      {/* Network warning */}
      <div className="flex items-center gap-2 bg-brand-warning/[0.12] border border-brand-warning/30 text-brand-warning rounded-lg px-4 py-3 mb-4 mx-auto text-sm w-fit">
        <WarningIcon size={16} className="shrink-0" />
        <span>Make sure your wallet is connected to <strong>{network.toUpperCase()}</strong></span>
      </div>

      <AnimatePresence mode="wait">
        {!showWalletList ? (
          <motion.div
            key="connect-button"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <Button
              onClick={checkWallets}
              disabled={loading}
              className="gradient-button text-white font-semibold h-12 px-8 shadow-[0_4px_20px_rgba(0,132,255,0.25)] hover:shadow-[0_6px_28px_rgba(0,132,255,0.35)] transition-all duration-300 hover:scale-[1.02]"
            >
              {loading ? (
                <>
                  <span className="spinner-icon" />
                  Connecting...
                </>
              ) : (
                'Connect Wallet'
              )}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="wallet-list"
            className="space-y-2 mt-4 max-w-sm mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <p className="text-white/70 text-sm font-medium text-left mb-2">Select your wallet:</p>
            {availableWallets.map((wallet, i) => (
              <motion.div
                key={wallet.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Button
                  onClick={() => connectWallet(wallet.name)}
                  disabled={loading}
                  variant="outline"
                  className="w-full justify-start gap-3 h-12 bg-white/[0.06] border-white/[0.12] text-white hover:bg-white/[0.08] hover:border-brand-primary/30 transition-all duration-200"
                >
                  <img
                    src={wallet.icon}
                    alt={wallet.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="font-semibold">{wallet.name}</span>
                </Button>
              </motion.div>
            ))}
            <Button
              onClick={() => setShowWalletList(false)}
              variant="ghost"
              disabled={loading}
              className="text-white/40 hover:text-white/60 hover:bg-white/[0.04] w-full mt-2"
            >
              Cancel
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
