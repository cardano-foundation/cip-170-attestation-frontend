'use client';

import { useState } from 'react';
import { DocumentIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TransactionInputProps {
  txHash: string;
  onTxHashChange: (value: string) => void;
  onFetchMetadata: () => void;
  loading: boolean;
}

export default function TransactionInput({
  txHash,
  onTxHashChange,
  onFetchMetadata,
  loading,
}: TransactionInputProps) {
  const [isValidFormat, setIsValidFormat] = useState(true);

  const validateTxHash = (value: string) => {
    // Cardano transaction hashes are 64 character hex strings
    const isValid = /^[a-fA-F0-9]{64}$/.test(value) || value === '';
    setIsValidFormat(isValid);
    return isValid;
  };

  const handleChange = (value: string) => {
    onTxHashChange(value);
    validateTxHash(value);
  };

  return (
    <div className="py-3 px-1">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
          <DocumentIcon size={24} className="text-brand-primary" />
        </div>
      </div>

      <h2 className="text-xl font-semibold text-white text-center mb-1">Enter Transaction Details</h2>
      <p className="text-white/60 text-sm text-center mb-4 max-w-md mx-auto">
        Provide the Cardano transaction hash that contains the metadata you want to attest
      </p>

      <div className="space-y-2 mb-4">
        <Label className="text-white/80 text-sm font-medium">Transaction Hash</Label>
        <Input
          type="text"
          value={txHash}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Enter 64-character transaction hash"
          maxLength={64}
          className={`h-12 bg-white/[0.07] border-white/[0.14] text-white font-mono text-sm placeholder:text-white/30 focus-ring ${
            !isValidFormat ? 'border-brand-error/50 shadow-[0_0_0_3px_rgba(239,68,68,0.1)]' : ''
          }`}
        />
        {!isValidFormat && (
          <p className="text-brand-error text-xs mt-1">
            Invalid transaction hash format (must be 64 hex characters)
          </p>
        )}
        <p className="text-white/40 text-xs mt-1">
          Transaction hash should be a 64-character hexadecimal string
        </p>
      </div>

      <Button
        onClick={onFetchMetadata}
        disabled={loading || !txHash || !isValidFormat}
        className="w-full gradient-button text-white font-semibold h-12 shadow-[0_4px_20px_rgba(99,102,241,0.25)] hover:shadow-[0_6px_28px_rgba(99,102,241,0.35)] transition-all duration-300 hover:scale-[1.01] disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100"
      >
        {loading ? (
          <>
            <span className="spinner-icon" />
            Fetching Metadata...
          </>
        ) : (
          'Fetch Transaction Metadata'
        )}
      </Button>
    </div>
  );
}
