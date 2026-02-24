'use client';

import { useState, useEffect, useCallback } from 'react';
import { SettingsIcon } from '@/components/icons';
import {
  CardanoNetwork,
  DEFAULT_NETWORKS,
  getCurrentNetworkConfig,
  saveNetworkConfig,
  saveBlockfrostApiKey,
  validateBlockfrostApiKey,
} from '@/lib/network-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'motion/react';

interface NetworkConfigProps {
  onConfigChange: (config: { network: CardanoNetwork; blockfrostUrl: string; blockfrostApiKey: string; explorerUrl: string }) => void;
}

export default function NetworkConfiguration({ onConfigChange }: NetworkConfigProps) {
  const [network, setNetwork] = useState<CardanoNetwork>('mainnet');
  const [customMode, setCustomMode] = useState(false);
  const [blockfrostUrl, setBlockfrostUrl] = useState('');
  const [blockfrostApiKey, setBlockfrostApiKey] = useState('');
  const [explorerUrl, setExplorerUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{ valid: boolean; error?: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Escape key handler
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsOpen(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  useEffect(() => {
    const config = getCurrentNetworkConfig();
    setNetwork(config.network);
    setBlockfrostUrl(config.blockfrostUrl);
    setBlockfrostApiKey(config.blockfrostApiKey);
    setExplorerUrl(config.explorerUrl);

    // Check if using custom URL
    const defaultConfig = DEFAULT_NETWORKS[config.network];
    setCustomMode(config.blockfrostUrl !== defaultConfig.blockfrostUrl);
  }, []);

  const handleNetworkChange = (newNetwork: CardanoNetwork) => {
    setNetwork(newNetwork);

    if (!customMode) {
      const defaultConfig = DEFAULT_NETWORKS[newNetwork];
      setBlockfrostUrl(defaultConfig.blockfrostUrl);
      setExplorerUrl(defaultConfig.explorerUrl);
    }
  };

  const handleCustomModeToggle = () => {
    const newCustomMode = !customMode;
    setCustomMode(newCustomMode);

    if (!newCustomMode) {
      const defaultConfig = DEFAULT_NETWORKS[network];
      setBlockfrostUrl(defaultConfig.blockfrostUrl);
      setExplorerUrl(defaultConfig.explorerUrl);
    }
  };

  const handleValidateAndSave = async () => {
    setIsValidating(true);
    setValidationStatus(null);

    // Validate API key
    const validation = await validateBlockfrostApiKey(blockfrostApiKey, blockfrostUrl);
    setValidationStatus(validation);

    if (validation.valid) {
      // Save configuration
      saveNetworkConfig({
        network,
        blockfrostUrl,
        explorerUrl,
      });

      // Save API key to cookies
      saveBlockfrostApiKey(blockfrostApiKey);

      // Notify parent
      onConfigChange({
        network,
        blockfrostUrl,
        blockfrostApiKey,
        explorerUrl,
      });

      setIsOpen(false);
    }

    setIsValidating(false);
  };

  return (
    <div className="relative z-[1001]">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15] transition-all duration-200 shadow-lg shadow-black/20"
      >
        <Badge
          variant="outline"
          className={`text-[0.6rem] font-bold uppercase tracking-wider border ${
            network === 'mainnet'
              ? 'bg-brand-success/20 text-brand-success border-brand-success/30'
              : 'bg-brand-warning/20 text-brand-warning border-brand-warning/30'
          }`}
        >
          {network}
        </Badge>
        <SettingsIcon size={14} className="text-white/50" />
        <span className="text-white/70 text-xs font-medium hidden sm:inline">Settings</span>
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999]"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full mt-2 right-0 w-[380px] max-w-[90vw] glass-elevated rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-[1001]"
            >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-white">Network Configuration</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Network selection */}
              <div className="space-y-2">
                <Label className="text-white/70 text-xs font-medium uppercase tracking-wider">Network</Label>
                <div className="flex gap-1.5 p-1 rounded-lg bg-white/[0.06]">
                  {(Object.keys(DEFAULT_NETWORKS) as CardanoNetwork[]).map((net) => (
                    <button
                      key={net}
                      onClick={() => handleNetworkChange(net)}
                      className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all duration-200 capitalize ${
                        network === net
                          ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20'
                          : 'text-white/50 hover:text-white/70 hover:bg-white/[0.06]'
                      }`}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom mode toggle */}
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ${
                    customMode ? 'bg-brand-primary' : 'bg-white/10'
                  }`}>
                    <motion.div
                      className="w-4 h-4 rounded-full bg-white shadow-sm"
                      animate={{ x: customMode ? 16 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  </div>
                  <span className="text-white/70 text-xs font-medium group-hover:text-white/80 transition-colors">
                    Custom Blockfrost URL
                  </span>
                </label>
              </div>

              {/* Blockfrost URL */}
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs font-medium">Blockfrost API URL</Label>
                <Input
                  type="text"
                  value={blockfrostUrl}
                  onChange={(e) => setBlockfrostUrl(e.target.value)}
                  disabled={!customMode}
                  placeholder="https://cardano-mainnet.blockfrost.io/api/v0"
                  className="h-9 text-xs bg-white/[0.07] border-white/[0.14] text-white placeholder:text-white/25 disabled:opacity-40 focus-ring"
                />
              </div>

              {/* Explorer URL */}
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs font-medium">Explorer URL</Label>
                <Input
                  type="text"
                  value={explorerUrl}
                  onChange={(e) => setExplorerUrl(e.target.value)}
                  disabled={!customMode}
                  placeholder="https://cardanoscan.io"
                  className="h-9 text-xs bg-white/[0.07] border-white/[0.14] text-white placeholder:text-white/25 disabled:opacity-40 focus-ring"
                />
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs font-medium">Blockfrost API Key</Label>
                <Input
                  type="password"
                  value={blockfrostApiKey}
                  onChange={(e) => setBlockfrostApiKey(e.target.value)}
                  placeholder="Enter your Blockfrost API key"
                  className="h-9 text-xs bg-white/[0.07] border-white/[0.14] text-white placeholder:text-white/25 focus-ring"
                />
                <p className="text-white/40 text-[0.65rem]">
                  Get your API key at{' '}
                  <a href="https://blockfrost.io" target="_blank" rel="noopener noreferrer" className="text-brand-primary/70 hover:text-brand-primary transition-colors">
                    blockfrost.io
                  </a>
                </p>
              </div>

              {/* Validation status */}
              {validationStatus && (
                <div className={`p-3 rounded-lg text-xs font-medium ${
                  validationStatus.valid
                    ? 'bg-brand-success/[0.12] border border-brand-success/20 text-brand-success'
                    : 'bg-brand-error/[0.12] border border-brand-error/20 text-brand-error'
                }`}>
                  {validationStatus.valid ? 'API key validated successfully' : validationStatus.error}
                </div>
              )}

              {/* Save button */}
              <Button
                onClick={handleValidateAndSave}
                disabled={isValidating || !blockfrostApiKey}
                className="w-full gradient-button text-white font-semibold h-10 text-sm shadow-[0_4px_16px_rgba(99,102,241,0.2)] disabled:opacity-50 disabled:shadow-none"
              >
                {isValidating ? (
                  <>
                    <span className="spinner-icon" />
                    Validating...
                  </>
                ) : (
                  'Validate & Save'
                )}
              </Button>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
