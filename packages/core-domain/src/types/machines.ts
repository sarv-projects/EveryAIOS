export type ConversationState =
  | 'IDLE'
  | 'COMPILING'
  | 'ROUTED'
  | 'STREAMING'
  | 'TOOL_WAIT'
  | 'TOOL_RUN'
  | 'COMPLETED'
  | 'EXTRACTING'
  | 'CANCELLED'
  | 'FAILED';

export type ConversationEvent =
  | { type: 'SEND' }
  | { type: 'CONTEXT_READY' }
  | { type: 'ROUTE_DONE' }
  | { type: 'TOOL_CALL'; risk: string }
  | { type: 'TOOL_APPROVE' }
  | { type: 'TOOL_REJECT' }
  | { type: 'STREAM_DONE' }
  | { type: 'CANCEL' }
  | { type: 'ERROR'; error: string }
  | { type: 'RETRY' }
  | { type: 'EXTRACT_DONE' };
