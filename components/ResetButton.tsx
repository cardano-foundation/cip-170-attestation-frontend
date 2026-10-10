'use client';

import { useEffect, useState } from 'react';

interface ResetButtonProps {
  onReset: () => void;
  disabled?: boolean;
  /** Extra warning shown on the confirm step, e.g. when a built claim would be discarded */
  warning?: string;
}

/** Two-step reset: the first click arms it, a second click within a few seconds resets */
export default function ResetButton({ onReset, disabled, warning }: ResetButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onReset();
        } else {
          setArmed(true);
        }
      }}
      title={armed && warning ? warning : 'Start over from the first step'}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-200 shadow-lg shadow-black/20 disabled:opacity-40 disabled:cursor-not-allowed ${
        armed
          ? 'bg-brand-error/15 border-brand-error/40 text-brand-error'
          : 'bg-white/[0.05] border-white/[0.08] text-white/70 hover:bg-white/[0.08] hover:border-white/[0.15]'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 3v6h6" />
      </svg>
      <span className="hidden sm:inline">{armed ? (warning ? 'Discard & reset?' : 'Confirm reset') : 'Reset'}</span>
    </button>
  );
}
