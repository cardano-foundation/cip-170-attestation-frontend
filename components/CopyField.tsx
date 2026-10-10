'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';

interface CopyFieldProps {
  label: string;
  value: string;
  hint?: string;
  /** Show the value in a scrollable block instead of a single line */
  multiline?: boolean;
  tone?: 'default' | 'success';
}

export default function CopyField({ label, value, hint, multiline, tone = 'default' }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const color = tone === 'success' ? 'text-brand-success/80' : 'text-white/70';

  return (
    <div className="space-y-1.5">
      <Label className="text-white/80 text-sm font-medium">{label}</Label>
      <div className="relative group">
        <div
          className={`bg-black/40 border border-white/[0.10] rounded-lg pl-3 pr-11 font-mono text-xs ${color} ${
            multiline ? 'py-2.5 max-h-[120px] overflow-y-auto break-all leading-relaxed' : 'h-11 flex items-center truncate'
          }`}
          title={value}
        >
          {multiline ? value : <span className="truncate">{value}</span>}
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="absolute top-1.5 right-1.5 p-2 rounded-md bg-white/[0.06] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.12] transition-all duration-200"
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-success">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
      {hint && <p className="text-white/40 text-xs">{hint}</p>}
    </div>
  );
}
