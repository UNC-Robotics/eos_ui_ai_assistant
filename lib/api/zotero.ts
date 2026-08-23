/**
 * Zotero Local API Client (server-side only)
 *
 * Talks to the Zotero desktop app's built-in HTTP server at localhost:23119.
 * Requires Zotero 7+ with "Allow other applications on this computer to
 * communicate with Zotero" enabled in Settings > Advanced.
 *
 * Supports both personal library and group libraries.
 */

const ZOTERO_HOST = 'http://localhost:23119';
const ZOTERO_TIMEOUT = 5000;

function userLibraryBase(): string {
  return `${ZOTERO_HOST}/api/users/0`;
}

function groupLibraryBase(groupId: number): string {
  return `${ZOTERO_HOST}/api/groups/${groupId}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface ZoteroCollection {
  key: string;
  version: number;
  data: {
    key: string;
    name: string;
    parentCollection: string | false;
  };
  meta: {
    numCollections: number;
    numItems: number;
  };
}

export interface ZoteroGroup {
  id: number;
  version: number;
  data: {
    id: number;
    name: string;
  };
  meta: {
    numItems: number;
  };
}

export interface ZoteroCreator {
  creatorType: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export interface ZoteroItem {
  key: string;
  version: number;
  data: {
    key: string;
    itemType: string;
    title?: string;
    creators?: ZoteroCreator[];
    date?: string;
    DOI?: string;
    url?: string;
    // Attachment-specific fields
    contentType?: string;
    filename?: string;
    linkMode?: string;
    parentItem?: string;
  };
}

/** A collection from any library, enriched with library context for the UI. */
export interface ZoteroLibraryCollection {
  ref: string; // Encoded ref for storage ("KEY" or "g:GROUPID:KEY")
  key: string; // Raw Zotero collection key
  name: string;
  parentCollection: string | false;
  numItems: number;
  library: string; // Display name: "My Library" or group name
}

// ── Collection ref encoding ───────────────────────────────────────────────

/** Parse a stored collection ref into a library base URL and raw key. */
export function parseCollectionRef(ref: string): { base: string; collectionKey: string } {
  const match = ref.match(/^g:(\d+):(.+)$/);
  if (match) {
    return { base: groupLibraryBase(parseInt(match[1])), collectionKey: match[2] };
  }
  return { base: userLibraryBase(), collectionKey: ref };
}

/** Encode a collection key with library context for DB storage. */
export function encodeCollectionRef(collectionKey: string, groupId?: number): string {
  return groupId != null ? `g:${groupId}:${collectionKey}` : collectionKey;
}

// ── Internal helpers ───────────────────────────────────────────────────────

async function zoteroFetch(url: string, timeout = ZOTERO_TIMEOUT): Promise<Response> {
  return fetch(url, {
    headers: { Host: 'localhost:23119' },
    signal: AbortSignal.timeout(timeout),
    cache: 'no-store',
  });
}

async function zoteroGet<T>(path: string, base = userLibraryBase()): Promise<T> {
  const resp = await zoteroFetch(`${base}${path}`);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Zotero API error (${resp.status}): ${text}`);
  }
  return resp.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function isZoteroAvailable(): Promise<boolean> {
  try {
    const resp = await zoteroFetch(`${userLibraryBase()}/collections?limit=1`, 2000);
    return resp.ok;
  } catch {
    return false;
  }
}

export async function getZoteroGroups(): Promise<ZoteroGroup[]> {
  return zoteroGet<ZoteroGroup[]>('/groups');
}

export async function getZoteroCollections(): Promise<ZoteroCollection[]> {
  return zoteroGet<ZoteroCollection[]>('/collections');
}

export async function getZoteroSubcollections(collectionKey: string, base?: string): Promise<ZoteroCollection[]> {
  return zoteroGet<ZoteroCollection[]>(`/collections/${collectionKey}/collections`, base);
}

/**
 * Fetch all collections from personal library and all group libraries.
 * Returns a flat list with library context for UI grouping.
 */
