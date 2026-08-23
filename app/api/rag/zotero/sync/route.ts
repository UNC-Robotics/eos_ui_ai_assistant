import { NextRequest } from 'next/server';
import { eq, and, isNotNull } from 'drizzle-orm';
import { createHash } from 'crypto';
import { db } from '@/lib/db/client';
import { ragCollections, ragDocuments, ragCollectionDocuments } from '@/lib/db/schema';
import {
  isZoteroAvailable,
  getAllZoteroCollectionItems,
  downloadZoteroPdf,
  buildDocumentName,
  parseCollectionRef,
} from '@/lib/api/zotero';
import { ragDelete as ragServerDelete } from '@/lib/api/rag';

const RAG_UPLOAD_URL = `${process.env.RAG_SERVER_URL || 'http://localhost:8071'}/documents/upload`;

interface SyncEvent {
  type: 'progress' | 'done' | 'error';
  phase?: 'scanning' | 'syncing';
  total?: number;
  completed?: number;
  added?: number;
  updated?: number;
  skipped?: number;
  errors?: string[];
  message?: string;
}

function encodeSyncEvent(event: SyncEvent): string {
  return JSON.stringify(event) + '\n';
}

async function uploadToRagServer(
  pdfBuffer: Buffer,
  filename: string,
  collectionId: string
): Promise<{ id: string } | null> {
  const formData = new FormData();
  formData.append('data', new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }), filename);
  formData.append('collection_ids', collectionId);

  const resp = await fetch(RAG_UPLOAD_URL, { method: 'POST', body: formData });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`RAG upload failed (${resp.status}): ${text}`);
  }

  const docs = (await resp.json()) as { id: string }[];
  return docs[0] ?? null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const collectionId = body.collectionId as string;

  if (!collectionId) {
    return new Response(JSON.stringify({ error: 'collectionId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SyncEvent) => controller.enqueue(new TextEncoder().encode(encodeSyncEvent(event)));

      try {
        // 1. Load EOS collection
        const [collection] = await db.select().from(ragCollections).where(eq(ragCollections.id, collectionId)).limit(1);

        if (!collection?.zoteroCollectionKey) {
          send({ type: 'error', message: 'Collection is not linked to a Zotero collection' });
          controller.close();
          return;
        }

        // 2. Check Zotero availability
        if (!(await isZoteroAvailable())) {
          send({ type: 'error', message: 'Zotero is not running. Open the Zotero desktop app and try again.' });
          controller.close();
          return;
        }

        // 3. Fetch all Zotero items with attachments (single call per collection)
        send({ type: 'progress', phase: 'scanning' });
        const { base: libraryBase } = parseCollectionRef(collection.zoteroCollectionKey);
        const itemsWithAttachments = await getAllZoteroCollectionItems(collection.zoteroCollectionKey);

        send({ type: 'progress', phase: 'scanning', total: itemsWithAttachments.length });

        // 4. Load existing synced documents for this collection
        const existingDocs = await db
          .select({
            docId: ragDocuments.id,
            zoteroItemKey: ragDocuments.zoteroItemKey,
            zoteroVersion: ragDocuments.zoteroVersion,
            contentHash: ragDocuments.contentHash,
          })
          .from(ragDocuments)
          .innerJoin(ragCollectionDocuments, eq(ragDocuments.id, ragCollectionDocuments.documentId))
          .where(and(eq(ragCollectionDocuments.collectionId, collectionId), isNotNull(ragDocuments.zoteroItemKey)));

        const existingMap = new Map(
          existingDocs.map((d) => [d.zoteroItemKey!, { docId: d.docId, version: d.zoteroVersion, hash: d.contentHash }])
        );

        // 5. Process each item
        let added = 0;
        let updated = 0;
        let skipped = 0;
        let completed = 0;
        const errors: string[] = [];
        const total = itemsWithAttachments.length;

        for (const { item, pdfAttachment } of itemsWithAttachments) {
          try {
            const existing = existingMap.get(item.key);

            // Same version — skip
            if (existing && existing.version === item.version) {
              skipped++;
              completed++;
              send({ type: 'progress', phase: 'syncing', completed, added, skipped, total });
              continue;
            }

            // No PDF attachment — skip
            if (!pdfAttachment) {
              skipped++;
              completed++;
              send({ type: 'progress', phase: 'syncing', completed, added, skipped, total });
              continue;
            }

            // Download PDF
            let pdfBuffer: Buffer;
            try {
              pdfBuffer = await downloadZoteroPdf(pdfAttachment.key, libraryBase);
            } catch (dlErr) {
              if (dlErr instanceof Error && dlErr.message.includes('not available locally')) {
                skipped++;
                completed++;
                send({ type: 'progress', phase: 'syncing', completed, added, skipped, total });
                continue;
              }
              throw dlErr;
            }
            const hash = createHash('sha256').update(pdfBuffer).digest('hex');
            const docName = buildDocumentName(item, pdfAttachment.data.filename);

            if (existing) {
              if (hash === existing.hash) {
                // PDF unchanged — just update version
                await db
                  .update(ragDocuments)
                  .set({ zoteroVersion: item.version })
                  .where(eq(ragDocuments.id, existing.docId));
                skipped++;
              } else {
                // PDF changed — delete old, upload new
                await ragServerDelete(`/documents/${existing.docId}`);
                const newDoc = await uploadToRagServer(pdfBuffer, docName, collectionId);
                if (newDoc) {
                  await db
                    .update(ragDocuments)
                    .set({ zoteroItemKey: item.key, zoteroVersion: item.version })
                    .where(eq(ragDocuments.id, newDoc.id));
                }
                updated++;
              }
            } else {
              const newDoc = await uploadToRagServer(pdfBuffer, docName, collectionId);
              if (newDoc) {
                await db
                  .update(ragDocuments)
                  .set({ zoteroItemKey: item.key, zoteroVersion: item.version })
                  .where(eq(ragDocuments.id, newDoc.id));
              }
              added++;
            }
          } catch (e) {
            const title = item.data.title ?? item.key;
            errors.push(`${title}: ${e instanceof Error ? e.message : 'Unknown error'}`);
          }

          completed++;
          send({ type: 'progress', phase: 'syncing', completed, added, updated, skipped, total });
        }

        // 6. Update last synced timestamp
        await db
          .update(ragCollections)
          .set({ zoteroLastSynced: new Date() })
          .where(eq(ragCollections.id, collectionId));

        send({ type: 'done', added, updated, skipped, errors });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'Sync failed' });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}
