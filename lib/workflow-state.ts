// Workflow state management and validation

import { WorkflowStep } from './types';

export interface StepValidation {
  isValid: boolean;
  canProceed: boolean;
  error?: string;
}

export interface WorkflowState {
  currentStep: WorkflowStep;
  completedSteps: Set<WorkflowStep>;
  validationStatus: Map<WorkflowStep, StepValidation>;
}

/**
 * Check if a step has been completed and validated
 */
export function isStepCompleted(state: WorkflowState, step: WorkflowStep): boolean {
  return state.completedSteps.has(step);
}

/**
 * Check if we can navigate to a specific step
 */
export function canNavigateToStep(state: WorkflowState, targetStep: WorkflowStep): boolean {
  const stepOrder = Object.values(WorkflowStep);
  const currentIndex = stepOrder.indexOf(state.currentStep);
  const targetIndex = stepOrder.indexOf(targetStep);
  
  // Can always go back to previous steps
  if (targetIndex <= currentIndex) {
    return true;
  }
  
  // Can go forward only if all previous steps are completed
  for (let i = 0; i < targetIndex; i++) {
    if (!state.completedSteps.has(stepOrder[i])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get the next available step
 */
export function getNextStep(currentStep: WorkflowStep): WorkflowStep | null {
  const steps = Object.values(WorkflowStep);
  const currentIndex = steps.indexOf(currentStep);
  
  if (currentIndex === -1 || currentIndex === steps.length - 1) {
    return null;
  }
  
  return steps[currentIndex + 1];
}

/**
 * Get the previous step
 */
export function getPreviousStep(currentStep: WorkflowStep): WorkflowStep | null {
  const steps = Object.values(WorkflowStep);
  const currentIndex = steps.indexOf(currentStep);
  
  if (currentIndex <= 0) {
    return null;
  }
  
  return steps[currentIndex - 1];
}

/**
 * Validate wallet connection step
 */
export function validateWalletConnection(
  walletConnected: boolean,
  walletAddress: string
): StepValidation {
  if (!walletConnected || !walletAddress) {
    return {
      isValid: false,
      canProceed: false,
      error: 'Wallet not connected',
    };
  }
  
  return {
    isValid: true,
    canProceed: true,
  };
}

/**
 * Validate transaction input step
 */
export function validateTransactionInput(
  txHash: string,
  blockfrostApiKey: string,
  metadata: any
): StepValidation {
  if (!txHash) {
    return {
      isValid: false,
      canProceed: false,
      error: 'Transaction hash is required',
    };
  }
  
  if (!blockfrostApiKey) {
    return {
      isValid: false,
      canProceed: false,
      error: 'Blockfrost API key is required',
    };
  }
  
  if (!metadata) {
    return {
      isValid: false,
      canProceed: false,
      error: 'Metadata not fetched',
    };
  }
  
  return {
    isValid: true,
    canProceed: true,
  };
}

/**
 * Validate identifier input step
 */
export function validateIdentifierInput(
  identifierName: string,
  name: string,
  identifier: string
): StepValidation {
  if (!identifierName || !name) {
    return {
      isValid: false,
      canProceed: false,
      error: 'Identifier name and client name are required',
    };
  }
  
  if (!identifier) {
    return {
      isValid: false,
      canProceed: false,
      error: 'Identifier not verified',
    };
  }
  
  return {
    isValid: true,
    canProceed: true,
  };
}
