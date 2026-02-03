'use client';

import { useState } from 'react';
import { SignifyClient, ready } from 'signify-ts';

interface IdentifierInputProps {
  identifierName: string;
  onIdentifierNameChange: (value: string) => void;
  name: string;
  onNameChange: (value: string) => void;
  signifyUrl: string;
  onSignifyUrlChange: (value: string) => void;
  onIdentifierVerified: (identifier: string) => void;
  onError: (error: string) => void;
  isSodiumReady: boolean;
}

export default function IdentifierInput({
  identifierName,
  onIdentifierNameChange,
  name,
  onNameChange,
  signifyUrl,
  onSignifyUrlChange,
  onIdentifierVerified,
  onError,
  isSodiumReady,
}: IdentifierInputProps) {
  const [loading, setLoading] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{
    verified: boolean;
    identifier?: string;
    error?: string;
  } | null>(null);

  const verifyIdentifier = async () => {
    if (!identifierName || !name) {
      onError('Please provide both identifier name and client name');
      return;
    }

    try {
      setLoading(true);
      onError('');
      setVerificationStatus(null);

      // Initialize libsodium (required for signify-ts)
      if (!isSodiumReady) {
        await ready();
      }

      // Initialize Signify client
      const client = new SignifyClient(signifyUrl, name);
      
      // Connect to Signify
      await client.connect();
      
      // Get identifier
      const identifiers = await client.identifiers().list();
      const aid = identifiers.aids.find((a: any) => a.name === identifierName);
      
      if (!aid) {
        setVerificationStatus({
          verified: false,
          error: `Identifier "${identifierName}" not found`,
        });
        onError(`Identifier "${identifierName}" not found. Please create it first using Signify.`);
        return;
      }

      setVerificationStatus({
        verified: true,
        identifier: aid.prefix,
      });

      onIdentifierVerified(aid.prefix);
    } catch (err: any) {
      const errorMsg = `Failed to verify identifier: ${err.message}`;
      setVerificationStatus({
        verified: false,
        error: errorMsg,
      });
      onError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="identifier-input">
      <div className="step-card">
        <div className="step-icon">🔑</div>
        <h2>KERI Identifier Information</h2>
        <p className="subtitle">
          Provide your KERI identifier details to create the attestation
        </p>

        <div className="form-group">
          <label className="label">Identifier Name</label>
          <input
            type="text"
            className="input"
            value={identifierName}
            onChange={(e) => onIdentifierNameChange(e.target.value)}
            placeholder="Enter identifier name"
          />
          <small className="help-text">
            The name of your KERI identifier in Signify
          </small>
        </div>

        <div className="form-group">
          <label className="label">Client Name</label>
          <input
            type="text"
            className="input"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter name for Signify client"
          />
          <small className="help-text">
            Your passcode/name for the Signify client
          </small>
        </div>

        <div className="form-group">
          <label className="label">Signify URL</label>
          <input
            type="text"
            className="input"
            value={signifyUrl}
            onChange={(e) => onSignifyUrlChange(e.target.value)}
            placeholder="http://localhost:3901"
          />
          <small className="help-text">
            URL of your Signify service
          </small>
        </div>

        {verificationStatus && (
          <div className={`validation-status ${verificationStatus.verified ? 'success' : 'error'}`}>
            {verificationStatus.verified ? (
              <>
                <strong>✓ Identifier Verified</strong>
                <div className="identifier-display">
                  <small>Prefix:</small>
                  <code>{verificationStatus.identifier}</code>
                </div>
              </>
            ) : (
              <>
                <strong>✗ Verification Failed</strong>
                <div>{verificationStatus.error}</div>
              </>
            )}
          </div>
        )}

        <button
          onClick={verifyIdentifier}
          disabled={loading || !identifierName || !name || !isSodiumReady}
          className="button button-primary"
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Verifying...
            </>
          ) : !isSodiumReady ? (
            'Initializing...'
          ) : verificationStatus?.verified ? (
            '✓ Verified - Continue'
          ) : (
            'Verify Identifier'
          )}
        </button>
      </div>
    </div>
  );
}
