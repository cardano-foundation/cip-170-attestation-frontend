// Environment configuration utilities

/**
 * Get the Cardano network from environment variables
 * Defaults to 'mainnet' if not set
 */
export function getCardanoNetwork(): 'mainnet' | 'preprod' | 'preview' | 'devnet' {
  const network = process.env.NEXT_PUBLIC_CARDANO_NETWORK || 'mainnet';
  
  if (network === 'mainnet' || network === 'preprod' || network === 'preview' || network === 'devnet') {
    return network;
  }
  
  console.warn(`Invalid CARDANO_NETWORK value: ${network}, defaulting to mainnet`);
  return 'mainnet';
}

/**
 * Get the Blockfrost API base URL based on the network
 */
export function getBlockfrostUrl(): string {

  return process.env.NEXT_PUBLIC_CARDANO_BLOCKFROST_API_URL || 'https://cardano-mainnet.blockfrost.io/api/v0';
}

/**
 * Get the Signify service URL from environment variables
 * Defaults to 'http://localhost:3901' if not set
 */
export function getSignifyUrl(): string {
  return process.env.NEXT_PUBLIC_SIGNIFY_URL || 'http://localhost:3901';
}

/**
 * Get the Cardano Explorer URL based on the network
 */
export function getCardanoExplorerUrl(): string {
  
  return process.env.NEXT_PUBLIC_CARDANO_EXPLORER_PREFIX || 'http://localhost:5173';
}
