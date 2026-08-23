'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Pencil, Trash2, Check, Plus, RefreshCw, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { createCollection, updateCollection, deleteCollection } from '../api/collections';
import { linkZoteroCollection, unlinkZoteroCollection } from '../api/zotero-sync';
import { ZoteroCollectionPicker } from './ZoteroCollectionPicker';
import type { RagCollection } from '@/lib/types/api';

interface SyncProgress {
  phase: 'scanning' | 'syncing' | 'done' | 'error';
  total?: number;
  completed?: number;
  added?: number;
  updated?: number;
  skipped?: number;
  errors?: string[];
  message?: string;
}

interface CollectionsManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: RagCollection[];
  onRefresh: () => void;
}

export function CollectionsManagementDialog({
  open,
  onOpenChange,
  collections,
  onRefresh,
}: CollectionsManagementDialogProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newDescription, setNewDescription] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [linkingId, setLinkingId] = React.useState<string | null>(null);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [syncProgress, setSyncProgress] = React.useState<SyncProgress | null>(null);

  const startRename = (c: RagCollection) => {
    setEditingId(c.id);
    setEditName(c.name);
  };

  const handleRename = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await updateCollection(id, trimmed);
      setEditingId(null);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename collection');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete collection "${name}" and remove all document associations?`)) return;
    setError(null);
    try {
      await deleteCollection(id);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete collection');
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createCollection(newName.trim(), newDescription.trim() || undefined);
      setNewName('');
      setNewDescription('');
      setShowCreate(false);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create collection');
    } finally {
      setCreating(false);
    }
  };

  const handleLink = async (collectionId: string, zoteroKey: string) => {
    setError(null);
    try {
      await linkZoteroCollection(collectionId, zoteroKey);
      setLinkingId(null);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link Zotero collection');
    }
  };

  const handleUnlink = async (collectionId: string) => {
    setError(null);
    try {
      await unlinkZoteroCollection(collectionId);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlink Zotero collection');
    }
  };

  const handleSync = async (collectionId: string) => {
    setSyncingId(collectionId);
    setSyncProgress({ phase: 'scanning' });
    setError(null);

    try {
      const resp = await fetch('/api/rag/zotero/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId }),
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => 'Sync failed');
        setError(text);
        setSyncingId(null);
        setSyncProgress(null);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'error') {
              setError(event.message);
              setSyncProgress(null);
              setSyncingId(null);
              return;
            }
            if (event.type === 'progress') {
              setSyncProgress({
                phase: event.phase,
                total: event.total,
                completed: event.completed,
                added: event.added,
                updated: event.updated,
                skipped: event.skipped,
              });
            }
            if (event.type === 'done') {
              setSyncProgress({
                phase: 'done',
                added: event.added,
                updated: event.updated,
                skipped: event.skipped,
                errors: event.errors,
              });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
      setSyncProgress(null);
    } finally {
      setSyncingId(null);
      onRefresh();
    }
  };

  const formatSyncProgress = (): string => {
    if (!syncProgress) return '';
    if (syncProgress.phase === 'scanning') {
      return syncProgress.total != null ? `Scanning... ${syncProgress.total} items found` : 'Scanning Zotero...';
    }
    if (syncProgress.phase === 'syncing') {
      const parts = [`${syncProgress.completed ?? 0} of ${syncProgress.total ?? '?'}`];
      if (syncProgress.skipped) parts.push(`${syncProgress.skipped} skipped`);
      return `Syncing ${parts.join(', ')}...`;
    }
    if (syncProgress.phase === 'done') {
      const parts: string[] = [];
      if (syncProgress.added) parts.push(`${syncProgress.added} added`);
      if (syncProgress.updated) parts.push(`${syncProgress.updated} updated`);
      if (syncProgress.skipped) parts.push(`${syncProgress.skipped} skipped`);
      if (syncProgress.errors?.length) parts.push(`${syncProgress.errors.length} failed`);
      return parts.length > 0 ? parts.join(', ') : 'Everything up to date';
    }
    return '';
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] bg-white dark:bg-slate-900 rounded-lg shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
              Manage Collections
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(!showCreate)}>
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
              <Dialog.Close asChild>
                <button className="rounded-sm opacity-70 hover:opacity-100 transition-opacity text-gray-900 dark:text-gray-400">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto">
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Sync progress banner */}
            {syncProgress && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg text-sm">
                <div className="flex items-center gap-2">
                  {syncProgress.phase !== 'done' && <RefreshCw className="h-3.5 w-3.5 animate-spin flex-shrink-0" />}
                  <span>{formatSyncProgress()}</span>
                </div>
                {syncProgress.phase === 'syncing' && syncProgress.total && (
                  <div className="mt-2 h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${((syncProgress.completed ?? 0) / syncProgress.total) * 100}%` }}
                    />
                  </div>
                )}
                {syncProgress.phase === 'done' && syncProgress.errors && syncProgress.errors.length > 0 && (
                  <div className="mt-2 text-xs text-red-600 dark:text-red-400 space-y-0.5 max-h-32 overflow-y-auto">
                    {syncProgress.errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                )}
                {syncProgress.phase === 'done' && (
                  <button
                    onClick={() => setSyncProgress(null)}
                    className="mt-2 text-xs text-blue-600 dark:text-blue-300 hover:underline"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}

            {/* Create form */}
            {showCreate && (
              <div className="mb-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Catalyst Screening Papers"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Description (optional)</Label>
                    <Textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Papers about catalyst screening..."
                      className="text-sm min-h-[60px]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={handleCreate} disabled={creating || !newName.trim()}>
                      {creating ? 'Creating...' : 'Create'}
                    </Button>
                    <Button variant="default" size="sm" onClick={() => setShowCreate(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Collections list */}
            {collections.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No collections yet.</p>
            ) : (
              <div className="space-y-2">
                {collections.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        {editingId === c.id ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(c.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="text-sm font-medium h-8"
                            autoFocus
                          />
                        ) : (
                          <div className="font-medium text-gray-900 dark:text-white text-sm">{c.name}</div>
                        )}
                        {c.description && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {c.description}
                          </div>
                        )}
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {c.document_count} document{c.document_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {editingId === c.id ? (
                          <>
                            <button
                              onClick={() => handleRename(c.id)}
                              disabled={!editName.trim()}
                              className="p-1.5 text-green-600 hover:text-green-700 dark:text-green-400 transition-colors disabled:opacity-30"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            {c.zotero_collection_key ? (
                              <button
                                onClick={() => handleSync(c.id)}
                                disabled={syncingId !== null}
                                className="p-1.5 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors disabled:opacity-30"
                                title="Sync from Zotero"
                              >
                                <RefreshCw className={`h-4 w-4 ${syncingId === c.id ? 'animate-spin' : ''}`} />
                              </button>
                            ) : (
                              <button
                                onClick={() => setLinkingId(linkingId === c.id ? null : c.id)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title="Link to Zotero collection"
                              >
                                <Link2 className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => startRename(c)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(c.id, c.name)}
                              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Zotero link status */}
                    {c.zotero_collection_key && editingId !== c.id && (
                      <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                          <Link2 className="h-3 w-3" />
                          Zotero linked
                        </span>
                        {c.zotero_last_synced && (
                          <span className="text-gray-400">
                            Synced {new Date(c.zotero_last_synced).toLocaleString()}
                          </span>
                        )}
                        <button
                          onClick={() => handleUnlink(c.id)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Unlink className="h-3 w-3" />
                          Unlink
                        </button>
                      </div>
                    )}

                    {/* Zotero collection picker (inline) */}
                    {linkingId === c.id && (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-700">
                        <Label className="text-xs mb-1 block">Link to Zotero collection</Label>
                        <ZoteroCollectionPicker onSelect={(key) => handleLink(c.id, key)} />
                        <button
                          onClick={() => setLinkingId(null)}
                          className="mt-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
