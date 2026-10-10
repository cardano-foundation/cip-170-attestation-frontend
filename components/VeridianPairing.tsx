'use client';

import { ReactNode, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { KeyIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import CopyField from '@/components/CopyField';
import { getSignifyBootUrl } from '@/lib/config';
import {
  PairedWallet,
  VeridianAgent,
  aidFromOobi,
  forgetPairedWallet,
  loadPairedWallet,
} from '@/lib/veridian';

interface VeridianPairingProps {
  /** KERIA of this app's browser agent: the same KERIA as the Signify URL */
  keriaUrl: string;
  isSodiumReady: boolean;
  onPaired: (agent: VeridianAgent, wallet: PairedWallet) => void;
  onError: (error: string) => void;
  modeSelector?: ReactNode;
}

export default function VeridianPairing({ keriaUrl, isSodiumReady, onPaired, onError, modeSelector }: VeridianPairingProps) {
  const [agent, setAgent] = useState<VeridianAgent | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [walletOobi, setWalletOobi] = useState('');
  const [pairing, setPairing] = useState(false);
  const [saved, setSaved] = useState<PairedWallet | null>(null);

  useEffect(() => {
    setSaved(loadPairedWallet(keriaUrl));
  }, [keriaUrl]);

  const startAgent = async () => {
    try {
      setStarting(true);
      setStartError('');
      onError('');
      setAgent(await VeridianAgent.start(keriaUrl, getSignifyBootUrl(keriaUrl)));
    } catch (err: any) {
      setStartError(err.message || String(err));
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (isSodiumReady && !agent && !starting && !startError) startAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSodiumReady]);

  const pair = async (oobi: string) => {
    if (!agent) return;
    try {
      setPairing(true);
      onError('');
      const wallet = await agent.pairWallet(oobi);
      setSaved(wallet);
      onPaired(agent, wallet);
    } catch (err: any) {
      onError(`Could not pair the wallet: ${err.message || err}`);
    } finally {
      setPairing(false);
    }
  };

  const oobiValid = walletOobi === '' || !!aidFromOobi(walletOobi);

  return (
    <div className="py-3 px-1">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
          <KeyIcon size={24} className="text-brand-primary" />
        </div>
      </div>

      <h2 className="text-xl font-semibold text-white text-center mb-1">KERI Identifier Information</h2>
      <p className="text-white/60 text-sm text-center mb-4 max-w-md mx-auto">
        Pair your Veridian wallet. It approves every anchoring request on your phone.
      </p>

      {modeSelector}

      {/* App agent */}
      <div className="rounded-xl border border-white/[0.10] bg-white/[0.03] p-3.5 mb-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-white/90">1. Connect Veridian to this app</p>
          {agent ? (
            <Badge className="bg-brand-success/20 text-brand-success border-brand-success/30 text-xs">Agent ready</Badge>
          ) : starting ? (
            <Badge className="bg-white/[0.08] text-white/60 border-white/[0.12] text-xs">Starting…</Badge>
          ) : null}
        </div>

        {startError && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-brand-error/[0.12] border border-brand-error/25 rounded-lg p-3">
            <p className="text-brand-error/90 text-xs flex-1 break-all">
              Could not start the app&apos;s KERI agent at {keriaUrl}: {startError}
            </p>
            <Button
              variant="ghost"
              onClick={startAgent}
              className="text-white/70 hover:text-white border border-white/[0.12] h-8 text-xs shrink-0"
            >
              Retry
            </Button>
          </div>
        )}

        {agent && (
          <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
            <div className="bg-white p-2.5 rounded-lg shrink-0">
              <QRCodeSVG value={agent.oobi} size={132} level="M" />
            </div>
            <div className="flex-1 min-w-0 w-full space-y-2">
              <p className="text-white/60 text-xs leading-relaxed">
                In Veridian, add a new connection and scan this code, or paste the OOBI below.
              </p>
              <CopyField label="App OOBI" value={agent.oobi} />
            </div>
          </div>
        )}
      </div>

      {/* Wallet OOBI */}
      <div className="rounded-xl border border-white/[0.10] bg-white/[0.03] p-3.5">
        <p className="text-sm font-semibold text-white/90 mb-2">2. Share your wallet&apos;s OOBI</p>

        {saved && (
          <div className="bg-brand-success/[0.10] border border-brand-success/20 rounded-lg p-3 mb-3">
            <p className="text-white/40 text-[0.65rem] uppercase tracking-wider mb-1">Previously paired wallet</p>
            <code className="text-brand-success/80 font-mono text-xs break-all">{saved.aid}</code>
            <div className="flex gap-2 mt-2.5">
              <Button
                onClick={() => pair(saved.oobi)}
                disabled={!agent || pairing}
                className="gradient-button text-white font-semibold h-9 text-xs px-4"
              >
                {pairing ? (
                  <>
                    <span className="spinner-icon" />
                    Checking…
                  </>
                ) : (
                  'Use this wallet'
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  forgetPairedWallet(keriaUrl);
                  setSaved(null);
                }}
                className="text-white/60 hover:text-white border border-white/[0.10] h-9 text-xs"
              >
                Pair a different wallet
              </Button>
            </div>
          </div>
        )}

        {!saved && (
          <>
            <div className="space-y-2">
              <Label className="text-white/80 text-sm font-medium">Wallet OOBI</Label>
              <Input
                type="text"
                value={walletOobi}
                onChange={(e) => setWalletOobi(e.target.value.trim())}
                placeholder="https://…/oobi/<your AID>/agent/…"
                className={`h-10 bg-white/[0.07] border-white/[0.14] text-white font-mono text-xs placeholder:text-white/30 focus-ring ${
                  !oobiValid ? 'border-brand-error/50' : ''
                }`}
              />
              <p className={`text-xs ${oobiValid ? 'text-white/40' : 'text-brand-error'}`}>
                {oobiValid
                  ? 'In Veridian, open your identifier and share its connection OOBI.'
                  : 'Expected a URL containing /oobi/<AID>/'}
              </p>
            </div>
            <Button
              onClick={() => pair(walletOobi)}
              disabled={!agent || pairing || !walletOobi || !oobiValid}
              className="w-full mt-3 gradient-button text-white font-semibold h-12 shadow-[0_4px_20px_rgba(0,132,255,0.25)] hover:shadow-[0_6px_28px_rgba(0,132,255,0.35)] transition-all duration-300 hover:scale-[1.01] disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100"
            >
              {pairing ? (
                <>
                  <span className="spinner-icon" />
                  Resolving wallet…
                </>
              ) : (
                'Pair Wallet'
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
