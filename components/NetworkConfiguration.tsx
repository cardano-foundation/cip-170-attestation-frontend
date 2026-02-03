'use client';

import { useState, useEffect } from 'react';
import { SettingsIcon } from '@/components/icons';
import {
  CardanoNetwork,
  DEFAULT_NETWORKS,
  getCurrentNetworkConfig,
  saveNetworkConfig,
  saveBlockfrostApiKey,
  validateBlockfrostApiKey,
} from '@/lib/network-config';

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
    <div className="network-config">
      <button
        className="network-config-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="network-badge">{network.toUpperCase()}</span>
        <SettingsIcon size={18} />
        <span>Network Settings</span>
      </button>

      {isOpen && (
        <div className="network-config-panel">
          <div className="network-config-header">
            <h3>Network Configuration</h3>
            <button className="close-btn" onClick={() => setIsOpen(false)}>✕</button>
          </div>

          <div className="network-config-body">
            {/* Network Selection */}
            <div className="form-group">
              <label className="label">Cardano Network</label>
              <div className="network-buttons">
                {(Object.keys(DEFAULT_NETWORKS) as CardanoNetwork[]).map((net) => (
                  <button
                    key={net}
                    className={`network-btn ${network === net ? 'active' : ''}`}
                    onClick={() => handleNetworkChange(net)}
                  >
                    {net.charAt(0).toUpperCase() + net.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom URL Toggle */}
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={customMode}
                  onChange={handleCustomModeToggle}
                />
                <span>Use custom Blockfrost URL</span>
              </label>
            </div>

            {/* Blockfrost URL */}
            <div className="form-group">
              <label className="label">Blockfrost API URL</label>
              <input
                type="text"
                className="input"
                value={blockfrostUrl}
                onChange={(e) => setBlockfrostUrl(e.target.value)}
                disabled={!customMode}
                placeholder="https://cardano-mainnet.blockfrost.io/api/v0"
              />
            </div>

            {/* Explorer URL */}
            <div className="form-group">
              <label className="label">Explorer URL</label>
              <input
                type="text"
                className="input"
                value={explorerUrl}
                onChange={(e) => setExplorerUrl(e.target.value)}
                disabled={!customMode}
                placeholder="https://cardanoscan.io"
              />
            </div>

            {/* API Key */}
            <div className="form-group">
              <label className="label">Blockfrost API Key</label>
              <input
                type="password"
                className="input"
                value={blockfrostApiKey}
                onChange={(e) => setBlockfrostApiKey(e.target.value)}
                placeholder="Enter your Blockfrost API key"
              />
              <small className="help-text">
                Get your API key at <a href="https://blockfrost.io" target="_blank" rel="noopener noreferrer">blockfrost.io</a>
              </small>
            </div>

            {/* Validation Status */}
            {validationStatus && (
              <div className={`validation-status ${validationStatus.valid ? 'success' : 'error'}`}>
                {validationStatus.valid ? '✓ API key is valid' : `✗ ${validationStatus.error}`}
              </div>
            )}

            {/* Save Button */}
            <button
              className="button"
              onClick={handleValidateAndSave}
              disabled={isValidating || !blockfrostApiKey}
            >
              {isValidating ? 'Validating...' : 'Validate & Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
