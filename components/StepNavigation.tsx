'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface StepNavigationProps {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
}

export default function StepNavigation({
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled = false,
  loading = false,
}: StepNavigationProps) {
  return (
    <>
      <Separator className="my-3 bg-white/[0.10]" />
      <div className="flex gap-3 justify-between">
        {onBack && (
          <Button
            onClick={onBack}
            variant="ghost"
            disabled={loading}
            className="text-white/60 hover:text-white hover:bg-white/[0.06] min-w-[120px] border border-white/[0.08] hover:border-white/[0.15]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mr-2">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </Button>
        )}

        {onNext && (
          <Button
            onClick={onNext}
            disabled={nextDisabled || loading}
            className="gradient-button text-white font-semibold min-w-[180px] h-11 shadow-[0_4px_20px_rgba(0,132,255,0.25)] hover:shadow-[0_6px_28px_rgba(0,132,255,0.35)] transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100 ml-auto"
          >
            {loading ? (
              <>
                <span className="spinner-icon" />
                Processing...
              </>
            ) : (
              <>
                {nextLabel}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ml-2">
                  <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </Button>
        )}
      </div>
    </>
  );
}
