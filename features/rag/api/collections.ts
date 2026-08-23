'use server';

import { ragGet, ragPost, ragPut, ragDelete, RagServiceUnavailableError } from '@/lib/api/rag';
import type { RagCollection, RagDocumentWithCollections } from '@/lib/types/api';
import { DEFAULT_PAGE_SIZE, type TableQueryOptions } from '@/lib/types/table';
import { getAllRagDocuments, type PaginatedResult } from '@/lib/db/queries';

// ── Collections ─────────────────────────────────────────────────────────────

export async function listCollections(): Promise<RagCollection[]> {
  return (await ragGet('/collections')) as RagCollection[];
}

// Returns null when the RAG server is offline (silent — no thrown error).
export async function listCollectionsIfAvailable(): Promise<RagCollection[] | null> {
  try {
    return (await ragGet('/collections')) as RagCollection[];
  } catch (e) {
    if (e instanceof RagServiceUnavailableError) return null;
    throw e;
  }
}

export async function createCollection(name: string, description?: string): Promise<RagCollection> {
  return (await ragPost('/collections', { name, description })) as RagCollection;
}

export async function updateCollection(id: string, name?: string, description?: string): Promise<RagCollection> {
  return (await ragPut(`/collections/${encodeURIComponent(id)}`, { name, description })) as RagCollection;
}

export async function deleteCollection(id: string): Promise<void> {
  await ragDelete(`/collections/${encodeURIComponent(id)}`);
}

// ── Documents ───────────────────────────────────────────────────────────────

export async function getRagDocuments(
  options: TableQueryOptions = {}
): Promise<PaginatedResult<RagDocumentWithCollections>> {
  const result = await getAllRagDocuments({ limit: DEFAULT_PAGE_SIZE, offset: 0, ...options });
  return {
    data: result.data.map((row) => ({
      id: row.id,
      name: row.name,
      content_hash: row.contentHash,
      file_path: row.filePath,
      chunk_count: row.chunkCount,
      status: row.status as RagDocumentWithCollections['status'],
      error_message: row.errorMessage,
      zotero_item_key: row.zoteroItemKey,
      zotero_version: row.zoteroVersion,
      created_at: row.createdAt.toISOString(),
      collections: row.collections,
    })),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  };
}

export async function deleteDocument(documentId: string): Promise<void> {
  await ragDelete(`/documents/${encodeURIComponent(documentId)}`);
}

export async function addDocumentToCollection(collectionId: string, documentId: string): Promise<{ message: string }> {
  return (await ragPost(
    `/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`
  )) as { message: string };
}

export async function removeDocumentFromCollection(collectionId: string, documentId: string): Promise<void> {
  await ragDelete(`/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`);
}

// ── Search ─────────────────────────────────────────────────────────────────

export interface SearchResult {
  text: string;
  document_name: string;
  page_number: number | null;
  page_end: number | null;
  score: number;
  citation: string;
}

export async function searchCollections(
  query: string,
  collectionIds: string[],
  topK?: number,
  llmReranking?: boolean
): Promise<SearchResult[]> {
  return (await ragPost('/search', {
    query,
    collection_ids: collectionIds,
    top_k: topK,
    llm_reranking: llmReranking,
  })) as SearchResult[];
}
