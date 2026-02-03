'use client';

import { CardanoNetwork } from '@/lib/network-config';

interface WalletInfoDisplayProps {
  walletName: string;
  address: string;
  network: CardanoNetwork;
}

export default function WalletInfoDisplay({
  walletName,
  address,
  network,
}: WalletInfoDisplayProps) {
  const shortenAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 15)}...${addr.slice(-15)}`;
  };

  return (
    <div className="wallet-info-display">
      <div className="wallet-info-row">
        <span className="wallet-info-label">Wallet:</span>
        <span className="wallet-info-value">{walletName}</span>
      </div>
      <div className="wallet-info-row">
        <span className="wallet-info-label">Network:</span>
        <span className="wallet-info-value network-badge">{network.toUpperCase()}</span>
      </div>
      <div className="wallet-info-row">
        <span className="wallet-info-label">Address:</span>
        <span className="wallet-info-value address" title={address}>
          {shortenAddress(address)}
        </span>
      </div>
    </div>
  );
}
