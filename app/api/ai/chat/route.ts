import { NextResponse } from 'next/server';
import { createAgentUIStreamResponse, type UIMessage } from 'ai';
import { generateGlobalSystemPrompt, type SystemPromptContext } from '@/features/ai-assistant/utils/systemPrompt';
import type { TaskSpec, TaskNode } from '@/lib/types/protocol';
import type { LabSpec } from '@/lib/api/specs';
import type { PageContext } from '@/features/ai-assistant/utils/pageContext';
import { createEosAgent } from '@/lib/ai/agent';
import {
  DEFAULT_ANTHROPIC_MODEL,
  MissingCredentialsError,
  isProviderId,
  type EffortLevel,
  type ProviderId,
} from '@/lib/ai/providers';

/**
 * Agent turns run many tool calls back to back, so allow a generous ceiling.
 * The client can stop a run at any point.
 */
export const maxDuration = 300;

interface ChatRequest {
  messages: UIMessage[];
  pageContext: PageContext;
  protocolContext?: {
    protocolType: string;
    protocolDesc: string;
    labs: string[];
    tasks: TaskNode[];
    taskTemplates: TaskSpec[];
    labSpecs: Record<string, LabSpec>;
  };
  settings: {
    provider: ProviderId;
    selectedModel: string;
    effort?: EffortLevel;
    apiKey?: string;
    baseUrl?: string;
  };
}

function buildProtocolPromptContext(protocolContext: ChatRequest['protocolContext']): SystemPromptContext | undefined {
  if (!protocolContext) return undefined;
  const taskSpecsMap: Record<string, TaskSpec> = {};
  protocolContext.taskTemplates.forEach((t) => {
    taskSpecsMap[t.type] = t;
  });
  const currentProtocol =
    protocolContext.tasks.length > 0 || protocolContext.labs.length > 0
      ? {
          type: protocolContext.protocolType,
          desc: protocolContext.protocolDesc,
          labs: protocolContext.labs,
          tasks: protocolContext.tasks,
        }
      : undefined;
  return { taskSpecs: taskSpecsMap, labSpecs: protocolContext.labSpecs, currentProtocol };
}

export async function POST(request: Request) {
  try {
    const { messages, pageContext, protocolContext, settings } = (await request.json()) as ChatRequest;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    const provider = isProviderId(settings?.provider) ? settings.provider : 'anthropic';
    const isEditorPage = pageContext.pageId === 'editor';

    const systemPrompt = generateGlobalSystemPrompt({
      pageContext,
      protocolContext: isEditorPage ? buildProtocolPromptContext(protocolContext) : undefined,
    });

    const agent = createEosAgent({
      provider,
      modelId: settings?.selectedModel || DEFAULT_ANTHROPIC_MODEL,
      systemPrompt,
      isEditorPage,
      effort: settings?.effort ?? 'medium',
      apiKey: settings?.apiKey,
      baseUrl: settings?.baseUrl,
    });

    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      abortSignal: request.signal,
      // Surface the real cause to the panel. A bad key or an unreachable
      // Ollama server is something the user can actually fix.
      onError: (error) => (error instanceof Error ? error.message : 'The assistant hit an unexpected error.'),
    });
  } catch (error: unknown) {
    if (error instanceof MissingCredentialsError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Chat API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
