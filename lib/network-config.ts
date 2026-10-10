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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, envNetwork: envNetworkDefaults(readNetworkEnv()).network }));
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

export interface NetworkEnv {
  network?: string;
  blockfrostUrl?: string;
  explorerUrl?: string;
  blockfrostProjectId?: string;
}

/** The NEXT_PUBLIC_* values (inlined at build time; restart `next dev` after changing .env) */
export function readNetworkEnv(): NetworkEnv {
  return {
    network: process.env.NEXT_PUBLIC_CARDANO_NETWORK,
    blockfrostUrl: process.env.NEXT_PUBLIC_CARDANO_BLOCKFROST_API_URL,
    explorerUrl: process.env.NEXT_PUBLIC_CARDANO_EXPLORER_PREFIX,
    blockfrostProjectId: process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID,
  };
}

function isNetwork(value: unknown): value is CardanoNetwork {
  return value === 'mainnet' || value === 'preprod' || value === 'preview';
}

/** Defaults from .env: its network, and its Blockfrost/explorer URLs (else the public ones of that network) */
export function envNetworkDefaults(env: NetworkEnv): Omit<NetworkConfig, 'blockfrostApiKey'> {
  const network: CardanoNetwork = isNetwork(env.network) ? env.network : 'mainnet';
  return {
    network,
    blockfrostUrl: env.blockfrostUrl || DEFAULT_NETWORKS[network].blockfrostUrl,
    explorerUrl: env.explorerUrl || DEFAULT_NETWORKS[network].explorerUrl,
  };
}

/**
 * Settings saved in the browser win over .env, but only while .env still says what it said when they were saved:
 * editing .env must take effect even after the settings panel was used.
 */
export function resolveNetworkConfig(
  stored: (Omit<NetworkConfig, 'blockfrostApiKey'> & { envNetwork?: string }) | null,
  env: NetworkEnv
): Omit<NetworkConfig, 'blockfrostApiKey'> & { fromSettings: boolean } {
  const defaults = envNetworkDefaults(env);
  if (stored && isNetwork(stored.network) && stored.envNetwork === defaults.network) {
    return { network: stored.network, blockfrostUrl: stored.blockfrostUrl, explorerUrl: stored.explorerUrl, fromSettings: true };
  }
  return { ...defaults, fromSettings: false };
}

/**
 * Blockfrost project IDs work on one network only, so the key saved in Settings applies only together with the
 * settings it was saved with; when .env decides the network, its project ID comes first.
 */
export function resolveBlockfrostKey(fromSettings: boolean, cookieKey: string, envKey?: string): string {
  return fromSettings ? cookieKey || envKey || '' : envKey || cookieKey || '';
}

/**
 * Get current network configuration with defaults
 */
export function getCurrentNetworkConfig(): NetworkConfig {
  const env = readNetworkEnv();
  const { fromSettings, ...config } = resolveNetworkConfig(getStoredNetworkConfig(), env);
  return { ...config, blockfrostApiKey: resolveBlockfrostKey(fromSettings, getBlockfrostApiKey(), env.blockfrostProjectId) };
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
