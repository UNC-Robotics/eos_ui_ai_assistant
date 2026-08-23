/**
 * Collects the EOS tool definitions out of the MCP registration functions so
 * they can be reused by the agent harness without standing up an MCP server.
 *
 * `registerAllTools` only ever calls `registerTool(name, config, handler)`, so
 * a stub that records those three arguments gives us every tool verbatim. They
 * are the same definitions the `/api/[transport]` MCP endpoint serves to
 * external clients, so there is exactly one source of truth for EOS tools.
 */
import type { z } from 'zod/v3';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** The subset of an MCP tool result that the agent bridge cares about. */
export interface McpToolResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface CollectedMcpTool {
  name: string;
  title?: string;
  description: string;
  /** Zod raw shape, as passed to `registerTool`. */
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
}

interface RegisterToolConfig {
  title?: string;
  description?: string;
  inputSchema?: Record<string, z.ZodTypeAny>;
}

/**
 * Run an MCP registration function against a recording stub and return
 * everything it registered.
 */
export function collectMcpTools(register: (server: McpServer) => void): CollectedMcpTool[] {
  const collected: CollectedMcpTool[] = [];

  const recorder = {
    registerTool(
      name: string,
      config: RegisterToolConfig,
      handler: (args: Record<string, unknown>) => Promise<McpToolResult>
    ) {
      collected.push({
        name,
        title: config.title,
        description: config.description ?? config.title ?? name,
        inputSchema: config.inputSchema ?? {},
        handler,
      });
    },
  };

  register(recorder as unknown as McpServer);
  return collected;
}

/**
 * Flatten an MCP tool result into the plain text the model sees.
 *
 * EOS tools return human-readable text (see `lib/mcp/helpers/format.ts`), so
 * concatenating the text blocks preserves exactly what the MCP endpoint would
 * have returned. Non-text blocks are JSON-encoded rather than dropped.
 */
export function mcpResultToText(result: McpToolResult): string {
  const blocks = result.content ?? [];
  const text = blocks
    .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : JSON.stringify(block)))
    .join('\n')
    .trim();

  if (text) return text;
  return result.isError ? 'The tool reported an error but returned no message.' : 'Done.';
}
