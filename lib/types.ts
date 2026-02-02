// Type definitions for the application

export interface TransactionMetadata {
  [key: string]: any;
}

export interface KERIIdentifier {
  name: string;
  identifierName: string;
  prefix: string;
}

export interface AttestationData {
  txHash: string;
  metadata: TransactionMetadata | null;
  metadataHash: string;
  sequenceNumber: number;
  identifier: string;
  cip170Metadata: any;
}

export enum WorkflowStep {
  CONNECT_WALLET = 'connect_wallet',
  INPUT_TX_HASH = 'input_tx_hash',
  INPUT_IDENTIFIER = 'input_identifier',
  SHOW_METADATA = 'show_metadata',
  CREATE_INTERACTION = 'create_interaction',
  BUILD_TRANSACTION = 'build_transaction',
  PREVIEW_METADATA = 'preview_metadata',
  PUBLISH_TRANSACTION = 'publish_transaction',
  COMPLETED = 'completed'
}
