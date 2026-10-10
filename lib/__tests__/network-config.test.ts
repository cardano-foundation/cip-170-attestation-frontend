import { describe, expect, it } from 'vitest';
import { DEFAULT_NETWORKS, envNetworkDefaults, resolveBlockfrostKey, resolveNetworkConfig } from '@/lib/network-config';

const preprodEnv = {
  network: 'preprod',
  blockfrostUrl: 'https://cardano-preprod.blockfrost.io/api/v0',
  explorerUrl: 'https://explorer.cardano.org/preprod',
};

describe('network configuration', () => {
  it('defaults to the .env network and URLs', () => {
    expect(resolveNetworkConfig(null, preprodEnv)).toEqual({
      network: 'preprod',
      blockfrostUrl: preprodEnv.blockfrostUrl,
      explorerUrl: preprodEnv.explorerUrl,
      fromSettings: false,
    });
  });

  it('uses the public URLs of the .env network when no URL is set', () => {
    expect(envNetworkDefaults({ network: 'preview' })).toEqual({ ...DEFAULT_NETWORKS.preview });
  });

  it('falls back to mainnet only when .env names no valid network', () => {
    expect(envNetworkDefaults({}).network).toBe('mainnet');
    expect(envNetworkDefaults({ network: 'devnet' }).network).toBe('mainnet');
  });

  it('keeps settings saved under the same .env network', () => {
    const stored = { ...DEFAULT_NETWORKS.preview, envNetwork: 'preprod' };
    expect(resolveNetworkConfig(stored, preprodEnv).network).toBe('preview');
  });

  it('lets an edited .env win over settings saved under another .env network', () => {
    const storedMainnet = { ...DEFAULT_NETWORKS.mainnet, envNetwork: 'mainnet' };
    expect(resolveNetworkConfig(storedMainnet, preprodEnv).network).toBe('preprod');
    // settings saved by an older build carry no envNetwork
    expect(resolveNetworkConfig({ ...DEFAULT_NETWORKS.mainnet }, preprodEnv).network).toBe('preprod');
  });
});

describe('blockfrost key', () => {
  it('uses the Settings key only together with the Settings network', () => {
    expect(resolveBlockfrostKey(true, 'cookieKey', 'envKey')).toBe('cookieKey');
    expect(resolveBlockfrostKey(false, 'cookieKey', 'envKey')).toBe('envKey');
  });

  it('falls back to whichever key exists', () => {
    expect(resolveBlockfrostKey(true, '', 'envKey')).toBe('envKey');
    expect(resolveBlockfrostKey(false, 'cookieKey', undefined)).toBe('cookieKey');
    expect(resolveBlockfrostKey(false, '', undefined)).toBe('');
  });
});
