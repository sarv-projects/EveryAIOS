import type {
  IntentCategory,
  IntentClassification,
  RouteContext,
  RouteDecision,
  UserQuery,
} from '@everyaios/core-domain';

export type { IntentCategory, IntentClassification, RouteContext, RouteDecision, UserQuery };

export interface IntentClassifier {
  classify(query: UserQuery): Promise<IntentClassification>;
}

export interface SmartRouterOptions {
  classifier: IntentClassifier;
}