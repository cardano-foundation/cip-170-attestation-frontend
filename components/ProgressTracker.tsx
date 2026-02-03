'use client';

import { WorkflowStep } from '@/lib/types';

interface StepInfo {
  step: WorkflowStep;
  label: string;
  icon: string;
}

const WORKFLOW_STEPS: StepInfo[] = [
  { step: WorkflowStep.CONNECT_WALLET, label: 'Connect Wallet', icon: '🔗' },
  { step: WorkflowStep.INPUT_TX_HASH, label: 'Transaction', icon: '📝' },
  { step: WorkflowStep.INPUT_IDENTIFIER, label: 'Identifier', icon: '🔑' },
  { step: WorkflowStep.SHOW_METADATA, label: 'Metadata', icon: '📊' },
  { step: WorkflowStep.BUILD_TRANSACTION, label: 'Build', icon: '🔨' },
  { step: WorkflowStep.PREVIEW_METADATA, label: 'Preview', icon: '👁️' },
  { step: WorkflowStep.COMPLETED, label: 'Complete', icon: '✅' },
];

interface ProgressTrackerProps {
  currentStep: WorkflowStep;
  completedSteps: Set<WorkflowStep>;
  onStepClick: (step: WorkflowStep) => void;
}

export default function ProgressTracker({
  currentStep,
  completedSteps,
  onStepClick,
}: ProgressTrackerProps) {
  const currentIndex = WORKFLOW_STEPS.findIndex(s => s.step === currentStep);

  return (
    <div className="progress-tracker">
      <div className="progress-line">
        <div
          className="progress-line-fill"
          style={{
            width: `${(currentIndex / (WORKFLOW_STEPS.length - 1)) * 100}%`,
          }}
        />
      </div>

      <div className="progress-steps">
        {WORKFLOW_STEPS.map((stepInfo, index) => {
          const isCompleted = completedSteps.has(stepInfo.step);
          const isCurrent = stepInfo.step === currentStep;
          const isPast = index < currentIndex;
          const isAccessible = isPast || isCurrent;

          return (
            <div
              key={stepInfo.step}
              className={`progress-step ${
                isCompleted ? 'completed' : ''
              } ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''}`}
              onClick={() => isAccessible && onStepClick(stepInfo.step)}
              style={{ cursor: isAccessible ? 'pointer' : 'default' }}
            >
              <div className="progress-step-circle">
                {isCompleted && !isCurrent ? (
                  <span className="checkmark">✓</span>
                ) : (
                  <span className="step-icon">{stepInfo.icon}</span>
                )}
              </div>
              <div className="progress-step-label">{stepInfo.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
