'use client';

import { EyeIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CopyField from '@/components/CopyField';
import type { Gate } from '@/lib/claim-gates';
import type { PendingClaim } from '@/lib/pending-claim';

interface ClaimAnchorProps {
  pending: PendingClaim;
  sealSaid: string;
  anchorGate: Gate;
  submitGate: Gate;
  anchoring: boolean;
  /** Live status of a running Veridian request */
  progress?: string;
  submitting: boolean;
  onAnchor: () => void;
  onSubmit: () => void;
  needPasscode: boolean;
  passcode: string;
  onPasscodeChange: (value: string) => void;
  /** Forget the in-flight Veridian request so the next click sends a new one */
  onResetRequest?: () => void;
}

export default function ClaimAnchor({
  pending,
  sealSaid,
  anchorGate,
  submitGate,
  anchoring,
  progress,
  submitting,
  onAnchor,
  onSubmit,
  needPasscode,
  passcode,
  onPasscodeChange,
  onResetRequest,
}: ClaimAnchorProps) {
  const veridian = pending.signerKind === 'veridian';
  const anchored = !!pending.seal;

  return (
    <div className="py-3 px-1">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
          <EyeIcon size={24} className="text-brand-primary" />
        </div>
      </div>

      <h2 className="text-xl font-semibold text-white text-center mb-1">Anchor Seal &amp; Submit</h2>
      <p className="text-white/60 text-sm text-center mb-4 max-w-md mx-auto">
        Your identifier anchors the transaction seal in its key event log, then the claim goes on chain.
      </p>

      <div className="space-y-3">
        <CopyField
          label="Transaction seal"
          value={sealSaid}
          hint={`SAID of { t: "cardano-tx-attest", n, txHash: ${pending.txId.slice(0, 10)}… }. Verifiers recompute it from the chain.`}
        />
        <CopyField label="Signer identifier" value={pending.aid} />

        {needPasscode && !anchored && (
          <div className="space-y-1.5">
            <Label className="text-white/80 text-sm font-medium">Signify passcode</Label>
            <Input
              type="password"
              value={passcode}
              onChange={(e) => onPasscodeChange(e.target.value)}
              placeholder="Re-enter your passcode to anchor"
              className="h-10 bg-white/[0.07] border-white/[0.14] text-white placeholder:text-white/30 focus-ring"
            />
          </div>
        )}

        {/* Step A: anchor */}
        <div
          className={`rounded-xl border p-3 ${
            anchored ? 'border-brand-success/25 bg-brand-success/[0.08]' : 'border-white/[0.10] bg-white/[0.03]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white/90">1. Anchor seal</p>
            {anchored && (
              <span className="text-xs text-brand-success">
                event #{pending.seal!.sn} (hex {pending.seal!.sn.toString(16)})
              </span>
            )}
          </div>
          {!anchored && (
            <>
              {veridian && anchoring && (
                <p className="text-brand-secondary/90 text-xs mt-2">
                  {progress || 'Approve the request in Veridian. It shows the network and transaction ID it is asked to seal.'}
                </p>
              )}
              {veridian && !anchoring && (
                <p className="text-white/50 text-xs mt-2">
                  Veridian receives the seal object only; compare the transaction ID it shows with the one above.
                </p>
              )}
              {onResetRequest && (
                <p className="text-white/50 text-xs mt-2">
                  A request was already sent; retrying checks for the wallet&apos;s answer.{' '}
                  <button type="button" onClick={onResetRequest} className="text-brand-secondary hover:underline">
                    Send a new request instead
                  </button>
                </p>
              )}
              {!anchorGate.ok && anchorGate.reason && <p className="text-brand-warning/80 text-xs mt-2">{anchorGate.reason}</p>}
              <Button
                onClick={onAnchor}
                disabled={!anchorGate.ok || anchoring || (needPasscode && !passcode)}
                className="w-full mt-3 gradient-button text-white font-semibold h-11 disabled:opacity-50"
              >
                {anchoring ? (
                  <>
                    <span className="spinner-icon" />
                    {veridian ? 'Waiting for Veridian…' : 'Anchoring…'}
                  </>
                ) : veridian ? (
                  'Request Seal in Veridian'
                ) : (
                  'Create KERI Interaction Event'
                )}
              </Button>
            </>
          )}
        </div>

        {/* Step B: submit */}
        <div className="rounded-xl border border-white/[0.10] bg-white/[0.03] p-3">
          <p className="text-sm font-semibold text-white/90">2. Submit claim</p>
          {anchored && !submitGate.ok && submitGate.reason && (
            <p className="text-brand-warning/80 text-xs mt-2">{submitGate.reason}</p>
          )}
          <Button
            onClick={onSubmit}
            disabled={!submitGate.ok || submitting}
            className="w-full mt-3 gradient-button text-white font-semibold h-11 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="spinner-icon" />
                Submitting…
              </>
            ) : (
              'Publish to Blockchain'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
