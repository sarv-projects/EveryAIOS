/** Groups for organising provider tiles in the UI */
export type ProviderGroup =
  | 'forever-free'
  | 'aggregator'
  | 'payg'
  | 'eastern-frontier'
  | 'western-frontier'
  | 'self-hosted'
  | 'on-device'
  | 'web-search'
  | 'image-byok'
  | 'video-byok'
  | 'mcp'
  | 'services';

/** A connected BYOK AI provider */
export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
  group: ProviderGroup;
  createdAt: string;
}

/** Request body for chat completion */
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/** A single message in a chat conversation */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A token emitted during streaming */
export interface Token {
  text: string;
  done: boolean;
  reasoning?: string;
  usage?: TokenUsage;
}

/** Token consumption counters */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Image generation request */
export interface ImageRequest {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
}

/** URL of a generated image */
export interface ImageUrl {
  url: string;
  revisedPrompt?: string;
}

/** Vision/analysis request for an image */
export interface VisionRequest {
  model: string;
  imageUrl: string;
  prompt: string;
  maxTokens?: number;
}

/** Repository interface for all provider interactions */
export interface ProviderRepository {
  getActiveProvider(): Promise<ProviderConfig | null>;
  validateKey(config: ProviderConfig): Promise<boolean>;
  streamCompletion(request: ChatRequest): AsyncIterable<Token>;
  generateImage(request: ImageRequest): Promise<import('./result').Result<ImageUrl>>;
  analyzeImage(request: VisionRequest): Promise<import('./result').Result<string>>;
}
