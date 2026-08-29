export { ConversationEngine } from './engine';
export type {
  EngineEvent,
  EngineDeps,
  EngineCallback,
  StreamChunk,
  StreamProviderExtras,
  ToolResultRecord,
} from './engine';
export type { TrajectoryStep, TurnTrajectory } from './trajectory';
export {
  assessHallucinationRisk,
  countUncertaintyMarkers,
  evaluateCalibration,
} from './risk-compass';
export type { RiskSignals, RiskAssessment, RiskBand, CalibrationSample, CalibrationReport } from './risk-compass';
export { defaultContract } from './surface-contract';
export type { SurfaceContract, SurfaceKind, ToolFamily, TurnInput, AgentSandbox } from './types';
export { compilePrompt } from './prompt-compiler/index';
export type { CompiledPrompt } from './prompt-compiler/index';

// Automation engine (ConversationEngine-lite)
export {
  getAutomationSurface,
  estimateAutomationCost,
  automationInputToTurnInput,
} from './automation-engine';
export type { AutomationRunInput, AutomationRunResult } from './automation-engine';

// Pipeline stage scaffolds
export {
  RetrievalPlanner,
  ToolPlanner,
  FAMILY_TO_TOOLS,
  PermissionGate,
} from './stages';
export type {
  RetrievalPlan,
  ToolPlan,
  GateResult,
} from './stages';
