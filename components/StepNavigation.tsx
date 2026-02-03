'use client';

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
    <div className="step-navigation">
      {onBack && (
        <button
          onClick={onBack}
          className="button button-secondary"
          disabled={loading}
        >
          ← Back
        </button>
      )}
      
      {onNext && (
        <button
          onClick={onNext}
          className="button button-primary"
          disabled={nextDisabled || loading}
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Loading...
            </>
          ) : (
            <>
              {nextLabel} →
            </>
          )}
        </button>
      )}
    </div>
  );
}
