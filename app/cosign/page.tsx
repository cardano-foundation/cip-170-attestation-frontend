'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import WalletConnection from '@/components/WalletConnection';
import CopyField from '@/components/CopyField';
import { CheckIcon, KeyIcon } from '@/components/icons';
import NetworkConfiguration from '@/components/NetworkConfiguration';
import {
  CosignCheck,
  checkResolvedInputs,
  checkReturnedWitnessSet,
  resolveCosignInputs,
  validateCosignTx,
} from '@/lib/claim-gates';
import { getCurrentNetworkConfig } from '@/lib/network-config';
import { walletKeyHashes } from '@/lib/required-keys';
import { CosignRequest, decodeCosignFragment, encodeReturnLink } from '@/lib/pending-claim';

const short = (value: string, n = 12) => `${value.slice(0, n)}…${value.slice(-6)}`;

export default function CosignPage() {
  const [request, setRequest] = useState<CosignRequest | null>(null);
  const [linkError, setLinkError] = useState('');
  const [error, setError] = useState('');
  const [wallet, setWallet] = useState<any>(null);
  const [walletName, setWalletName] = useState('');
  const [walletUtxos, setWalletUtxos] = useState<{ txHash: string; outputIndex: number }[] | null>(null);
  const [signing, setSigning] = useState(false);
  const [returnLink, setReturnLink] = useState('');
  const [witnessSet, setWitnessSet] = useState('');
  // Input ownership check (needs chain data): null = not done yet
  const [inputErrors, setInputErrors] = useState<string[] | null>(null);
  const [checkingInputs, setCheckingInputs] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);

  useEffect(() => {
    try {
      setRequest(decodeCosignFragment(window.location.hash));
    } catch (err: any) {
      setLinkError(err.message || 'This cosign link is invalid');
    }
  }, []);

  // Before a wallet is connected we can only check the shape; spending checks need its UTxOs
  const check: CosignCheck | null = useMemo(() => {
    if (!request) return null;
    try {
      return validateCosignTx(request.txHex, request.keys, walletUtxos ?? [], request.network);
    } catch (err: any) {
      return {
        ok: false,
        errors: [`The transaction cannot be read: ${err.message}`],
        txId: '',
        requiredSigners: [],
        fee: '0',
        outputs: [],
        inputs: [],
      };
    }
  }, [request, walletUtxos]);

  // Resolve every spent input through the app's own API settings and refuse script, Byron or own-key inputs
  useEffect(() => {
    if (!wallet || !request || !check?.ok) return;
    let cancelled = false;
    (async () => {
      setCheckingInputs(true);
      setInputErrors(null);
      try {
        const config = getCurrentNetworkConfig();
        if (config.network !== request.network) {
          throw new Error(`Network settings are set to ${config.network}; switch them to ${request.network} to check the inputs`);
        }
        const resolved = await resolveCosignInputs(config.blockfrostUrl, config.blockfrostApiKey, check.inputs);
        const keys = await walletKeyHashes(wallet);
        if (!cancelled) setInputErrors(checkResolvedInputs(resolved, request.keys, keys.payment));
      } catch (err: any) {
        if (!cancelled) setInputErrors([`Inputs could not be checked: ${err.message}`]);
      } finally {
        if (!cancelled) setCheckingInputs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, request, check?.ok, check?.inputs, configVersion]);

  const canSign = !!check?.ok && inputErrors !== null && inputErrors.length === 0;

  const handleConnect = async (api: any, _address: string, name: string) => {
    setWallet(api);
    setWalletName(name);
    try {
      const utxos = await api.getUtxos();
      // some wallets hide their collateral UTxO from getUtxos
      const collateral = await api.getCollateral().catch(() => []);
      setWalletUtxos(
        [...(utxos ?? []), ...(collateral ?? [])].map((u: any) => ({ txHash: u.input.txHash, outputIndex: u.input.outputIndex }))
      );
    } catch (err: any) {
      setError(`Could not read your wallet's UTxOs: ${err.message}`);
    }
  };

  const sign = async () => {
    if (!wallet || !request || !check || !canSign) return;
    try {
      setSigning(true);
      setError('');
      const set: string = await wallet.signTx(request.txHex, true, false);
      if (!set || set === request.txHex) throw new Error('Your wallet returned no signatures. Is this the right wallet or account?');
      // Fail closed: anything beyond requested-key signatures means the wallet signed for more than the claim
      const problems = await checkReturnedWitnessSet(set, check.txId, request.keys);
      if (problems.length) throw new Error(`${problems.join(' ')} The signatures were discarded.`);
      setWitnessSet(set);
      setReturnLink(encodeReturnLink(window.location.origin, check.txId, set));
    } catch (err: any) {
      setError(`Signing failed: ${err.message}`);
    } finally {
      setSigning(false);
    }
  };

  const shapeErrors = check?.errors ?? [];

  return (
    <div className="relative z-10 w-full max-w-[760px] mx-auto px-4 sm:px-6 lg:px-8 py-4 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <img src="/cardano-logo-white.png" alt="Cardano" className="h-8 w-auto" />
          <Badge variant="outline" className="bg-brand-primary/10 text-brand-primary border-brand-primary/20 text-xs font-semibold">
            CIP-0170
          </Badge>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold gradient-text tracking-tight">Cosign Claim</h1>
          <p className="text-sm hidden sm:block gradient-text-brand">Add your signature to a CLAIM_TX</p>
        </div>
        <NetworkConfiguration onConfigChange={() => setConfigVersion((v) => v + 1)} />
      </div>

      <AnimatePresence>
        {(error || linkError) && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Alert className="mb-2 bg-brand-error/[0.12] border-brand-error/30">
              <AlertDescription className="text-brand-error/90 text-sm">{linkError || error}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {request && check && (
        <Card className="glass-card rounded-2xl p-4 sm:p-5 mb-2">
          <div className="py-2 px-1 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center shrink-0">
                <KeyIcon size={22} className="text-brand-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">You are asked to sign a claim</h2>
                <p className="text-white/60 text-sm">
                  The KERI identifier below will claim that it acted together with your key in the listed transactions. Only
                  sign if you agree to be linked to this identifier. The page refuses transactions that could move your funds.
                </p>
              </div>
            </div>

            <CopyField label="Transaction ID (recomputed here)" value={check.txId} tone="success" />

            {check.record && (
              <div className="rounded-xl border border-white/[0.10] bg-white/[0.03] p-3 space-y-2 text-xs">
                <div>
                  <p className="text-white/40 uppercase tracking-wider text-[0.6rem] mb-0.5">Claiming identifier</p>
                  <code className="text-white/80 font-mono break-all">{check.record.i}</code>
                </div>
                <div>
                  <p className="text-white/40 uppercase tracking-wider text-[0.6rem] mb-0.5">Claimed transactions</p>
                  {check.record.r.map((h) => (
                    <code key={h} className="block text-brand-secondary font-mono break-all">
                      {h}
                    </code>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-white/40 uppercase tracking-wider text-[0.6rem] mb-0.5">Network</p>
                    <p className="text-white/80">{request.network}</p>
                  </div>
                  <div>
                    <p className="text-white/40 uppercase tracking-wider text-[0.6rem] mb-0.5">Fee (paid by sender)</p>
                    <p className="text-white/80">{(Number(check.fee) / 1_000_000).toFixed(6)} ADA</p>
                  </div>
                </div>
                <div>
                  <p className="text-white/40 uppercase tracking-wider text-[0.6rem] mb-0.5">Keys asked to sign</p>
                  {request.keys.map((k) => (
                    <code key={k} className="block text-white/80 font-mono" title={k}>
                      {short(k, 16)}
                    </code>
                  ))}
                </div>
                <div>
                  <p className="text-white/40 uppercase tracking-wider text-[0.6rem] mb-0.5">Outputs</p>
                  {check.outputs.map((o, i) => (
                    <p key={i} className="text-white/70 font-mono break-all">
                      {(Number(o.lovelace) / 1_000_000).toFixed(6)} ADA → {short(o.address, 18)}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {shapeErrors.length > 0 && (
              <div className="rounded-xl border border-brand-error/30 bg-brand-error/[0.10] p-3">
                <p className="text-sm font-semibold text-brand-error mb-1">This transaction will not be signed</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {shapeErrors.map((e) => (
                    <li key={e} className="text-brand-error/85 text-xs">
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!wallet && shapeErrors.length === 0 && (
              <WalletConnection
                network={request.network}
                onConnect={handleConnect}
                onError={setError}
                title="Connect the Key Owner's Wallet"
                subtitle="Use the wallet that holds the key asked to sign"
              />
            )}

            {wallet && check.ok && (checkingInputs || inputErrors === null) && (
              <p className="text-white/50 text-xs flex items-center gap-2">
                <span className="spinner-icon" /> Checking that no input belongs to you or to a script…
              </p>
            )}
            {wallet && inputErrors && inputErrors.length > 0 && (
              <div className="rounded-xl border border-brand-error/30 bg-brand-error/[0.10] p-3">
                <p className="text-sm font-semibold text-brand-error mb-1">This transaction will not be signed</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {inputErrors.map((e) => (
                    <li key={e} className="text-brand-error/85 text-xs">
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {wallet && !returnLink && (
              <Button
                onClick={sign}
                disabled={signing || !canSign || walletUtxos === null}
                className="w-full gradient-button text-white font-semibold h-12 shadow-[0_4px_20px_rgba(0,132,255,0.25)] disabled:opacity-50"
              >
                {signing ? (
                  <>
                    <span className="spinner-icon" />
                    Waiting for {walletName}…
                  </>
                ) : (
                  'Sign Claim'
                )}
              </Button>
            )}

            {returnLink && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex items-center gap-2 text-brand-success">
                  <CheckIcon size={18} />
                  <span className="text-sm font-semibold">Signed. Send this back to the person who asked you.</span>
                </div>
                <CopyField
                  label="Return link"
                  value={returnLink}
                  hint="Opening it in their browser adds your signature to their pending claim."
                />
                <CopyField label="Or: witness set CBOR" value={witnessSet} multiline />
              </motion.div>
            )}
          </div>
        </Card>
      )}

      <footer className="mt-auto pt-6 mb-4 border-t border-white/[0.06] text-white/30 text-xs">
        Signing happens in your wallet. This page never sends the transaction anywhere.
      </footer>
    </div>
  );
}
