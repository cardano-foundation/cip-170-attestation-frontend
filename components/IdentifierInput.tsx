'use client';

import { useState } from 'react';
import { SignifyClient, ready } from 'signify-ts';
import { KeyIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

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
  preVerifiedIdentifier?: string;
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
  preVerifiedIdentifier,
}: IdentifierInputProps) {
  const [loading, setLoading] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{
    verified: boolean;
    identifier?: string;
    error?: string;
  } | null>(() =>
    preVerifiedIdentifier
      ? { verified: true, identifier: preVerifiedIdentifier }
      : null
  );

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
    <div className="py-3 px-1">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
          <KeyIcon size={24} className="text-brand-primary" />
        </div>
      </div>

      <h2 className="text-xl font-semibold text-white text-center mb-1">KERI Identifier Information</h2>
      <p className="text-white/60 text-sm text-center mb-4 max-w-md mx-auto">
        Provide your KERI identifier details to create the attestation
      </p>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-white/80 text-sm font-medium">Identifier Name</Label>
          <Input
            type="text"
            value={identifierName}
            onChange={(e) => onIdentifierNameChange(e.target.value)}
            placeholder="Enter identifier name"
            className="h-10 bg-white/[0.07] border-white/[0.14] text-white placeholder:text-white/30 focus-ring"
          />
          <p className="text-white/40 text-xs">The name of your KERI identifier</p>
        </div>

        <div className="space-y-2">
          <Label className="text-white/80 text-sm font-medium">Your Passcode</Label>
          <div className="relative">
            <Input
              type={showPasscode ? 'text' : 'password'}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Enter your passcode"
              className="h-10 bg-white/[0.07] border-white/[0.14] text-white placeholder:text-white/30 focus-ring pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPasscode(!showPasscode)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
            >
              {showPasscode ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-white/40 text-xs">Your passcode for the KERI client</p>
        </div>

        <div className="space-y-2">
          <Label className="text-white/80 text-sm font-medium">KERI URL</Label>
          <Input
            type="text"
            value={signifyUrl}
            onChange={(e) => onSignifyUrlChange(e.target.value)}
            placeholder="http://localhost:3901"
            className="h-10 bg-white/[0.07] border-white/[0.14] text-white font-mono text-sm placeholder:text-white/30 focus-ring"
          />
          <p className="text-white/40 text-xs">URL of your KERI service</p>
        </div>
      </div>

      {/* Verification status */}
      {verificationStatus && (
        <div className={`mt-3 p-4 rounded-lg border ${
          verificationStatus.verified
            ? 'bg-brand-success/[0.12] border-brand-success/20'
            : 'bg-brand-error/[0.12] border-brand-error/20'
        }`}>
          {verificationStatus.verified ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-brand-success/20 text-brand-success border-brand-success/30 text-xs shadow-[0_0_8px_rgba(0,190,122,0.2)]">
                  Verified
                </Badge>
              </div>
              <div className="bg-black/30 rounded-md p-3 mt-2">
                <p className="text-white/40 text-[0.65rem] uppercase tracking-wider mb-1">Prefix</p>
                <code className="text-brand-success/80 font-mono text-xs break-all leading-relaxed">
                  {verificationStatus.identifier}
                </code>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <Badge variant="destructive" className="bg-brand-error/20 text-brand-error border-brand-error/30 text-xs shrink-0">
                Failed
              </Badge>
              <p className="text-brand-error/80 text-sm">{verificationStatus.error}</p>
            </div>
          )}
        </div>
      )}

      <Button
        onClick={verifyIdentifier}
        disabled={loading || !identifierName || !name || !isSodiumReady}
        className="w-full mt-4 gradient-button text-white font-semibold h-12 shadow-[0_4px_20px_rgba(0,132,255,0.25)] hover:shadow-[0_6px_28px_rgba(0,132,255,0.35)] transition-all duration-300 hover:scale-[1.01] disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100"
      >
        {loading ? (
          <>
            <span className="spinner-icon" />
            Verifying...
          </>
        ) : !isSodiumReady ? (
          'Initializing...'
        ) : verificationStatus?.verified ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-1.5">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Verified - Continue
          </>
        ) : (
          'Verify Identifier'
        )}
      </Button>
    </div>
  );
}
