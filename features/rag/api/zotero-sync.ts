'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { ragCollections } from '@/lib/db/schema';

export async function linkZoteroCollection(eosCollectionId: string, zoteroCollectionKey: string): Promise<void> {
  await db
    .update(ragCollections)
    .set({ zoteroCollectionKey, zoteroLastSynced: null })
    .where(eq(ragCollections.id, eosCollectionId));
}

export async function unlinkZoteroCollection(eosCollectionId: string): Promise<void> {
  await db
    .update(ragCollections)
    .set({ zoteroCollectionKey: null, zoteroLastSynced: null })
    .where(eq(ragCollections.id, eosCollectionId));
}
