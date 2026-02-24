'use client';

import { WorkflowStep } from '@/lib/types';
import { WalletIcon, DocumentIcon, KeyIcon, ChartIcon, BuildIcon, EyeIcon, CheckIcon } from '@/components/icons';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { motion } from 'motion/react';

interface StepInfo {
  step: WorkflowStep;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

const WORKFLOW_STEPS: StepInfo[] = [
  { step: WorkflowStep.CONNECT_WALLET, label: 'Connect Wallet', icon: WalletIcon },
  { step: WorkflowStep.INPUT_TX_HASH, label: 'Transaction', icon: DocumentIcon },
  { step: WorkflowStep.INPUT_IDENTIFIER, label: 'Identifier', icon: KeyIcon },
  { step: WorkflowStep.SHOW_METADATA, label: 'Metadata', icon: ChartIcon },
  { step: WorkflowStep.BUILD_TRANSACTION, label: 'Build', icon: BuildIcon },
  { step: WorkflowStep.PREVIEW_METADATA, label: 'Preview', icon: EyeIcon },
  { step: WorkflowStep.COMPLETED, label: 'Complete', icon: CheckIcon },
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
  const progress = (currentIndex / (WORKFLOW_STEPS.length - 1)) * 100;

  return (
    <div className="relative my-3 mb-4">
      {/* Background track */}
      <div className="absolute top-5 left-5 right-5 h-[3px] rounded-full bg-white/[0.08]" />

      {/* Animated fill */}
      <motion.div
        className="absolute top-5 left-5 h-[3px] rounded-full"
        style={{
          background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
        }}
        initial={{ width: '0%' }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
      />

      {/* Step circles */}
      <div className="relative flex justify-between z-10">
        {WORKFLOW_STEPS.map((stepInfo, index) => {
          const isCompleted = completedSteps.has(stepInfo.step);
          const isCurrent = stepInfo.step === currentStep;
          const isPast = index < currentIndex;
          const isAccessible = isPast || isCurrent;

          return (
            <Tooltip key={stepInfo.step}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => isAccessible && onStepClick(stepInfo.step)}
                  className={`flex flex-col items-center flex-1 min-w-0 transition-all duration-300 bg-transparent border-none ${
                    isAccessible ? 'cursor-pointer' : 'cursor-default'
                  }`}
                  type="button"
                >
                  <div className="relative">
                    {/* Active indicator glow */}
                    {isCurrent && (
                      <motion.div
                        layoutId="active-step-glow"
                        className="absolute -inset-1.5 rounded-full"
                        style={{
                          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3), transparent 70%)',
                        }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}

                    {/* Circle */}
                    <motion.div
                      className={`relative w-10 h-10 rounded-full flex items-center justify-center text-sm transition-all duration-300 ring-4 ring-[#050510] ${
                        isCompleted && !isCurrent
                          ? 'bg-brand-success shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                          : isCurrent
                          ? 'bg-brand-primary shadow-[0_0_16px_rgba(99,102,241,0.4)]'
                          : 'bg-[#12122a] border border-white/[0.12]'
                      }`}
                      animate={isCurrent ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                      transition={isCurrent ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                    >
                      {isCompleted && !isCurrent ? (
                        <CheckIcon size={16} className="text-white" />
                      ) : (
                        <stepInfo.icon
                          size={16}
                          className={
                            isCurrent
                              ? 'text-white'
                              : 'text-white/40'
                          }
                        />
                      )}
                    </motion.div>
                  </div>

                  {/* Label - hidden on mobile */}
                  <span
                    className={`mt-2 text-[0.65rem] font-semibold tracking-wide hidden sm:block truncate max-w-[70px] ${
                      isCurrent
                        ? 'text-white'
                        : isCompleted
                        ? 'text-white/70'
                        : 'text-white/30'
                    }`}
                  >
                    {stepInfo.label}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="bg-elevated border-white/10 text-white text-xs"
              >
                {stepInfo.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
