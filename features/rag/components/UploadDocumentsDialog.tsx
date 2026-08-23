'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Upload, X, FileText, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MultiCombobox } from '@/components/ui/MultiCombobox';
import type { RagCollection } from '@/lib/types/api';

interface UploadDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: RagCollection[];
  onSuccess: () => void;
}

const ACCEPT = '.pdf,.docx,.doc,.txt,.md,.html,.pptx';
const UPLOAD_CONCURRENCY = 3;

type UploadState = 'idle' | 'uploading' | 'done';

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onSettled?: (result: PromiseSettledResult<T>, index: number) => void
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      try {
        const value = await tasks[i]();
        results[i] = { status: 'fulfilled', value };
        onSettled?.(results[i], i);
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
        onSettled?.(results[i], i);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

function fileKey(f: File) {
  return f.name + f.size;
}

export function UploadDocumentsDialog({ open, onOpenChange, collections, onSuccess }: UploadDocumentsDialogProps) {
  const [selectedCollectionIds, setSelectedCollectionIds] = React.useState<string[]>([]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploadState, setUploadState] = React.useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = React.useState({ completed: 0, failed: 0, total: 0 });
  const [fileErrors, setFileErrors] = React.useState<Map<string, string>>(new Map());
  const [successKeys, setSuccessKeys] = React.useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const collectionOptions = collections.map((c) => ({ value: c.id, label: c.name }));

  const addFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => fileKey(f)));
      return [...prev, ...arr.filter((f) => !existing.has(fileKey(f)))];
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    if (selectedCollectionIds.length === 0 || files.length === 0) return;

    setUploadState('uploading');
    setUploadProgress({ completed: 0, failed: 0, total: files.length });
    setFileErrors(new Map());
    setSuccessKeys(new Set());

    const tasks = files.map((file) => async () => {
      const formData = new FormData();
      formData.append('data', file);
      for (const id of selectedCollectionIds) {
        formData.append('collection_ids', id);
      }
      const resp = await fetch('/api/rag/documents/upload', {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Upload failed (${resp.status})`);
      }
      return resp.json();
    });

    const results = await runWithConcurrency(tasks, UPLOAD_CONCURRENCY, (result, index) => {
      setUploadProgress((prev) => ({
        ...prev,
        completed: prev.completed + 1,
        failed: prev.failed + (result.status === 'rejected' ? 1 : 0),
      }));
      const key = fileKey(files[index]);
      if (result.status === 'rejected') {
        const msg = result.reason instanceof Error ? result.reason.message : 'Upload failed';
        setFileErrors((prev) => new Map(prev).set(key, msg));
      } else {
        setSuccessKeys((prev) => new Set(prev).add(key));
      }
    });

    const allSucceeded = results.every((r) => r.status === 'fulfilled');

    if (allSucceeded) {
      setFiles([]);
      setSelectedCollectionIds([]);
      onOpenChange(false);
      onSuccess();
    } else {
      setUploadState('done');
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && uploadState === 'uploading') return;
    onOpenChange(nextOpen);
  };

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setFiles([]);
      setUploadState('idle');
      setUploadProgress({ completed: 0, failed: 0, total: 0 });
      setFileErrors(new Map());
      setSuccessKeys(new Set());
      setSelectedCollectionIds([]);
    }
  }, [open]);

  const isUploading = uploadState === 'uploading';

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] bg-white dark:bg-slate-900 rounded-lg shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
              Upload Documents
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded-sm opacity-70 hover:opacity-100 transition-opacity text-gray-900 dark:text-gray-400"
                disabled={isUploading}
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="p-6 space-y-4">
            {/* Error summary */}
            {uploadState === 'done' && uploadProgress.failed > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {uploadProgress.failed} of {uploadProgress.total} file{uploadProgress.total !== 1 ? 's' : ''} failed to
                upload
              </div>
            )}

            {/* Collection selector */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Collections</label>
              <MultiCombobox
                options={collectionOptions}
                value={selectedCollectionIds}
                onChange={setSelectedCollectionIds}
                placeholder="Select collections..."
                searchPlaceholder="Search collections..."
                emptyText="No collections found"
              />
            </div>

            {/* Drop zone */}
            {!isUploading && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`p-6 border-2 border-dashed rounded-lg text-center transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                    : 'border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-500'
                }`}
              >
                <Upload className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Drag & drop files here</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />
                <Button variant="default" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Browse Files
                </Button>
                <p className="text-xs text-gray-400 mt-2">PDF, DOCX, TXT, MD, HTML, PPTX</p>
              </div>
            )}

            {/* Progress bar during upload */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Uploading...</span>
                  <span>
                    {uploadProgress.completed} of {uploadProgress.total}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Selected files */}
            {files.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {files.map((f, i) => {
                  const key = fileKey(f);
                  const error = fileErrors.get(key);
                  const succeeded = successKeys.has(key);
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-800 rounded text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate text-gray-700 dark:text-gray-300">{f.name}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isUploading && !succeeded && !error && (
                          <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />
                        )}
                        {succeeded && <Check className="h-3.5 w-3.5 text-green-500" />}
                        {error && (
                          <span title={error}>
                            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                          </span>
                        )}
                        {!isUploading && !succeeded && (
                          <button
                            onClick={() => removeFile(i)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Dialog.Close asChild>
                <Button variant="outline" disabled={isUploading}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={isUploading || selectedCollectionIds.length === 0 || files.length === 0}
              >
                {isUploading
                  ? `Uploading ${uploadProgress.completed} of ${uploadProgress.total}...`
                  : `Upload ${files.length > 0 ? `(${files.length})` : ''}`}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
