'use client';

import { CardanoNetwork } from '@/lib/network-config';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

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
  const [copied, setCopied] = useState(false);

  const shortenAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 12)}...${addr.slice(-12)}`;
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const networkColor = network === 'mainnet'
    ? 'bg-brand-success/20 text-brand-success border-brand-success/30'
    : 'bg-brand-warning/20 text-brand-warning border-brand-warning/30';

  return (
    <div className="glass rounded-xl p-3 mt-2 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-primary/25 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-primary">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold text-white/90 capitalize">{walletName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`${networkColor} text-[0.65rem] font-bold uppercase tracking-wider border`}>
            {network}
          </Badge>

          <button
            onClick={copyAddress}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.08] transition-colors text-xs font-mono text-white/60 hover:text-white/70 border border-white/[0.10]"
            title={address}
          >
            {shortenAddress(address)}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={copied ? 'text-brand-success' : 'text-white/30'}>
              {copied ? (
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
