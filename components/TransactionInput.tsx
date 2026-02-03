'use client';

import { useState } from 'react';
import { DocumentIcon } from '@/components/icons';

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
    <div className="transaction-input">
      <div className="step-card">
        <div className="step-icon">
          <DocumentIcon size={48} />
        </div>
        <h2>Enter Transaction Details</h2>
        <p className="subtitle">
          Provide the Cardano transaction hash that contains the metadata you want to attest
        </p>

        <div className="form-group">
          <label className="label">Transaction Hash</label>
          <input
            type="text"
            className={`input ${!isValidFormat ? 'input-error' : ''}`}
            value={txHash}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Enter 64-character transaction hash"
            maxLength={64}
          />
          {!isValidFormat && (
            <span className="input-error-message">
              Invalid transaction hash format (must be 64 hex characters)
            </span>
          )}
          <small className="help-text">
            Transaction hash should be a 64-character hexadecimal string
          </small>
        </div>

        <button
          onClick={onFetchMetadata}
          disabled={loading || !txHash || !isValidFormat}
          className="button button-primary"
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Fetching Metadata...
            </>
          ) : (
            'Fetch Transaction Metadata'
          )}
        </button>
      </div>
    </div>
  );
}
