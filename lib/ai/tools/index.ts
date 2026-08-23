/**
 * Builds the tool set the agent harness runs with.
 *
 * Three kinds of tools end up here:
 *
 *  - **EOS tools**: every tool the MCP server exposes, reused verbatim.
 *    State-changing ones are marked `needsApproval`, so the AI SDK suspends the
 *    loop and asks the user before running them.
 *  - **Editor tools**: server-executed. Their output is echoed back to the
 *    client, which applies it to the protocol canvas as the stream arrives.
 *  - **Client tools**: declared without `execute`. The model calls them, the
 *    browser resolves them (saving a file, asking the scientist a question) and
 *    sends the result back, which resumes the loop.
 */
import { tool, type ToolSet } from 'ai';
import { z } from 'zod/v3';
import { registerAllTools } from '@/lib/mcp/tools/register';
import { validateYaml } from '@/lib/ai/protocolValidation';
import { CLIENT_TOOLS, MUTATING_TOOLS } from '@/lib/ai/mutating-tools';
import { collectMcpTools, mcpResultToText } from './collect';

/**
 * The EOS tool definitions, collected once per server process. Registration is
 * pure, building only descriptions and closures over module-level API helpers,
 * so it is safe to share across requests.
 */
const eosTools = collectMcpTools(registerAllTools);

/** Turn the collected MCP tools into AI SDK tools. */
function buildEosToolSet(): ToolSet {
  const tools: ToolSet = {};

  for (const eosTool of eosTools) {
    tools[eosTool.name] = tool({
      description: eosTool.description,
      inputSchema: z.object(eosTool.inputSchema),
      needsApproval: MUTATING_TOOLS.has(eosTool.name),
      execute: async (args) => {
        const result = await eosTool.handler((args ?? {}) as Record<string, unknown>);
        return mcpResultToText(result);
      },
    });
  }

  return tools;
}

/**
 * Tools that write to the visual protocol editor. They validate on the server
 * and return the new content. The client watches for the output and applies it
 * to the canvas.
 */
function buildEditorToolSet(): ToolSet {
  return {
    update_protocol_yaml: tool({
      description:
        'Apply the protocol YAML to the visual canvas. Only checks YAML syntax. Use validate_protocol_yaml first for full validation.',
      inputSchema: z.object({
        yaml: z.string().describe('The complete protocol YAML'),
        description: z.string().describe('Short summary of what changed'),
      }),
      execute: async ({ yaml, description }) => {
        const validation = validateYaml(yaml);
        if (!validation.valid) {
          return { success: false, error: `YAML syntax error: ${validation.error}` };
        }
        return { success: true, yaml, description, validated: true };
      },
    }),

    update_optimizer_python: tool({
      description:
        'Update optimizer.py by providing the complete Python code. The code is validated and applied to the editor.',
      inputSchema: z.object({
        python: z.string().describe('The complete optimizer.py source'),
        description: z.string().describe('Short summary of what changed'),
      }),
      execute: async ({ python, description }) => {
        if (!python.includes('def eos_create_campaign_optimizer')) {
          return { success: false, error: 'Missing required function: eos_create_campaign_optimizer' };
        }
        if (!/return\s/.test(python)) {
          return { success: false, error: 'Missing return statement in eos_create_campaign_optimizer' };
        }
        return { success: true, python, description, validated: true };
      },
    }),

    // No `execute`: the browser performs the save and returns the outcome.
    save_protocol: tool({
      description:
        'Save the current editor state to disk. Required before run_simulator. Only call when there are unsaved changes.',
      inputSchema: z.object({}),
    }),
  };
}

/**
 * Interactive Q&A. Declared without `execute`, so the panel renders the
 * questions and sends the scientist's answers back as the tool result.
 */
function buildAskScientistTool(): ToolSet {
  return {
    ask_scientist: tool({
      description:
        'Ask the scientist clarifying questions before proceeding. Use when the request is ambiguous, you need to choose between significantly different approaches, or domain-specific preferences matter for the outcome.',
      inputSchema: z.object({
        questions: z
          .array(
            z.object({
              id: z.string().describe('Stable identifier for this question'),
              question: z.string(),
              options: z.array(z.string()).min(2).max(3).describe('Two or three answers to choose between'),
            })
          )
          .min(1)
          .max(5),
      }),
    }),
  };
}

/**
 * Assemble the tool set for a request. Editor tools are only offered on the
 * editor page, where a canvas actually exists to write to.
 */
export function buildToolSet({ isEditorPage }: { isEditorPage: boolean }): ToolSet {
  return {
    ...buildEosToolSet(),
    ...(isEditorPage ? buildEditorToolSet() : {}),
    ...buildAskScientistTool(),
  };
}

/** Tool names the client is responsible for resolving. */
export { CLIENT_TOOLS };