export async function getAllLibraryCollections(): Promise<ZoteroLibraryCollection[]> {
  const results: ZoteroLibraryCollection[] = [];

  // Fetch personal collections and groups list in parallel
  const [userCollections, groups] = await Promise.all([
    getZoteroCollections(),
    getZoteroGroups().catch(() => [] as ZoteroGroup[]),
  ]);

  for (const c of userCollections) {
    results.push({
      ref: c.key,
      key: c.key,
      name: c.data.name,
      parentCollection: c.data.parentCollection,
      numItems: c.meta.numItems,
      library: 'My Library',
    });
  }

  // Fetch all group collections in parallel
  const groupResults = await Promise.all(
    groups.map(async (group) => {
      try {
        const collections = await zoteroGet<ZoteroCollection[]>('/collections', groupLibraryBase(group.data.id));
        return collections.map((c): ZoteroLibraryCollection => ({
          ref: encodeCollectionRef(c.key, group.data.id),
          key: c.key,
          name: c.data.name,
          parentCollection: c.data.parentCollection,
          numItems: c.meta.numItems,
          library: group.data.name,
        }));
      } catch {
        return [];
      }
    })
  );

  for (const groupCollections of groupResults) {
    results.push(...groupCollections);
  }

  return results;
}

/** Fetch ALL items (parents + attachments) from a collection in one call. */
async function getZoteroCollectionAllItems(collectionKey: string, base?: string): Promise<ZoteroItem[]> {
  return zoteroGet<ZoteroItem[]>(`/collections/${collectionKey}/items`, base);
}

export interface ZoteroItemWithAttachment {
  item: ZoteroItem;
  pdfAttachment: ZoteroItem | null;
}

/**
 * Recursively fetch all items from a collection and its subcollections.
 * Accepts an encoded collection ref (e.g., "KEY" or "g:123:KEY").
 * Returns parent items with their PDF attachments pre-resolved (no N+1).
 */
export async function getAllZoteroCollectionItems(ref: string): Promise<ZoteroItemWithAttachment[]> {
  const { base, collectionKey } = parseCollectionRef(ref);
  const allItems = new Map<string, ZoteroItem>();

  async function collect(key: string): Promise<void> {
    const [items, subcollections] = await Promise.all([
      getZoteroCollectionAllItems(key, base),
      getZoteroSubcollections(key, base),
    ]);

    for (const item of items) {
      if (!allItems.has(item.key)) {
        allItems.set(item.key, item);
      }
    }

    await Promise.all(subcollections.map((sub) => collect(sub.key)));
  }

  await collect(collectionKey);

  // Separate parents from attachments and correlate
  const parents: ZoteroItem[] = [];
  const attachmentsByParent = new Map<string, ZoteroItem[]>();

  for (const item of allItems.values()) {
    if (item.data.itemType === 'attachment' || item.data.itemType === 'note') {
      if (item.data.parentItem) {
        const list = attachmentsByParent.get(item.data.parentItem) ?? [];
        list.push(item);
        attachmentsByParent.set(item.data.parentItem, list);
      }
    } else {
      parents.push(item);
    }
  }

  return parents.map((item) => {
    const children = attachmentsByParent.get(item.key) ?? [];
    const pdfAttachment =
      children.find(
        (c) =>
          c.data.contentType === 'application/pdf' &&
          (c.data.linkMode === 'imported_file' || c.data.linkMode === 'imported_url')
      ) ?? null;
    return { item, pdfAttachment };
  });
}

export async function downloadZoteroPdf(attachmentKey: string, libraryBase?: string): Promise<Buffer> {
  const base = libraryBase ?? userLibraryBase();
  const url = `${base}/items/${attachmentKey}/file`;
  const resp = await fetch(url, {
    headers: { Host: 'localhost:23119' },
    signal: AbortSignal.timeout(60_000),
    cache: 'no-store',
    redirect: 'manual',
  });

  // Zotero returns a 302 redirect to a file:// URL for local storage
  if (resp.status === 302) {
    const location = resp.headers.get('Location');
    if (location?.startsWith('file://')) {
      const { readFile, access } = await import('fs/promises');
      const filePath = decodeURIComponent(new URL(location).pathname);
      try {
        await access(filePath);
      } catch {
        throw new Error('PDF not available locally (not synced from Zotero cloud)');
      }
      return readFile(filePath);
    }
    throw new Error(`Unexpected redirect: ${location}`);
  }

  if (!resp.ok) {
    throw new Error(`Failed to download PDF (${resp.status})`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Build a human-readable document name from Zotero metadata.
 * Format: "Title (FirstAuthor, Year).pdf"
 */
export function buildDocumentName(item: ZoteroItem, fallbackFilename?: string): string {
  const title = item.data.title?.trim();
  const creators = item.data.creators ?? [];
  const firstAuthor = creators[0]?.lastName ?? creators[0]?.name ?? '';
  const year = item.data.date?.match(/\d{4}/)?.[0] ?? '';

  if (title) {
    const parts = [firstAuthor, year].filter(Boolean).join(', ');
    const suffix = parts ? ` (${parts})` : '';
    return `${title}${suffix}.pdf`;
  }

  return fallbackFilename ?? `${item.key}.pdf`;
}
