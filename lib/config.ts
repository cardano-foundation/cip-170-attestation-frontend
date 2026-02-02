// Environment configuration utilities

/**
 * Get the Cardano network from environment variables
 * Defaults to 'mainnet' if not set
 */
export function getCardanoNetwork(): 'mainnet' | 'preprod' | 'preview' {
  const network = process.env.NEXT_PUBLIC_CARDANO_NETWORK || 'mainnet';
  
  if (network === 'mainnet' || network === 'preprod' || network === 'preview') {
    return network;
  }
  
  console.warn(`Invalid CARDANO_NETWORK value: ${network}, defaulting to mainnet`);
  return 'mainnet';
}

/**
 * Get the Blockfrost API base URL based on the network
 */
export function getBlockfrostUrl(network: 'mainnet' | 'preprod' | 'preview'): string {
  const urls = {
    mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
    preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
    preview: 'https://cardano-preview.blockfrost.io/api/v0',
  };
  
  return urls[network];
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
export function getCardanoExplorerUrl(network: 'mainnet' | 'preprod' | 'preview'): string {
  const urls = {
    mainnet: 'https://explorer.cardano.org',
    preprod: 'https://preprod.cardanoscan.io',
    preview: 'https://preview.cardanoscan.io',
  };
  
  return urls[network];
}
