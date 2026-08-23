/**
 * The EOS agent harness.
 *
 * Built on the AI SDK's tool-loop agent: the model is called with the EOS tool
 * set, tool calls are executed, results are fed back, and the loop repeats
 * until the model stops or the step budget runs out. Tools marked
 * `needsApproval` suspend the loop and hand control to the client.
 *
 * The harness is stateless. Every request carries the full message history
 * from the browser, so nothing has to be kept alive between HTTP calls.
 */
import { ToolLoopAgent, stepCountIs } from 'ai';
import { buildToolSet } from '@/lib/ai/tools';
import { buildProviderOptions, resolveModel, type EffortLevel, type ProviderId } from '@/lib/ai/providers';

/** Upper bound on model calls in a single turn, matching the previous harness. */
export const MAX_STEPS = 20;

export interface CreateAgentOptions {
  provider: ProviderId;
  modelId: string;
  systemPrompt: string;
  isEditorPage: boolean;
  effort: EffortLevel;
  apiKey?: string;
  baseUrl?: string;
}

export function createEosAgent({
  provider,
  modelId,
  systemPrompt,
  isEditorPage,
  effort,
  apiKey,
  baseUrl,
}: CreateAgentOptions) {
  return new ToolLoopAgent({
    model: resolveModel({ provider, modelId, apiKey, baseUrl }),
    instructions: systemPrompt,
    tools: buildToolSet({ isEditorPage }),
    stopWhen: stepCountIs(MAX_STEPS),
    providerOptions: buildProviderOptions(provider, effort),
  });
}
