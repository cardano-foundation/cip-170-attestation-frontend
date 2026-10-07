'use client';

import { KeyIcon } from '@/components/icons';
import { Label } from '@/components/ui/label';
import type { ClaimedTx } from '@/lib/pending-claim';
import { KeyRole, WalletKeys, walletOwnsKey } from '@/lib/required-keys';

const ROLE_LABEL: Record<KeyRole, string> = {
  input: 'input',
  collateral: 'collateral',
  required_signer: 'required signer',
  withdrawal: 'withdrawal',
  certificate: 'certificate',
};

const STAKE_ROLES: KeyRole[] = ['withdrawal', 'certificate'];

interface ClaimKeysProps {
  claimed: ClaimedTx[];
  warnings: Record<string, string[]>;
  walletKeys: WalletKeys | null;
  onSelect: (txHash: string, keyHash: string) => void;
  metadataPreview: unknown;
}

const short = (value: string, n = 10) => `${value.slice(0, n)}…${value.slice(-6)}`;

export default function ClaimKeys({ claimed, warnings, walletKeys, onSelect, metadataPreview }: ClaimKeysProps) {
  const external = claimed.filter((c) => c.linkingKey && !walletOwnsKey(walletKeys, c.linkingKey)).length;
  const stakeOnly = claimed.some((c) => {
    const key = c.keys.find((k) => k.keyHash === c.linkingKey);
    return key && key.roles.every((r) => STAKE_ROLES.includes(r));
  });

  return (
    <div className="py-3 px-1">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
          <KeyIcon size={24} className="text-brand-primary" />
        </div>
      </div>

      <h2 className="text-xl font-semibold text-white text-center mb-1">Choose Linking Keys</h2>
      <p className="text-white/60 text-sm text-center mb-4 max-w-md mx-auto">
        Pick one key that signed each transaction. It becomes a required signer of the claim and must sign it.
      </p>

      <div className="space-y-3">
        {claimed.map((tx) => (
          <div key={tx.txHash} className="rounded-xl border border-white/[0.10] bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-mono text-xs text-brand-secondary" title={tx.txHash}>
                {short(tx.txHash, 16)}
              </span>
              <span className="text-[0.65rem] text-white/40 uppercase tracking-wider">
                {tx.keys.length} required key{tx.keys.length === 1 ? '' : 's'}
              </span>
            </div>

            {tx.keys.length === 0 && (
              <p className="text-brand-error/90 text-xs">
                No key-based required keys found (script-only transaction). It cannot be claimed.
              </p>
            )}

            <div className="space-y-1.5" role="radiogroup" aria-label={`Linking key for ${tx.txHash}`}>
              {tx.keys.map((key) => {
                const selected = key.keyHash === tx.linkingKey;
                const owned = walletOwnsKey(walletKeys, key.keyHash);
                return (
                  <button
                    key={key.keyHash}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSelect(tx.txHash, key.keyHash)}
                    className={`w-full flex flex-wrap items-center gap-2 text-left rounded-lg border px-3 py-2 transition-all duration-200 ${
                      selected
                        ? 'bg-brand-primary/[0.12] border-brand-primary/40'
                        : 'bg-black/20 border-white/[0.08] hover:border-white/[0.18]'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                        selected ? 'border-brand-secondary bg-brand-secondary/40' : 'border-white/30'
                      }`}
                    />
                    <span className="font-mono text-xs text-white/80" title={key.keyHash}>
                      {short(key.keyHash, 14)}
                    </span>
                    {key.roles.map((role) => (
                      <span
                        key={role}
                        className="text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 border border-white/[0.08]"
                      >
                        {ROLE_LABEL[role]}
                      </span>
                    ))}
                    {owned && (
                      <span className="ml-auto text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-success/15 text-brand-success border border-brand-success/25">
                        in your wallet
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {(warnings[tx.txHash] ?? []).map((w) => (
              <p key={w} className="text-brand-warning/80 text-xs mt-2">
                {w}
              </p>
            ))}
          </div>
        ))}
      </div>

      {external > 0 && (
        <div className="mt-3 bg-brand-primary/[0.08] border border-brand-primary/20 rounded-lg px-3 py-2.5 text-xs text-white/70">
          {external} linking key{external > 1 ? 's are' : ' is'} not in the connected wallet. After building, you can send the
          transaction to the key owner to sign.
        </div>
      )}
      {stakeOnly && (
        <div className="mt-2 bg-brand-warning/[0.10] border border-brand-warning/25 rounded-lg px-3 py-2.5 text-xs text-brand-warning/90">
          A stake key is selected. Some wallets do not sign stake keys listed as required signers; prefer a payment key if
          one is available.
        </div>
      )}

      <div className="space-y-2 mt-4">
        <Label className="text-white/80 text-sm font-medium">Claim record (label 170)</Label>
        <div className="code-display font-[var(--font-mono)] max-h-[200px] overflow-y-auto rounded-lg">
          <pre>{JSON.stringify(metadataPreview, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
