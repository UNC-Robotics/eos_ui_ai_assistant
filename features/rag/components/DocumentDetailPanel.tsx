'use client';

import * as React from 'react';
import { X, Trash2, Download, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { deleteDocument, removeDocumentFromCollection, addDocumentToCollection } from '../api/collections';
import type { RagDocumentWithCollections, RagCollection } from '@/lib/types/api';
import { StatusBadge } from './StatusBadge';

interface DocumentDetailPanelProps {
  document: RagDocumentWithCollections;
  collections: RagCollection[];
  onClose: () => void;
  onRefresh: () => void;
}

export function DocumentDetailPanel({ document, collections, onClose, onRefresh }: DocumentDetailPanelProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  const assignedIds = new Set(document.collections.map((c) => c.id));
  const unassignedOptions: ComboboxOption[] = collections
    .filter((c) => !assignedIds.has(c.id))
    .map((c) => ({ value: c.id, label: c.name }));

  const handleAddToCollection = async (collectionId: string) => {
    setError(null);
    try {
      await addDocumentToCollection(collectionId, document.id);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add to collection');
    }
  };

  const handleRemoveFromCollection = async (collectionId: string) => {
    setError(null);
    try {
      await removeDocumentFromCollection(collectionId, document.id);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove from collection');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDocument(document.id);
      setConfirmDeleteOpen(false);
      onClose();
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete document');
    }
  };

  return (
    <>
      <div className="w-[28rem] shrink-0 border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto self-start">
        <div className="flex justify-end mb-1">
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 ring-offset-white dark:ring-offset-slate-900 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 text-gray-900 dark:text-gray-400"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className="mb-4">
          <div className="overflow-x-auto max-w-full pb-1 max-h-[5.25rem]">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{document.name}</h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={document.status} />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Download */}
        <div className="mb-4">
          <a href={`/api/files/download/${encodeURIComponent(document.file_path)}`} download={document.name}>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          </a>
        </div>

        {/* Document info */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Chunks</span>
            <span className="text-gray-900 dark:text-white tabular-nums">{document.chunk_count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Created</span>
            <span className="text-gray-900 dark:text-white">{new Date(document.created_at).toLocaleString()}</span>
          </div>
          {document.zotero_item_key && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 dark:text-gray-400">Source</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs">
                <Link2 className="h-3 w-3" />
                Zotero
              </span>
            </div>
          )}
          {document.error_message && (
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs">Error</span>
              <p className="text-red-600 dark:text-red-400 text-xs mt-1 break-all">{document.error_message}</p>
            </div>
          )}
        </div>

        {/* Collections */}
        <div className="mt-6 border-t border-gray-200 dark:border-slate-700 pt-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Collections</h3>

          {document.collections.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {document.collections.map((c) => (
                <Badge key={c.id} variant="default" className="flex items-center gap-1 pr-1">
                  {c.name}
                  <button
                    onClick={() => handleRemoveFromCollection(c.id)}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-3">Not assigned to any collection.</p>
          )}

          {unassignedOptions.length > 0 && (
            <Combobox
              options={unassignedOptions}
              onChange={handleAddToCollection}
              placeholder="Add to collection..."
              searchPlaceholder="Search collections..."
              emptyText="No more collections"
            />
          )}
        </div>

        {/* Delete */}
        <div className="mt-8 border-t border-gray-200 dark:border-slate-700 pt-4">
          <Button variant="destructive" size="sm" onClick={() => setConfirmDeleteOpen(true)} className="w-full">
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Document
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Document"
        message={`Delete "${document.name}" and all its chunks? This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </>
  );
}
