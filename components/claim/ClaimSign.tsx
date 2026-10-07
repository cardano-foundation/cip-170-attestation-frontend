'use client';

import { useState } from 'react';
import { BuildIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import CopyField from '@/components/CopyField';
import { claimTxBodyInfo, witnessedKeyHashes } from '@/lib/claim-tx';
import type { PendingClaim } from '@/lib/pending-claim';
import { WalletKeys, walletOwnsKey } from '@/lib/required-keys';

interface ClaimSignProps {
  pending: PendingClaim;
  walletKeys: WalletKeys | null;
  walletConnected: boolean;
  tipSlot: number | null;
  cosignLink: string;
  busy: boolean;
  onSignWithWallet: () => void;
  onAddSignatures: (input: string) => Promise<boolean>;
}

const short = (value: string, n = 12) => `${value.slice(0, n)}…${value.slice(-6)}`;

export function formatTtl(ttl: number | undefined, tipSlot: number | null): string {
  if (ttl === undefined) return 'no TTL';
  if (tipSlot === null) return `slot ${ttl}`;
  const left = ttl - tipSlot;
  if (left <= 0) return 'expired';
  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  return `${hours}h ${minutes}m left (slot ${ttl})`;
}

export default function ClaimSign({
  pending,
  walletKeys,
  walletConnected,
  tipSlot,
  cosignLink,
  busy,
  onSignWithWallet,
  onAddSignatures,
}: ClaimSignProps) {
  const [pasted, setPasted] = useState('');
  const info = claimTxBodyInfo(pending.txHex);
  const witnessed = witnessedKeyHashes(pending.txHex);
  const missing = info.requiredSigners.filter((k) => !witnessed.has(k));
  const missingOwned = missing.filter((k) => walletOwnsKey(walletKeys, k));
  const missingExternal = missing.filter((k) => !walletOwnsKey(walletKeys, k));
  const walletSigned = pending.inputKeys.every((k) => witnessed.has(k));

  return (
    <div className="py-3 px-1">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
          <BuildIcon size={24} className="text-brand-primary" />
        </div>
      </div>

      <h2 className="text-xl font-semibold text-white text-center mb-1">Collect Signatures</h2>
      <p className="text-white/60 text-sm text-center mb-4 max-w-md mx-auto">
        The claim transaction is fixed. Every required signer has to sign it before the seal is anchored.
      </p>

      <div className="space-y-3">
        <CopyField label="Claim transaction ID" value={pending.txId} tone="success" />

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-black/30 border border-white/[0.08] px-3 py-2">
            <p className="text-white/40 uppercase tracking-wider text-[0.6rem] mb-0.5">Valid until</p>
            <p className="text-white/80">{formatTtl(info.ttl, tipSlot)}</p>
          </div>
          <div className="rounded-lg bg-black/30 border border-white/[0.08] px-3 py-2">
            <p className="text-white/40 uppercase tracking-wider text-[0.6rem] mb-0.5">Fee</p>
            <p className="text-white/80">{(Number(info.fee) / 1_000_000).toFixed(6)} ADA</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.10] bg-white/[0.03] p-3">
          <p className="text-xs text-white/50 uppercase tracking-wider font-medium mb-2">Required signers</p>
          <ul className="space-y-1.5">
            {info.requiredSigners.map((key) => {
              const done = witnessed.has(key);
              const owned = walletOwnsKey(walletKeys, key);
              return (
                <li key={key} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      done ? 'bg-brand-success/25 text-brand-success' : 'bg-white/[0.06] text-white/30'
                    }`}
                  >
                    {done ? '✓' : '·'}
                  </span>
                  <span className="font-mono text-white/80" title={key}>
                    {short(key)}
                  </span>
                  <span className="ml-auto text-white/40">
                    {done ? 'signed' : owned ? 'your wallet' : 'external key owner'}
                  </span>
                </li>
              );
            })}
            <li className="flex items-center gap-2 text-xs pt-1.5 mt-1.5 border-t border-white/[0.06]">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  walletSigned ? 'bg-brand-success/25 text-brand-success' : 'bg-white/[0.06] text-white/30'
                }`}
              >
                {walletSigned ? '✓' : '·'}
              </span>
              <span className="text-white/70">Fee inputs</span>
              <span className="ml-auto text-white/40">{walletSigned ? 'signed' : 'your wallet'}</span>
            </li>
          </ul>
        </div>

        {walletConnected && (missingOwned.length > 0 || !walletSigned) && (
          <Button
            onClick={onSignWithWallet}
            disabled={busy}
            className="w-full gradient-button text-white font-semibold h-11 shadow-[0_4px_20px_rgba(0,132,255,0.25)] disabled:opacity-50"
          >
            {busy ? (
              <>
                <span className="spinner-icon" />
                Waiting for wallet…
              </>
            ) : (
              'Sign with Connected Wallet'
            )}
          </Button>
        )}
        {!walletConnected && (missingOwned.length > 0 || !walletSigned) && (
          <p className="text-brand-warning/80 text-xs">Reconnect your wallet to add its signature.</p>
        )}

        {missingExternal.length > 0 && (
          <div className="rounded-xl border border-brand-secondary/20 bg-brand-secondary/[0.04] p-3 space-y-3">
            <p className="text-sm font-semibold text-white/90">
              Request {missingExternal.length} signature{missingExternal.length > 1 ? 's' : ''} from the key owner
            </p>
            <CopyField
              label="Cosign link"
              value={cosignLink}
              hint="The owner opens it, connects their wallet and sends you back a link. The transaction stays in the link's # part, which is never sent to a server."
            />
            <CopyField
              label="Or: transaction CBOR"
              value={pending.txHex}
              multiline
              hint="For signing with any other tool. Paste the returned witness set below."
            />
            <div className="space-y-1.5">
              <Label className="text-white/80 text-sm font-medium">Returned signatures</Label>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value.trim())}
                rows={3}
                spellCheck={false}
                placeholder="Paste the return link or the witness set CBOR"
                className="w-full rounded-md px-3 py-2.5 bg-white/[0.07] border border-white/[0.14] text-white font-mono text-xs placeholder:text-white/30 focus-ring outline-none resize-y"
              />
              <Button
                variant="ghost"
                onClick={async () => {
                  if (await onAddSignatures(pasted)) setPasted('');
                }}
                disabled={busy || !pasted}
                className="w-full h-10 text-brand-secondary border border-brand-secondary/30 hover:bg-brand-secondary/10 disabled:opacity-50"
              >
                Add Signatures
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
