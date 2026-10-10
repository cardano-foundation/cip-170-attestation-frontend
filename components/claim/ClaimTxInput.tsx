'use client';

import { ReactNode } from 'react';
import { DocumentIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { isTxHash } from '@/lib/cip170';

interface ClaimTxInputProps {
  value: string;
  onChange: (value: string) => void;
  onResolve: (hashes: string[]) => void;
  loading: boolean;
  flowSelector?: ReactNode;
}

export function parseTxHashList(value: string): { hashes: string[]; invalid: string[] } {
  const tokens = value
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const hashes = Array.from(new Set(tokens.filter(isTxHash)));
  const invalid = tokens.filter((t) => !isTxHash(t));
  return { hashes, invalid };
}

export default function ClaimTxInput({ value, onChange, onResolve, loading, flowSelector }: ClaimTxInputProps) {
  const { hashes, invalid } = parseTxHashList(value);

  return (
    <div className="py-3 px-1">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
          <DocumentIcon size={24} className="text-brand-primary" />
        </div>
      </div>

      <h2 className="text-xl font-semibold text-white text-center mb-1">Enter Transaction Details</h2>
      <p className="text-white/60 text-sm text-center mb-4 max-w-md mx-auto">
        List the on-chain transactions your KERI identifier should claim
      </p>

      {flowSelector}

      <div className="space-y-2 mb-4">
        <Label className="text-white/80 text-sm font-medium">Transactions to claim</Label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder="One 64-character transaction hash per line"
          className={`w-full rounded-md px-3 py-2.5 bg-white/[0.07] border text-white font-mono text-xs leading-relaxed placeholder:text-white/30 focus-ring outline-none resize-y ${
            invalid.length ? 'border-brand-error/50' : 'border-white/[0.14]'
          }`}
        />
        {invalid.length > 0 ? (
          <p className="text-brand-error text-xs">
            Not a transaction hash: <span className="font-mono">{invalid[0].slice(0, 24)}</span>
            {invalid.length > 1 ? ` and ${invalid.length - 1} more` : ''}
          </p>
        ) : (
          <p className="text-white/40 text-xs">
            {hashes.length === 0
              ? 'A claim proves your identifier and a key that signed each transaction acted together.'
              : `${hashes.length} transaction${hashes.length > 1 ? 's' : ''} to claim`}
          </p>
        )}
      </div>

      <Button
        onClick={() => onResolve(hashes)}
        disabled={loading || hashes.length === 0 || invalid.length > 0}
        className="w-full gradient-button text-white font-semibold h-12 shadow-[0_4px_20px_rgba(0,132,255,0.25)] hover:shadow-[0_6px_28px_rgba(0,132,255,0.35)] transition-all duration-300 hover:scale-[1.01] disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100"
      >
        {loading ? (
          <>
            <span className="spinner-icon" />
            Resolving required keys...
          </>
        ) : (
          'Find Required Keys'
        )}
      </Button>
    </div>
  );
}
