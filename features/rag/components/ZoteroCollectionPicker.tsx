'use client';

import * as React from 'react';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import type { ZoteroLibraryCollection } from '@/lib/api/zotero';

interface ZoteroCollectionPickerProps {
  onSelect: (collectionRef: string) => void;
  className?: string;
}

/** Build a flat list grouped by library with indentation for subcollections. */
function buildHierarchicalOptions(collections: ZoteroLibraryCollection[]): ComboboxOption[] {
  // Group by library, preserving insertion order (My Library first, then groups)
  const byLibrary = new Map<string, ZoteroLibraryCollection[]>();
  for (const c of collections) {
    const list = byLibrary.get(c.library) ?? [];
    list.push(c);
    byLibrary.set(c.library, list);
  }

  const options: ComboboxOption[] = [];

  for (const [library, libCollections] of byLibrary) {
    const childrenOf = new Map<string | false, ZoteroLibraryCollection[]>();
    for (const c of libCollections) {
      const parent = c.parentCollection || false;
      const siblings = childrenOf.get(parent) ?? [];
      siblings.push(c);
      childrenOf.set(parent, siblings);
    }

    for (const children of childrenOf.values()) {
      children.sort((a, b) => a.name.localeCompare(b.name));
    }

    function walk(parentKey: string | false, depth: number) {
      const children = childrenOf.get(parentKey) ?? [];
      for (const c of children) {
        const indent = '\u00A0\u00A0\u00A0'.repeat(depth);
        options.push({
          value: c.ref,
          label: `${indent}${c.name}`,
          description: `${c.numItems} item${c.numItems !== 1 ? 's' : ''}`,
          group: library,
        });
        walk(c.key, depth + 1);
      }
    }

    walk(false, 0);
  }

  return options;
}

export function ZoteroCollectionPicker({ onSelect, className }: ZoteroCollectionPickerProps) {
  const [collections, setCollections] = React.useState<ZoteroLibraryCollection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch('/api/rag/zotero/collections', { cache: 'no-store' });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({ error: 'Failed to fetch' }));
          throw new Error(data.error || `Error ${resp.status}`);
        }
        const data = await resp.json();
        if (!cancelled) setCollections(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load Zotero collections');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-xs text-gray-400">Loading Zotero collections...</p>;
  }

  if (error) {
    return <p className="text-xs text-red-500">{error}</p>;
  }

  const options = buildHierarchicalOptions(collections);

  return (
    <Combobox
      options={options}
      onChange={(ref) => onSelect(ref)}
      placeholder="Select Zotero collection..."
      searchPlaceholder="Search collections..."
      emptyText="No collections found"
      className={className}
    />
  );
}
