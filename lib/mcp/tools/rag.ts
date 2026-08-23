import { z } from 'zod/v3';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ragGet, ragPost } from '@/lib/api/rag';
import { textResult, errorResult } from '../helpers/format';

export function registerRagTools(server: McpServer) {
  server.registerTool(
    'list_knowledge_base_collections',
    {
      title: 'List Knowledge Base Collections',
      description:
        'List all collections in the knowledge base. Returns collection IDs, names, descriptions, and document counts. Use collection IDs with search_knowledge_base.',
      inputSchema: {},
    },
    async () => {
      try {
        const collections = (await ragGet('/collections')) as Array<Record<string, unknown>>;
        if (!collections.length) return textResult('No collections found.');

        const lines = [`${collections.length} collection(s):\n`];
        for (const c of collections) {
          lines.push(`- ${c.name} [id: ${c.id}] — ${c.document_count} documents`);
          if (c.description) lines.push(`  ${c.description}`);
        }
        return textResult(lines.join('\n'));
      } catch (e) {
        return errorResult(`Failed to list collections: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  server.registerTool(
    'search_knowledge_base',
    {
      title: 'Search Knowledge Base',
      description:
        'Search knowledge base collections for relevant scientific content. Returns ranked passages with citations and document IDs. Use the document_id to read the full document with read_knowledge_base_document.',
      inputSchema: {
        query: z.string().describe('Search query — use specific scientific questions'),
        collection_ids: z.array(z.string()).describe('Collection IDs to search'),
        top_k: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(5)
          .optional()
          .describe('Max chunk results to return (default 5)'),
        llm_reranking: z
          .boolean()
          .default(true)
          .optional()
          .describe('Use LLM to rerank results for relevance (default true)'),
      },
    },
    async ({ query, collection_ids, top_k, llm_reranking }) => {
      try {
        const results = (await ragPost('/search', {
          query,
          collection_ids,
          top_k,
          llm_reranking,
        })) as Array<Record<string, unknown>>;

        if (!results.length) return textResult('No relevant results found.');

        const lines = [`Found ${results.length} results:`];
        for (const r of results) {
          lines.push(`\n${r.citation} [document_id: ${r.document_id}] (score: ${Number(r.score).toFixed(2)})`);
          lines.push(String(r.text).slice(0, 500));
        }
        return textResult(lines.join('\n'));
      } catch (e) {
        return errorResult(`Knowledge base search failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  server.registerTool(
    'read_knowledge_base_document',
    {
      title: 'Read Knowledge Base Document',
      description:
        'Read the full parsed text content of a document from the knowledge base. Use this after searching to read complete documents. Returns the full text assembled from all chunks.',
      inputSchema: {
        document_id: z.string().describe('Document ID (from search_knowledge_base results)'),
      },
    },
    async ({ document_id }) => {
      try {
        const result = (await ragGet(`/documents/${encodeURIComponent(document_id)}/content`)) as {
          name: string;
          chunk_count: number;
          chunks: Array<{ chunk_index: number; text: string; page_number: number | null; page_end: number | null }>;
        };

        const lines = [`Document: ${result.name}`, `Chunks: ${result.chunk_count}`, '─'.repeat(60)];
        for (const chunk of result.chunks) {
          const page =
            chunk.page_number != null
              ? chunk.page_end != null && chunk.page_end !== chunk.page_number
                ? `pp.${chunk.page_number}-${chunk.page_end}`
                : `p.${chunk.page_number}`
              : '';
          lines.push(`\n[Chunk ${chunk.chunk_index + 1}${page ? ` | ${page}` : ''}]`);
          lines.push(chunk.text);
        }
        return textResult(lines.join('\n'));
      } catch (e) {
        return errorResult(`Failed to read document: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );
}
