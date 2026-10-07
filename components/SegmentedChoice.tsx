'use client';

import { motion } from 'motion/react';

export interface Choice<T extends string> {
  value: T;
  title: string;
  description: string;
  badge?: string;
}

interface SegmentedChoiceProps<T extends string> {
  label: string;
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Two or more mutually exclusive cards, styled like the rest of the glass UI */
export default function SegmentedChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: SegmentedChoiceProps<T>) {
  return (
    <div className="mb-4" role="radiogroup" aria-label={label}>
      <p className="text-xs text-white/50 uppercase tracking-wider font-medium mb-2">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`relative text-left rounded-xl border px-3.5 py-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                selected
                  ? 'bg-brand-primary/[0.12] border-brand-primary/40 shadow-[0_0_16px_rgba(0,132,255,0.15)]'
                  : 'bg-white/[0.03] border-white/[0.10] hover:bg-white/[0.06] hover:border-white/[0.18]'
              }`}
            >
              {selected && (
                <motion.span
                  layoutId={`choice-dot-${label}`}
                  className="absolute top-3 right-3 w-2 h-2 rounded-full bg-brand-secondary shadow-[0_0_8px_rgba(0,224,255,0.6)]"
                />
              )}
              <span className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${selected ? 'text-white' : 'text-white/80'}`}>{option.title}</span>
                {option.badge && (
                  <span className="text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-accent/15 text-brand-accent border border-brand-accent/25">
                    {option.badge}
                  </span>
                )}
              </span>
              <span className="block text-xs text-white/50 mt-1 pr-4 leading-relaxed">{option.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
