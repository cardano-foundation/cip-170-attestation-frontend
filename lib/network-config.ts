// Network configuration utilities with localStorage and cookie support

export type CardanoNetwork = 'mainnet' | 'preprod' | 'preview';

export interface NetworkConfig {
  network: CardanoNetwork;
  blockfrostUrl: string;
  blockfrostApiKey: string;
  explorerUrl: string;
}

// Default network configurations
export const DEFAULT_NETWORKS: Record<CardanoNetwork, Omit<NetworkConfig, 'blockfrostApiKey'>> = {
  mainnet: {
    network: 'mainnet',
    blockfrostUrl: 'https://cardano-mainnet.blockfrost.io/api/v0',
    explorerUrl: 'https://cardanoscan.io',
  },
  preprod: {
    network: 'preprod',
    blockfrostUrl: 'https://cardano-preprod.blockfrost.io/api/v0',
    explorerUrl: 'https://preprod.cardanoscan.io',
  },
  preview: {
    network: 'preview',
    blockfrostUrl: 'https://cardano-preview.blockfrost.io/api/v0',
    explorerUrl: 'https://preview.cardanoscan.io',
  },
};

const STORAGE_KEY = 'keri-cardano-network-config';
const COOKIE_KEY = 'blockfrost-api-key';

/**
 * Get network configuration from localStorage
 */
export function getStoredNetworkConfig(): NetworkConfig | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const config = JSON.parse(stored);
    return config;
  } catch (error) {
    console.error('Failed to get stored network config:', error);
    return null;
  }
}

/**
 * Save network configuration to localStorage
 */
export function saveNetworkConfig(config: Omit<NetworkConfig, 'blockfrostApiKey'>): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save network config:', error);
  }
}

/**
 * Get Blockfrost API key from cookies
 */
export function getBlockfrostApiKey(): string {
  if (typeof document === 'undefined') return '';
  
  const cookies = document.cookie.split(';');
  const cookie = cookies.find(c => c.trim().startsWith(`${COOKIE_KEY}=`));
  
  if (!cookie) return '';
  
  return cookie.split('=')[1] || '';
}

/**
 * Save Blockfrost API key to cookies (expires in 30 days)
 */
export function saveBlockfrostApiKey(apiKey: string): void {
  if (typeof document === 'undefined') return;
  
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);
  
  document.cookie = `${COOKIE_KEY}=${apiKey}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
}

/**
 * Validate Blockfrost API key by making a test request
 */
export async function validateBlockfrostApiKey(apiKey: string, blockfrostUrl: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }
  
  try {
    const response = await fetch(`${blockfrostUrl}/health`, {
      method: 'GET',
      headers: {
        'project_id': apiKey,
      },
    });
    
    if (response.ok) {
      return { valid: true };
    } else if (response.status === 403) {
      return { valid: false, error: 'Invalid API key' };
    } else {
      return { valid: false, error: `Validation failed: ${response.status}` };
    }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Get current network configuration with defaults
 */
export function getCurrentNetworkConfig(): NetworkConfig {
  const stored = getStoredNetworkConfig();
  const apiKey = getBlockfrostApiKey();
  
  if (stored) {
    return {
      ...stored,
      blockfrostApiKey: apiKey,
    };
  }
  
  // Return default mainnet config
  return {
    ...DEFAULT_NETWORKS.mainnet,
    blockfrostApiKey: apiKey,
  };
}

/**
 * Get network magic number for wallet validation
 * Note: NetworkId from wallet API returns 0 for testnets and 1 for mainnet
 */
export function getNetworkMagic(network: CardanoNetwork): number {
  switch (network) {
    case 'mainnet':
      return 764824073; // Mainnet magic
    case 'preprod':
      return 1; // Preprod magic
    case 'preview':
      return 2; // Preview magic
    default:
      return 764824073;
  }
}
