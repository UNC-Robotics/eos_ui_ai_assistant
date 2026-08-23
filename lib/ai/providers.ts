/**
 * Model providers for the EOS assistant.
 *
 * Two are supported: Anthropic's API and any Ollama server. Ollama speaks the
 * OpenAI-compatible protocol, so it needs no bespoke client, just a base URL.
 *
 * Credentials are supplied per user from the browser and are never persisted
 * server-side. `ANTHROPIC_API_KEY` / `OLLAMA_BASE_URL` act as deployment-wide
 * fallbacks when set.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export const PROVIDER_IDS = ['anthropic', 'ollama'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export interface ModelOption {
  id: string;
  name: string;
}

/**
 * Anthropic models worth offering for this workload. All are tool-capable and
 * support adaptive thinking with an effort setting.
 */
export const ANTHROPIC_MODELS: ModelOption[] = [
  { id: 'claude-opus-5', name: 'Claude Opus 5' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
];

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

/**
 * Ollama models are whatever the user has pulled, so there is no fixed list.
 * The settings panel enumerates the server's installed models via
 * `/api/ai/ollama/models` and any `name:tag` can also be typed in by hand.
 */
export const DEFAULT_OLLAMA_MODEL = '';
export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

export interface ResolveModelOptions {
  provider: ProviderId;
  modelId: string;
  /** Anthropic API key supplied by the user. */
  apiKey?: string;
  /** Ollama server URL supplied by the user. */
  baseUrl?: string;
}

export class MissingCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingCredentialsError';
  }
}

/** Build the language model for a request. */
export function resolveModel({ provider, modelId, apiKey, baseUrl }: ResolveModelOptions): LanguageModel {
  if (provider === 'anthropic') {
    const key = apiKey?.trim() || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new MissingCredentialsError(
        'No Anthropic API key. Add one in the assistant settings, or set ANTHROPIC_API_KEY on the server.'
      );
    }
    return createAnthropic({ apiKey: key })(modelId);
  }

  const url = baseUrl?.trim() || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
  return createOpenAICompatible({
    name: 'ollama',
    baseURL: url,
    // Ollama ignores the key but the OpenAI protocol requires the header.
    apiKey: apiKey?.trim() || 'ollama',
  }).chatModel(modelId);
}

/**
 * Provider-specific request options.
 *
 * Anthropic gets adaptive thinking plus the effort level from the settings
 * panel. Ollama has no equivalent knob, so effort is simply not sent.
 */
export function buildProviderOptions(provider: ProviderId, effort: EffortLevel) {
  if (provider !== 'anthropic') return undefined;
  return {
    anthropic: {
      thinking: { type: 'adaptive' as const, display: 'summarized' as const },
      effort,
    },
  };
}
